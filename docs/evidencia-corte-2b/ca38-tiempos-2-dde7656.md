# CA-38 — tiempos, segunda medición (JAR de `dde7656`, con DEV-05 corregido)

20/11/2026, de 10:38 a 11:34. Datos crudos: `output/ensayo/tiempos-corte2b-1cc9a3.json` (fuera de git).

- Mismo comando y mismo método que en la primera medición (`ca38-tiempos-1-ecd91a5.md`): 300 muestras por caso, 30 de calentamiento y casos intercalados al azar.
- Backend: `Commit del JAR: dde7656… dirty=false`.
- La corrida duró 56 minutos; la primera, 16. No se investigó por qué; los milisegundos absolutos de las dos corridas no se comparan entre sí, solo dentro de cada familia.

## Resultados (ms)

| Familia | Caso | Estado | Mediana | p10 | p90 | Diferencia de medianas contra la referencia | IC 95 % |
|---|---|---|---|---|---|---|---|
| Ingreso con contraseña errónea | activa (referencia) | 401 ×300 | 267,3 | 228,0 | 383,5 | — | — |
| | inexistente | 401 ×300 | 268,4 | 227,2 | 403,1 | +1,1 | −15,6 a +18,1 |
| | inactiva | 401 ×300 | 261,9 | 226,9 | 397,6 | −5,4 | −20,1 a +12,3 |
| Pedido del enlace | inexistente (referencia) | 202 ×300 | 18,7 | 13,9 | 30,9 | — | — |
| | activa, dominio reservado | 202 ×300 | 19,3 | 13,7 | 28,8 | +0,6 | −0,3 a +1,3 |
| | inactiva | 202 ×300 | 19,1 | 13,4 | 27,9 | +0,4 | −0,4 a +1,5 |
| | activa que envía | 202 ×300 | 19,6 | 13,9 | 28,4 | +0,9 | −0,1 a +1,5 |
| Mensaje de bloqueo (429) | cuenta (referencia) | 429 ×300 | 11,8 | 8,5 | 16,8 | — | — |
| | inexistente | 429 ×300 | 11,7 | 8,7 | 16,9 | −0,1 | −0,6 a +0,4 |
| Enlace que no sirve (check) | inventado (referencia) | 400 ×300 | 22,9 | 16,6 | 34,5 | — | — |
| | ya usado | 400 ×300 | 22,9 | 16,6 | 33,8 | 0,0 | −1,5 a +1,2 |

- En cada caso, las 300 respuestas tuvieron el mismo estado y el mismo cuerpo, byte a byte.
- **Todos los intervalos pasan por cero.**
- El de la cuenta activa que envía queda cerca del borde (−0,1 a +1,5). Ahora la diferencia no depende del número de pedido:

| Pedido | n | Activa que envía | Inexistente, mismo tramo | Diferencia |
|---|---|---|---|---|
| 1.º | 71 | 19,6 | 18,7 | +0,9 |
| 2.º | 101 | 21,6 | 21,8 | −0,2 |
| 3.º | 101 | 18,6 | 18,4 | +0,2 |
| 4.º (pasa el límite) | 27 | 16,8 | 17,1 | −0,2 |

Antes del arreglo, el 2.º y el 3.º pedido marcaban +5,2 y +2,3 ms.

## El reemplazo sigue funcionando

Filas del grupo de cuentas que envían, al terminar:

- 181 DESCARTADO REEMPLAZADO;
- 21 ENVIADO;
- 27 OMITIDO LIMITE_POR_CORREO;
- 101 PENDIENTE, a la espera del tope de 30 por hora.

Ahora el reemplazo lo hace el proceso de envío. Lo prueban, además:

- la suite: `aNewRequestCancelsTheOneStillWaiting` y `anOlderRequestWaitingForARetryDoesNotGoOutAfterTheNewerOne`;
- la sección 3 del recorrido completo (`recuperacion-e2e-2026-11-20-dde7656.md`).

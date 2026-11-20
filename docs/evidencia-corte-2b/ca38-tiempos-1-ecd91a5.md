# CA-38 — tiempos, primera medición (JAR de `ecd91a5`, antes de DEV-05)

20/11/2026, 10:07 a 10:23. Datos crudos: `output/ensayo/tiempos-corte2b-a165d8.json` (fuera de git).

Comando:

```powershell
node backend/scripts/ensayo/tiempos-corte2b.mjs output/ensayo 300 correo-ensayo.lan
```

## Método

- Se toman 300 muestras por caso, después de 30 pedidos de calentamiento.
- Los casos se intercalan en orden al azar en cada vuelta.
- Cada pedido usa una conexión y una sesión nuevas.
- Las cuentas se reparten en un grupo de 101, para que el bloqueo de 5 fallos no conteste en lugar de la comprobación.
- Se compara la diferencia de medianas, con un intervalo bootstrap de 95 % (2000 remuestreos).
- `correo-ensayo.lan` es un dominio no reservado. Lo atrapa el servidor de correo falso, así que la cuenta activa de ese dominio recorre el camino real: fila pendiente y envío.
- Carga y servidor corren en la misma PC (12 CPU lógicas): los milisegundos son de esta máquina, no del VPS.

## Resultados (ms)

| Familia | Caso | Estado | Mediana | p10 | p90 | Diferencia de medianas contra la referencia | IC 95 % |
|---|---|---|---|---|---|---|---|
| Ingreso con contraseña errónea | activa (referencia) | 401 ×300 | 491,0 | 332,3 | 826,1 | — | — |
| | inexistente | 401 ×300 | 504,2 | 327,6 | 872,6 | +13,3 | −13,1 a +44,3 |
| | inactiva | 401 ×300 | 500,9 | 327,3 | 853,1 | +9,9 | −20,0 a +40,2 |
| Pedido del enlace | inexistente (referencia) | 202 ×300 | 29,1 | 18,0 | 64,1 | — | — |
| | activa, dominio reservado | 202 ×300 | 28,3 | 17,8 | 66,4 | −0,8 | −2,9 a +1,9 |
| | inactiva | 202 ×300 | 29,7 | 18,8 | 74,9 | +0,6 | −1,7 a +3,5 |
| | **activa que envía** | 202 ×300 | 32,0 | 19,5 | 70,6 | **+2,9** | **+0,7 a +5,8** |
| Mensaje de bloqueo (429) | cuenta (referencia) | 429 ×300 | 14,8 | 9,6 | 27,4 | — | — |
| | inexistente | 429 ×300 | 15,2 | 9,7 | 27,0 | +0,4 | −0,9 a +1,3 |
| Enlace que no sirve (check) | inventado (referencia) | 400 ×300 | 37,9 | 22,1 | 83,6 | — | — |
| | ya usado | 400 ×300 | 37,5 | 21,2 | 87,2 | −0,5 | −5,4 a +4,7 |

En cada caso, las 300 respuestas tuvieron el mismo estado y el mismo cuerpo, byte a byte. El cuerpo es igual también entre casos de la misma familia.

## Lo que encontró: DEV-05

En la cuenta activa que envía, el intervalo no pasa por cero. Pedir el enlace para esa cuenta tarda más que para un correo sin cuenta.

Desglose por número de pedido de cada correo en la hora (mediana; "mismo tramo" es la referencia en las mismas vueltas):

| Pedido | n | Activa que envía | Inexistente, mismo tramo | Diferencia |
|---|---|---|---|---|
| 1.º | 71 | 28,9 | 27,9 | +1,1 |
| 2.º | 101 | 51,2 | 46,0 | **+5,2** |
| 3.º | 101 | 27,6 | 25,2 | **+2,3** |
| 4.º (pasa el límite) | 27 | 19,3 | 18,1 | +1,1 |

Filas que quedaron para ese grupo de cuentas:

- 194 DESCARTADO REEMPLAZADO;
- 101 PENDIENTE;
- 8 ENVIADO;
- 27 OMITIDO LIMITE_POR_CORREO.

**Causa.** El pedido corría siempre el mismo `UPDATE … REEMPLAZADO`, pero solo escribía una fila cuando la cuenta ya tenía un pedido pendiente. Eso pasa en el 2.º y el 3.º pedido de una cuenta activa con un dominio que envía. Con un correo sin cuenta, una cuenta inactiva o un dominio reservado nunca hay nada que reemplazar.

**Alcance.** Son como mucho 2 pedidos por correo y por hora, por el límite de 3. Así y todo, con suficientes horas se puede medir. Se corrigió en `dde7656`; la segunda medición está en `ca38-tiempos-2-dde7656.md`.

# E-019 — Rectificación de E-018: Escape cerraba también el panel (DEV-07, segunda parte)

- **Fecha:** 2026-11-20
- **Tipo:** rectificación de E-018 (DEV-07)
- **Autor:** agente de desarrollo
- **Cita:** E-018, `a214de6`.

## Qué decía E-018 y no era cierto

E-018 afirmaba: "Escape ahora llega solo a la pantalla de firma (`onCancel`) y la cierra sin guardar". Lo escribí sin haberlo probado. Era un hueco no declarado, y ahí está el error de forma.

## Qué pasaba en `a214de6`

1. Abrir una tarea FINALIZADO.
2. Tocar "Firmar conformidad" y después "Tocá para firmar".
3. Apretar Escape.

- **Resultado:** se cerraba la firma y también el panel de la tarea.
- **Esperado:** se cierra solo la firma.
- **Causa:** la pantalla de firma es un `<dialog>` montado con un portal. React propaga sus eventos por su propio árbol, no por el del DOM, así que el `cancel` de la firma llegaba al `onCancel` del panel, que lo cerraba.
- **Nota sobre la prueba:** un primer intento se hizo abriendo la firma con un `click()` de JavaScript. Ese clic no cuenta como gesto del usuario, y Chrome agrupa los diálogos modales abiertos sin gesto: Escape los cierra juntos. Por eso esa prueba no valía. Se repitió con clics reales y el defecto se mantuvo.

## Corrección

- **El cambio:** `event.stopPropagation()` en el `onCancel` de la pantalla de firma.
- **Dónde:** `frontend/src/app/app/signature-pad.tsx`. El commit es el que sigue a este evento.

## Verificación (propia)

- **Dónde:** el ensayo, reconstruido con el arreglo y abierto con clics reales.
- **Resultado:**
  - el primer Escape cierra la firma y el panel queda abierto, con "Tocá para firmar" y sin borrador;
  - el segundo Escape cierra el panel.
- **Tipos y lint:** se corrieron desde `frontend/`.
- **Pendiente:** la vuelta de `-Accion Interfaz` en Node 24.22.1 sobre el commit final, antes de la entrega.

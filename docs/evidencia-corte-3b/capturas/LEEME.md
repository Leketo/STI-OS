# Capturas del corte 3B (CA-71)

- **Cuándo:** 2026-11-21, alrededor de las 02:00 (hora de Paraguay), sobre v0.3.1 en el entorno de ensayo (esquema 7), después de la matriz del 3B.
- **Cómo:** `backend/scripts/ensayo/capturas-3b.mjs`, con el Chrome instalado sin ventana, por el protocolo DevTools. Los anchos son exactos (1440, 390 y 360), sin el iframe del 3A. Día y noche con el selector de tema de la aplicación.
- **Datos:** solo falsos, de la matriz. Para ver una atrasada y una reprogramada, el script cambió por la API la fecha de TAR-0039 al 19/11 y la de TAR-0041 dos veces (24/11 y 25/11).
- **Sin secretos:** la sesión se abre con un fetch desde la página, no con el formulario de ingreso. Ninguna captura muestra una contraseña ni un enlace entero.
- **Desborde horizontal:** medido en cada captura (`scrollWidth - innerWidth`): **0 en las 43**. N-31 pide 0 a 360.
- **Panel de edición de cliente:** las primeras 4 capturas mostraron "No se pudieron contar sus datos". Era DEV-10: faltaba la reescritura `/api/clients/:path*`. Se corrigió en 4a74adb y se recapturó.

| Archivo | Qué muestra | Ancho | Tema | Desborde (px) |
|---|---|---|---|---|
| 01-tablero-escritorio-dia.jpg | Tablero: franja Cargada / Asignación / Terminada y "Atrasada" | escritorio | día | 0 |
| 01-tablero-escritorio-noche.jpg | Tablero: franja Cargada / Asignación / Terminada y "Atrasada" | escritorio | noche | 0 |
| 01-tablero-390-dia.jpg | Tablero: franja Cargada / Asignación / Terminada y "Atrasada" | 390 | día | 0 |
| 01-tablero-390-noche.jpg | Tablero: franja Cargada / Asignación / Terminada y "Atrasada" | 390 | noche | 0 |
| 01-tablero-360-dia.jpg | Tablero: franja Cargada / Asignación / Terminada y "Atrasada" | 360 | día | 0 |
| 02-lista-escritorio-dia.jpg | Lista: columnas Cargada, Asignación y Terminada | escritorio | día | 0 |
| 02-lista-escritorio-noche.jpg | Lista: columnas Cargada, Asignación y Terminada | escritorio | noche | 0 |
| 03-nueva-tarea-escritorio-dia.jpg | Nueva tarea con el bloque Asignación (boceto 2.2) | escritorio | día | 0 |
| 03-nueva-tarea-escritorio-noche.jpg | Nueva tarea con el bloque Asignación (boceto 2.2) | escritorio | noche | 0 |
| 03-nueva-tarea-390-dia.jpg | Nueva tarea con el bloque Asignación (boceto 2.2) | 390 | día | 0 |
| 03-nueva-tarea-360-dia.jpg | Nueva tarea con el bloque Asignación (boceto 2.2) | 360 | día | 0 |
| 04-asignar-sin-fecha-escritorio-dia.jpg | Asignar una tarea sin fecha (boceto 7.3) | escritorio | día | 0 |
| 04-asignar-sin-fecha-390-dia.jpg | Asignar una tarea sin fecha (boceto 7.3) | 390 | día | 0 |
| 04-asignar-sin-fecha-360-noche.jpg | Asignar una tarea sin fecha (boceto 7.3) | 360 | noche | 0 |
| 05-panel-fecha-escritorio-dia.jpg | Panel: recuadro de la fecha de asignación (boceto 7.1) | escritorio | día | 0 |
| 05-panel-fecha-escritorio-noche.jpg | Panel: recuadro de la fecha de asignación (boceto 7.1) | escritorio | noche | 0 |
| 05-panel-fecha-390-dia.jpg | Panel: recuadro de la fecha de asignación (boceto 7.1) | 390 | día | 0 |
| 05-panel-fecha-360-dia.jpg | Panel: recuadro de la fecha de asignación (boceto 7.1) | 360 | día | 0 |
| 06-panel-fechas-escritorio-dia.jpg | Panel: bloque Fechas | escritorio | día | 0 |
| 06-panel-fechas-escritorio-noche.jpg | Panel: bloque Fechas | escritorio | noche | 0 |
| 06-panel-fechas-390-dia.jpg | Panel: bloque Fechas | 390 | día | 0 |
| 06-panel-fechas-360-noche.jpg | Panel: bloque Fechas | 360 | noche | 0 |
| 07-cambiar-fecha-escritorio-dia.jpg | Cambiar fecha de asignación (boceto 7.2) | escritorio | día | 0 |
| 07-cambiar-fecha-390-noche.jpg | Cambiar fecha de asignación (boceto 7.2) | 390 | noche | 0 |
| 07-cambiar-fecha-360-dia.jpg | Cambiar fecha de asignación (boceto 7.2) | 360 | día | 0 |
| 08-historial-escritorio-dia.jpg | Historial con "Asignó a … para el" y "Cambió la fecha de asignación" | escritorio | día | 0 |
| 08-historial-390-dia.jpg | Historial con "Asignó a … para el" y "Cambió la fecha de asignación" | 390 | día | 0 |
| 09-atrasada-panel-390-dia.jpg | Panel de una tarea atrasada | 390 | día | 0 |
| 09-atrasada-panel-390-noche.jpg | Panel de una tarea atrasada | 390 | noche | 0 |
| 10-no-facturable-escritorio-dia.jpg | Ventana "¿Por qué no se factura?" (N-49, boceto 6.2) | escritorio | día | 0 |
| 10-no-facturable-390-dia.jpg | Ventana "¿Por qué no se factura?" (N-49, boceto 6.2) | 390 | día | 0 |
| 10-no-facturable-360-dia.jpg | Ventana "¿Por qué no se factura?" (N-49, boceto 6.2) | 360 | día | 0 |
| 10-no-facturable-360-noche.jpg | Ventana "¿Por qué no se factura?" (N-49, boceto 6.2) | 360 | noche | 0 |
| 11-editar-cliente-escritorio-dia.jpg | Editar cliente (boceto 7.4) | escritorio | día | 0 |
| 11-editar-cliente-escritorio-noche.jpg | Editar cliente (boceto 7.4) | escritorio | noche | 0 |
| 11-editar-cliente-390-dia.jpg | Editar cliente (boceto 7.4) | 390 | día | 0 |
| 11-editar-cliente-360-dia.jpg | Editar cliente (boceto 7.4) | 360 | día | 0 |
| 12-editar-proyecto-escritorio-dia.jpg | Editar proyecto (boceto 7.5) | escritorio | día | 0 |
| 12-editar-proyecto-390-dia.jpg | Editar proyecto (boceto 7.5) | 390 | día | 0 |
| 12-editar-proyecto-360-noche.jpg | Editar proyecto (boceto 7.5) | 360 | noche | 0 |
| 13-filtros-activos-360-dia.jpg | Barra con "Filtros activos" (N-31) | 360 | día | 0 |
| 13-filtros-activos-360-noche.jpg | Barra con "Filtros activos" (N-31) | 360 | noche | 0 |
| 13-filtros-activos-390-dia.jpg | Barra con "Filtros activos" (N-31) | 390 | día | 0 |

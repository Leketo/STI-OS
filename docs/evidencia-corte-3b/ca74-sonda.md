| Regla | Rol | Esperado | Obtenido | Resultado |
|---|---|---|---|---|
| Ingreso del ADMIN en v0.3.0 | ADMIN | 204 | 204 | OK |
| Versión del backend | sistema | (observación) | v0.3.0 (JAR del clon en c566b29) | obs. |
| Esquema | sistema | (observación) | 7 | obs. |
| Datos del 3B | sistema | (observación) | 2 con fecha, 2 cambios, 2 nombres editados | obs. |
| Tablero (lista de tareas) | ADMIN | 200 | 200 | OK |
| Las tareas con fecha están en la lista | ADMIN | sí sí | sí sí | OK |
| Panel de una tarea con cambios de fecha | ADMIN | 200 | 200 | OK |
| Tipos del historial que devuelve — la interfaz de v0.3.0 muestra FECHA con su texto por defecto, "Actualizó la tarea" | ADMIN | (observación) | CREADA,ASIGNADA,ESTADO,CONFIRMACION,DESASIGNADA,FECHA | obs. |
| Constancia de la tarea con cambios de fecha | ADMIN | 200 %PDF- | 200 %PDF- | OK |
| Constancia, las fechas no cambian con FECHA | sistema | Atención y Finalizada salen de ESTADO | Atención y Finalizada salen de ESTADO | OK |
| Cliente renombrado en la lista | ADMIN | Constructora Ficticia SA (renombrada) | Constructora Ficticia SA (renombrada) | OK |
| Alta en v0.3.0 | ADMIN | 201 | 201 | OK |
| Fecha de la tarea creada por v0.3.0 | sistema | (observación) | sin fecha | obs. |
| Asignar en v0.3.0 una tarea sin fecha | ADMIN | 200 | 200 | OK |
| Queda asignada sin fecha — igual que las tareas asignadas antes del 3B: v0.3.1 la muestra "Sin fecha" y pide la fecha al asignar a otra persona | sistema | (observación) | sin fecha 1 | obs. |
| Cambio de estado de una tarea con fecha | ADMIN | 200 | 200 | OK |
| La fecha sigue igual después del cambio de estado | sistema | 2026-11-25 | 2026-11-25 | OK |

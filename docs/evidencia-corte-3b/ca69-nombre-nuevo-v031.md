# CA-69: el nombre nuevo, medido en v0.3.1

2026-11-21, alrededor de las 02:03 (hora de Paraguay), en el ensayo con v0.3.1 y los datos falsos de la matriz.

- **Lo que se hizo:** como ADMIN, renombrar por la API (directo al backend) "Hotel Demo SRL" a "Hotel renombrado en 3B (datos falsos)". Es un cliente que ya tenía tareas.
- **Resultados:**

| Qué | Resultado |
|---|---|
| `PUT /api/clients/{id}` | 200 |
| `sti.catalog_name_edit` | una fila: "Hotel Demo SRL > Hotel renombrado en 3B (datos falsos)" |
| Detalle de una tarea finalizada del cliente | trae `clientId` y `projectId`, sin copia del nombre: la interfaz pone el nombre desde `GET /api/clients` |
| `GET /api/clients` | devuelve el nombre nuevo |
| `GET /api/tasks/{id}/constancia` de esa tarea | 200. El texto del PDF, extraído con pypdf 6.19.0, tiene el nombre nuevo y no el viejo |

- **De dónde sale el nombre:** la constancia lo lee al generarse (`TaskController.constancia`, `SELECT c.name FROM sti.client c WHERE c.id = ?`). No queda guardado en la tarea, así que no hay nada que regenerar.
- **Lo que no se hizo:** no saqué una captura del tablero con este cliente. El tablero toma el nombre del mismo `GET /api/clients`.

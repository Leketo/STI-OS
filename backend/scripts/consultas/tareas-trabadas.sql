-- Tareas trabadas: EN_PROCESO que ya no pueden llegar a FINALIZADO solas (N-11, N-14).
-- Corte 1 (ENCARGO-DEV-001). Solo lectura: no corrige nada, y la transacción se abre READ ONLY
-- para que cualquier escritura falle. Devuelve identificadores y conteos; ningún dato personal.
--
--   SIN_ASIGNADOS        EN_PROCESO sin ninguna persona asignada: nadie puede confirmar.
--   TODOS_CONFIRMARON    EN_PROCESO con personas asignadas y ninguna pendiente: la última
--                        confirmación no la finalizó (dos confirmaciones simultáneas, N-11) o
--                        se quitó al último pendiente antes de D-26 (N-14).
--
-- Uso: psql -X -v ON_ERROR_STOP=1 -f tareas-trabadas.sql, con un rol que pueda leer sti.

BEGIN READ ONLY;

SELECT t.number                                         AS tarea,
       t.id,
       CASE WHEN count(a.user_id) = 0 THEN 'SIN_ASIGNADOS'
            ELSE 'TODOS_CONFIRMARON' END                AS motivo,
       count(a.user_id)                                 AS asignados,
       count(a.confirmed_at)                            AS confirmados,
       max(a.confirmed_at)                              AS ultima_confirmacion,
       (SELECT max(e.occurred_at) FROM sti.task_event e
         WHERE e.task_id = t.id)                        AS ultimo_evento
FROM sti.task t
LEFT JOIN sti.task_assignment a ON a.task_id = t.id
WHERE t.status = 'EN_PROCESO'
GROUP BY t.id, t.number
HAVING count(a.user_id) = 0
    OR count(a.confirmed_at) = count(a.user_id)
ORDER BY t.number;

ROLLBACK;

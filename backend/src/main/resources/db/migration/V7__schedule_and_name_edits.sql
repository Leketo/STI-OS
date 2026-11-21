-- Corte 3B (ENCARGO-DEV-005, R-10, R-10b, R-05): the day each task is scheduled for, the log of its changes, and the
-- log of client and project renames. Only adds. The one exception the order allows: the kind CHECK of sti.task_event
-- (written in V3) is replaced by one that adds FECHA and removes nothing. V1 to V6 are not edited, and the location
-- CHECK of V2 stays as it is: a date change records "No aplica: cambio de fecha" as its absent location (D-263).

-- The day the work is scheduled for: a date without time, one for the whole task, null until someone sets it.
-- Tasks that already exist stay null ("Sin fecha"); nothing is filled in on its own (point 8 of the order).
ALTER TABLE sti.task ADD COLUMN scheduled_on date;

ALTER TABLE sti.task_event DROP CONSTRAINT IF EXISTS task_event_kind_check;
ALTER TABLE sti.task_event ADD CONSTRAINT task_event_kind_check
    CHECK (kind IN ('CREADA','ASIGNADA','DESASIGNADA','ESTADO','CONFIRMACION','FIRMA','FOTO','FECHA'));

-- ASIGNADA keeps the day it was assigned for ("para el <día>"); FECHA keeps the previous day (null when the task had
-- none) and the new one.
ALTER TABLE sti.task_event ADD COLUMN scheduled_from date;
ALTER TABLE sti.task_event ADD COLUMN scheduled_to date;
ALTER TABLE sti.task_event ADD CONSTRAINT task_event_scheduled_kind_check
    CHECK ((scheduled_from IS NULL AND scheduled_to IS NULL) OR kind IN ('ASIGNADA','FECHA'));
ALTER TABLE sti.task_event ADD CONSTRAINT task_event_fecha_check
    CHECK (kind <> 'FECHA' OR scheduled_to IS NOT NULL);

-- Who renamed which client or project, when, from what to what (point 17). Not shown on screen in this cut.
CREATE TABLE sti.catalog_name_edit (
    id uuid PRIMARY KEY,
    client_id uuid REFERENCES sti.client(id),
    project_id uuid REFERENCES sti.project(id),
    old_name varchar(200) NOT NULL,
    new_name varchar(200) NOT NULL,
    actor_id uuid NOT NULL REFERENCES sti.app_user(id),
    occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT catalog_name_edit_target_check CHECK ((client_id IS NULL) <> (project_id IS NULL))
);
CREATE INDEX catalog_name_edit_client_idx ON sti.catalog_name_edit(client_id);
CREATE INDEX catalog_name_edit_project_idx ON sti.catalog_name_edit(project_id);

CREATE SEQUENCE sti.task_number_seq AS integer START WITH 1;

CREATE TABLE sti.task (
    id uuid PRIMARY KEY,
    number integer NOT NULL UNIQUE DEFAULT nextval('sti.task_number_seq'),
    project_id uuid NOT NULL REFERENCES sti.project(id),
    title varchar(200) NOT NULL CHECK (btrim(title) <> ''),
    detail varchar(4000),
    status varchar(20) NOT NULL CHECK (status IN ('POR_HACER','EN_PROCESO','FINALIZADO','FACTURADO','ANULADA')),
    created_by uuid NOT NULL REFERENCES sti.app_user(id),
    created_at timestamptz NOT NULL DEFAULT now()
);
ALTER SEQUENCE sti.task_number_seq OWNED BY sti.task.number;
CREATE INDEX task_project_idx ON sti.task(project_id);
CREATE INDEX task_status_idx ON sti.task(status);

CREATE TABLE sti.task_assignment (
    task_id uuid NOT NULL REFERENCES sti.task(id),
    user_id uuid NOT NULL REFERENCES sti.app_user(id),
    confirmed_at timestamptz,
    PRIMARY KEY (task_id, user_id)
);
CREATE INDEX task_assignment_user_idx ON sti.task_assignment(user_id);

-- Traceability log. Every step keeps who acted, when, and where the device was.
-- Coordinates may be absent only with an explicit reason, so a device without a
-- fix records the gap instead of losing the step.
CREATE TABLE sti.task_event (
    id uuid PRIMARY KEY,
    task_id uuid NOT NULL REFERENCES sti.task(id),
    kind varchar(20) NOT NULL CHECK (kind IN ('CREADA','ASIGNADA','DESASIGNADA','ESTADO','CONFIRMACION')),
    from_status varchar(20),
    to_status varchar(20),
    actor_id uuid NOT NULL REFERENCES sti.app_user(id),
    subject_id uuid REFERENCES sti.app_user(id),
    -- clock_timestamp(), not now(): a confirmation and the FINALIZADO it triggers happen in one
    -- transaction, and now() would stamp both with the same instant and lose their order.
    occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    latitude numeric(9,6) CHECK (latitude BETWEEN -90 AND 90),
    longitude numeric(9,6) CHECK (longitude BETWEEN -180 AND 180),
    accuracy_m numeric(10,2) CHECK (accuracy_m >= 0),
    location_absent_reason varchar(200),
    CHECK ((latitude IS NULL) = (longitude IS NULL)),
    -- Assignment is the one step where the client has not defined whether location
    -- applies, so it stays optional instead of inventing a requirement.
    CHECK (kind IN ('ASIGNADA','DESASIGNADA')
           OR latitude IS NOT NULL OR location_absent_reason IS NOT NULL)
);
CREATE INDEX task_event_task_idx ON sti.task_event(task_id, occurred_at);

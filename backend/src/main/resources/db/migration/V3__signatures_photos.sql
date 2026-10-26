-- Photos and client signatures. The bytes live outside the database and outside Nginx,
-- under the private uploads directory; these tables hold only the metadata and the
-- storage name the backend generated.
CREATE TABLE sti.task_photo (
    id uuid PRIMARY KEY,
    task_id uuid NOT NULL REFERENCES sti.task(id),
    storage_name varchar(100) NOT NULL UNIQUE,
    content_type varchar(40) NOT NULL CHECK (content_type IN ('image/jpeg','image/png')),
    byte_size integer NOT NULL CHECK (byte_size > 0 AND byte_size <= 10485760),
    uploaded_by uuid NOT NULL REFERENCES sti.app_user(id),
    uploaded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX task_photo_task_idx ON sti.task_photo(task_id);

CREATE TABLE sti.task_signature (
    id uuid PRIMARY KEY,
    task_id uuid NOT NULL REFERENCES sti.task(id),
    storage_name varchar(100) NOT NULL UNIQUE,
    byte_size integer NOT NULL CHECK (byte_size > 0 AND byte_size <= 1048576),
    signer_name varchar(200) NOT NULL CHECK (btrim(signer_name) <> ''),
    signed_on date NOT NULL,
    -- Account of the session the signature was presented from. In a face-to-face
    -- signature that is the operator's device; the signer never logs in there.
    presented_by uuid NOT NULL REFERENCES sti.app_user(id),
    remote boolean NOT NULL,
    signed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    -- A signed task that is reopened needs a new signature. The previous one is kept
    -- as evidence that the client had conformed to work that was later reopened.
    superseded_at timestamptz,
    latitude numeric(9,6) CHECK (latitude BETWEEN -90 AND 90),
    longitude numeric(9,6) CHECK (longitude BETWEEN -180 AND 180),
    accuracy_m numeric(10,2) CHECK (accuracy_m >= 0),
    location_absent_reason varchar(200),
    CHECK ((latitude IS NULL) = (longitude IS NULL)),
    CHECK (latitude IS NOT NULL OR location_absent_reason IS NOT NULL)
);
CREATE INDEX task_signature_task_idx ON sti.task_signature(task_id, signed_at);
-- At most one signature in force per task; the rest are superseded history.
CREATE UNIQUE INDEX task_signature_current_idx ON sti.task_signature(task_id) WHERE superseded_at IS NULL;

ALTER TABLE sti.task_event DROP CONSTRAINT IF EXISTS task_event_kind_check;
ALTER TABLE sti.task_event ADD CONSTRAINT task_event_kind_check
    CHECK (kind IN ('CREADA','ASIGNADA','DESASIGNADA','ESTADO','CONFIRMACION','FIRMA','FOTO'));

-- Corte 3A (ENCARGO-DEV-004, R-23): a finished task can close as not billable, with a reason.
-- Only adds. The one exception the order allows: the status CHECK of sti.task (written in V2) is replaced by one
-- that also admits NO_FACTURABLE. V1 to V5 are not edited.

ALTER TABLE sti.task DROP CONSTRAINT IF EXISTS task_status_check;
ALTER TABLE sti.task ADD CONSTRAINT task_status_check
    CHECK (status IN ('POR_HACER','EN_PROCESO','FINALIZADO','FACTURADO','ANULADA','NO_FACTURABLE'));

-- Why a task closed without an invoice. Only while it is NO_FACTURABLE; "Volver a Finalizadas" clears it, and the
-- event log keeps it.
ALTER TABLE sti.task ADD COLUMN closing_reason varchar(20)
    CHECK (closing_reason IN ('USO_INTERNO','GARANTIA'));
ALTER TABLE sti.task ADD CONSTRAINT task_closing_reason_status_check
    CHECK ((status = 'NO_FACTURABLE') = (closing_reason IS NOT NULL));

-- The reason of the status event that closed the task as not billable.
ALTER TABLE sti.task_event ADD COLUMN closing_reason varchar(20)
    CHECK (closing_reason IN ('USO_INTERNO','GARANTIA'));
ALTER TABLE sti.task_event ADD CONSTRAINT task_event_closing_reason_kind_check
    CHECK (closing_reason IS NULL OR (kind = 'ESTADO' AND to_status = 'NO_FACTURABLE'));

-- Corte 2 (ENCARGO-DEV-002): users and passwords. The first migration since production holds real data.
-- It only adds: a nullable column, a column with a default, and a new table. Nothing existing changes or goes,
-- so v0.1.1-candidato.1 keeps working against schema 4 (D-79): it never reads or writes what is added here.

-- R-19, D-24: optional phone, up to 30 characters of digits, spaces, +, - and parentheses.
ALTER TABLE sti.app_user ADD COLUMN phone varchar(30)
    CHECK (phone IS NULL OR phone ~ '^[0-9 +()-]+$');

-- D-23: an account created or reset by an ADMIN must choose its own password before anything else.
-- Existing accounts take the default and are not forced to change (D-78).
ALTER TABLE sti.app_user ADD COLUMN must_change_password boolean NOT NULL DEFAULT false;

-- Rule 10: who did what to which account, and when. It never holds a password, in clear or hashed.
CREATE TABLE sti.account_event (
    id uuid PRIMARY KEY,
    account_id uuid NOT NULL REFERENCES sti.app_user(id),
    actor_id uuid NOT NULL REFERENCES sti.app_user(id),
    kind varchar(30) NOT NULL CHECK (kind IN
        ('ALTA', 'EDICION', 'ACTIVACION', 'DESACTIVACION', 'RESTABLECIMIENTO', 'CAMBIO_CONTRASENA')),
    changes jsonb NOT NULL DEFAULT '{}'::jsonb,
    occurred_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX account_event_account_idx ON sti.account_event(account_id, occurred_at);

-- Corte 2B (ENCARGO-DEV-003): recover the password by email and stop sign-in guessing.
-- It only adds: three new tables, and two more values in the list of account log kinds. Nothing existing changes
-- or goes, so v0.2.0-candidato.1 keeps working against schema 5 (D-79): it never reads or writes what is added
-- here, and the kinds it writes are all still allowed.

-- The two kinds this cut writes to the account log (rule 6 and rule 13). The actor is the account itself (D-158).
-- The only change to something that exists, and the one the encargo allows: the list of kinds grows, none leaves.
ALTER TABLE sti.account_event DROP CONSTRAINT account_event_kind_check;
ALTER TABLE sti.account_event ADD CONSTRAINT account_event_kind_check CHECK (kind IN
    ('ALTA', 'EDICION', 'ACTIVACION', 'DESACTIVACION', 'RESTABLECIMIENTO', 'CAMBIO_CONTRASENA',
     'RECUPERACION_CORREO', 'BLOQUEO_INGRESO'));

-- D-38, D-160: the mail queue and, at the same time, the record of every recovery request.
-- One row per request, always, so that an address with an account and one without cost the same work (rule 1).
-- It never holds the link or the token. When what was typed matches no account, account_id stays empty and the
-- typed text is not kept in any form, not even hashed: people sometimes type a password in the email field.
-- When there is an account the row keeps the account, not the email.
CREATE TABLE sti.mail_outbox (
    id uuid PRIMARY KEY,
    account_id uuid REFERENCES sti.app_user(id),
    kind varchar(30) NOT NULL CHECK (kind IN ('RECUPERACION')),
    status varchar(20) NOT NULL CHECK (status IN ('PENDIENTE', 'ENVIADO', 'OMITIDO', 'DESCARTADO')),
    -- Why a row is OMITIDO or DESCARTADO. A fixed list: never free text, never the error of the mail server.
    reason varchar(40) CHECK (reason IS NULL OR reason IN
        ('SIN_CUENTA', 'CUENTA_INACTIVA', 'DOMINIO_RESERVADO', 'LIMITE_POR_CORREO', 'CORREO_NO_CONFIGURADO',
         'VENCIDO', 'MAXIMO_DE_INTENTOS', 'REEMPLAZADO', 'RESTABLECIDA')),
    attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    next_attempt_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    finished_at timestamptz,
    CHECK ((status = 'PENDIENTE') = (finished_at IS NULL))
);
-- The worker asks only for what is pending and due.
CREATE INDEX mail_outbox_due_idx ON sti.mail_outbox(next_attempt_at) WHERE status = 'PENDIENTE';
CREATE INDEX mail_outbox_account_idx ON sti.mail_outbox(account_id, created_at) WHERE account_id IS NOT NULL;
CREATE INDEX mail_outbox_created_idx ON sti.mail_outbox(created_at);

-- Rule 11: each sending attempt, with account, kind, attempt number, result and time. No link and no token.
CREATE TABLE sti.mail_attempt (
    id uuid PRIMARY KEY,
    outbox_id uuid NOT NULL REFERENCES sti.mail_outbox(id) ON DELETE CASCADE,
    account_id uuid REFERENCES sti.app_user(id),
    kind varchar(30) NOT NULL,
    attempt integer NOT NULL CHECK (attempt >= 1),
    -- ENVIADO, or the class of the failure (never the text the mail server answered).
    result varchar(80) NOT NULL,
    occurred_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX mail_attempt_sent_idx ON sti.mail_attempt(occurred_at) WHERE result = 'ENVIADO';
CREATE INDEX mail_attempt_outbox_idx ON sti.mail_attempt(outbox_id);

-- Rule 4: only the hash of the link's token lives here (SHA-256 of a 256-bit random value). The token is made at
-- the moment of sending and is never stored in clear anywhere. A row exists only for a mail that went out.
CREATE TABLE sti.password_reset_token (
    id uuid PRIMARY KEY,
    account_id uuid NOT NULL REFERENCES sti.app_user(id),
    outbox_id uuid REFERENCES sti.mail_outbox(id) ON DELETE SET NULL,
    token_hash bytea NOT NULL UNIQUE CHECK (octet_length(token_hash) = 32),
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    expires_at timestamptz NOT NULL,
    used_at timestamptz,
    revoked_at timestamptz
);
CREATE INDEX password_reset_token_account_idx ON sti.password_reset_token(account_id) WHERE used_at IS NULL AND revoked_at IS NULL;

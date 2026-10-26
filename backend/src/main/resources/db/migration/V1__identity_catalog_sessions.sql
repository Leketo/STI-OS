CREATE TABLE sti.client (
    id uuid PRIMARY KEY,
    name varchar(200) NOT NULL
);
CREATE TABLE sti.app_user (
    id uuid PRIMARY KEY,
    email varchar(254) NOT NULL UNIQUE CHECK (email = lower(email)),
    display_name varchar(200) NOT NULL,
    password_hash varchar(100) NOT NULL,
    role varchar(20) NOT NULL CHECK (role IN ('ADMIN','SUPERVISOR','USUARIO','CLIENTE')),
    client_id uuid REFERENCES sti.client(id),
    enabled boolean NOT NULL DEFAULT true,
    CHECK ((role = 'CLIENTE' AND client_id IS NOT NULL) OR (role <> 'CLIENTE' AND client_id IS NULL))
);
CREATE TABLE sti.project (
    id uuid PRIMARY KEY,
    client_id uuid NOT NULL REFERENCES sti.client(id),
    name varchar(200) NOT NULL
);
CREATE INDEX project_client_idx ON sti.project(client_id);

CREATE TABLE sti.spring_session (
    primary_id char(36) NOT NULL PRIMARY KEY,
    session_id char(36) NOT NULL,
    creation_time bigint NOT NULL,
    last_access_time bigint NOT NULL,
    max_inactive_interval integer NOT NULL,
    expiry_time bigint NOT NULL,
    principal_name varchar(254)
);
CREATE UNIQUE INDEX spring_session_ix1 ON sti.spring_session(session_id);
CREATE INDEX spring_session_ix2 ON sti.spring_session(expiry_time);
CREATE INDEX spring_session_ix3 ON sti.spring_session(principal_name);
CREATE TABLE sti.spring_session_attributes (
    session_primary_id char(36) NOT NULL REFERENCES sti.spring_session(primary_id) ON DELETE CASCADE,
    attribute_name varchar(200) NOT NULL,
    attribute_bytes bytea NOT NULL,
    PRIMARY KEY (session_primary_id, attribute_name)
);

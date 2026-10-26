# STI-OS backend foundation

Local foundation: Java 21, Spring Boot 4.1.2, PostgreSQL, Spring Security and Spring Session JDBC. The API contract is [`api/openapi.yaml`](api/openapi.yaml). The local frontend supports login, account identity and logout; task boards still contain public fictitious data. Task mutations, signatures, GPS, uploads and ERP integration remain pending.

## Persistent local database and application

The temporary `test-local.ps1` database stops after verification. For manual development, use the persistent local cluster. It is created only under the Git-ignored `output/backend-local` directory; it does not modify an existing PostgreSQL service. PostgreSQL listens only on `127.0.0.1:55432`. The script refuses a port conflict.

In PowerShell from the repository root:

```powershell
./backend/scripts/start-local.ps1
# In terminal 2:
./backend/scripts/run-local.ps1
# In terminal 3:
cd frontend
$env:STI_API_ORIGIN = 'http://127.0.0.1:8080'
npm run dev
```

Open `http://localhost:3000/login`. The protected local home is `/app`; the board remains a clearly marked public demo. The same-origin frontend proxy includes auth, accounts and catalog endpoints, but excludes `/api/health`. The local profile allows HTTP cookies only for local development.

Stable JDBC connection: `jdbc:postgresql://127.0.0.1:55432/sti_os`. The database is `sti_os`, the schema is `sti`, and the JDBC user for app reads/writes is `sti_runtime`. Generated credentials and the initial local administrator identity are stored in `output/backend-local/credentials.json`, restricted to the current Windows user and ignored by Git. Read them locally; do not paste them into commits or logs. The admin account is created once via the offline bootstrap JAR with a generated password. No HTTP bootstrap or fixed default password exists. The migrator has separate credentials, and the runtime account has no DDL rights.

The setup script builds the JARs, runs migrations with the migrator role, creates the first administrator only when the database is new, and leaves PostgreSQL running across shell sessions. Running it again reuses the same cluster, credentials and account and applies new migrations. Provisioning can resume after a partial failure by checking existing roles, database, schema and initial account. To stop this specific cluster without deleting data:

```powershell
& 'C:/Program Files/PostgreSQL/15/bin/pg_ctl.exe' -D 'output/backend-local/pgdata' -m fast -w stop
```

If a partial setup fails before `output/backend-local/provisioned` exists, inspect the error and cluster before retrying; the script will not replace a partly initialized cluster or unexpected account data. Never copy local credentials or data to the VPS. PostgreSQL 15 is the available local version; PostgreSQL 18 compatibility still needs verification before deployment.

## Local verification

Prerequisites: JDK 21, Maven 3.9+, PostgreSQL binaries. On this workstation Maven selects Java 17 by default, so select Java 21 per process; do not change the machine-wide configuration. Docker is installed but its daemon was unavailable during initial preparation.

From the repository root in PowerShell:

```powershell
./backend/scripts/test-local.ps1
# To use PostgreSQL 18 installed elsewhere:
./backend/scripts/test-local.ps1 -PgBin 'C:/path/to/postgresql18/bin' -JavaHome 'C:/Program Files/Java/jdk-21'
```

The script creates a new cluster in a unique, ACL-restricted `output/backend-test-*` directory, listens only on IPv4 loopback on a free port, and creates separate migration/runtime identities with generated credentials. It never connects to existing PostgreSQL services or the VPS. An initialization password file exists briefly inside the restricted directory and is removed in `finally`. Credentials are not printed or committed. The cluster is stopped after Maven verification; synthetic files and PostgreSQL logs remain for diagnosis. Do not copy this directory to production.

Tests fail explicitly if database variables are missing; they are not silently skipped. Tests use actual HTTP, cookies, CSRF and PostgreSQL, including JDBC-persisted sessions. Runtime DDL is denied. Test fixtures use reserved `example.invalid` addresses and random passwords, and exist only under `src/test`. The script requires Windows PowerShell/PowerShell on Windows and `icacls`.

The initial local PostgreSQL available is **15**. Results on it do not prove parity with the VPS PostgreSQL **18**. Run the same suite with PostgreSQL 18 before the first deployment.

Verified on 2026-10-26: JDK 21.0.9, Maven 3.9.3, PostgreSQL 15.3, `mvn verify` through the script: **12 tests, 0 failures/errors/skips**, all three JARs packaged, synthetic cluster confirmed stopped. The bootstrap recovery branch compiled but has no dedicated integration test. The separate persistent local cluster was created on `127.0.0.1:55432`, migrated to V1 and given a generated ADMIN password. Direct backend and isolated frontend proxy checks confirmed login 204, `/api/auth/me` ADMIN, `/app` 200 while authenticated, logout 204, unauthenticated `/app` 307, public mock board 200 and frontend `/api/health` 404. The OpenAPI YAML parsed with 9 paths. These are local results, not deployed JAR/HTTPS evidence. The JVM emitted the test dependency Mockito dynamic-agent warning; it did not fail verification.

On the final review rerun, all 12 tests passed, including an HTTP 400 for `role: null`. The test cluster stopped cleanly. Windows blocked Maven's final JAR rename because the separate local backend was still running from that JAR; after stopping that owned process, `mvn -DskipTests package` succeeded and produced all three artifacts. Keep the local backend stopped while packaging on Windows.

## Runtime and migration separation

The database `sti_os` and schema `sti` must already exist, with `sti_migrator` owning the schema. Runtime needs schema usage and DML on application/session tables, plus sequence usage when future migrations add sequences. Set owner-specific default privileges for future objects. Runtime must not own tables, create objects or inherit elevated roles. `search_path=pg_catalog,sti` is compatible; SQL is schema-qualified.

Build with Java 21 and the isolated test script above. It produces three artifacts:

- `target/sti-os-backend-0.1.0-SNAPSHOT.jar`: web runtime.
- `target/sti-os-backend-0.1.0-SNAPSHOT-migrator.jar`: migration-only entrypoint; exits after migration.
- `target/sti-os-backend-0.1.0-SNAPSHOT-bootstrap.jar`: offline first-ADMIN entrypoint; exits after creating one account.

Run migrations as a separate process with `STI_DB_URL`, `STI_MIGRATION_USER`, `STI_MIGRATION_PASSWORD` supplied securely by the deployment environment:

```powershell
java -jar backend/target/sti-os-backend-0.1.0-SNAPSHOT-migrator.jar
```

Run the web process with **only** `STI_DB_URL`, `STI_DB_USER`, `STI_DB_PASSWORD` and optional `STI_PORT` (8080 by default). Remove migration credentials from its environment. Flyway, Spring SQL initialization and Spring Session schema initialization do not run at application startup.

```powershell
# Values must already be present in this process environment; no credentials in command history.
java -jar backend/target/sti-os-backend-0.1.0-SNAPSHOT.jar --spring.profiles.active=local
```

The `local` profile only disables the Secure cookie flag for HTTP loopback development. Do not use it on the VPS. Default cookies are Secure, HttpOnly, SameSite=Lax, named `STI_SESSION`, with a 30-minute inactivity timeout. No CORS policy is opened: frontend integration should proxy `/api` under the same origin. Forwarded headers are ignored; TLS termination does not require trusting them to issue Secure cookies. `/api/health` is internal readiness and must be excluded from the public proxy. Nginx login rate limiting and request size/time limits are required before public authentication.

Spring config-tree can be used for systemd credentials via `SPRING_CONFIG_IMPORT=configtree:/run/credentials/sti-backend.service/` with files named `STI_DB_URL`, `STI_DB_USER`, `STI_DB_PASSWORD`. This delivery mechanism still needs verification on the VPS; arbitrary `*_FILE` variables are not read automatically. The migration executable reads its three environment variables directly; use a protected launcher to load credential files for that process only, never expose values through arguments or logs.

## Authentication and authorization

1. GET `/api/auth/csrf` and retain the session cookie plus returned token.
2. POST form-encoded `username` and `password` to `/api/auth/login`, including the token in `X-CSRF-TOKEN`.
3. On 204, fetch a new CSRF token; login rotates the session identifier and clears the old token.
4. GET `/api/auth/me`, `/api/clients`, `/api/projects` or `/api/projects/{uuid}`.
5. POST `/api/auth/logout` with the fresh token. Logout invalidates the persisted session.

There is no default production account or seeded production password. The first ADMIN is created only by `sti-os-backend-0.1.0-SNAPSHOT-bootstrap.jar` using migration credentials and explicit `STI_INITIAL_ADMIN_NAME`, `STI_INITIAL_ADMIN_EMAIL`, `STI_INITIAL_ADMIN_PASSWORD` environment values from a protected operator source. Bootstrap requires an empty account table and uses a transaction lock to avoid concurrent initialization. Thereafter, only a currently enabled ADMIN can POST `/api/accounts` with a valid CSRF token. A CLIENTE must reference exactly one existing company; internal roles cannot carry a company ID. Passwords are BCrypt cost 12 and never returned. Accounts are reloaded for every identity/catalog request, so disabled accounts and changed company links do not retain catalog access through an old session.

CLIENTE receives only its own company's directory and projects. An unknown or foreign project returns the same 404 status. ADMIN, SUPERVISOR and USUARIO can read the project/client creation catalog, because operators may create requests for any client; this does **not** grant access to other operators' tasks. Only read endpoints exist in this slice; project creation will require ADMIN when implemented.

## Release gates still pending

- Fresh security/reliability review and PostgreSQL 18 verification.
- Login rate limiting at Nginx before public authentication; local login and proxy do not change the published demo.
- Task domain, assigned-user isolation, transitions, confirmations, private attachments, signatures and GPS.
- Deployed JAR, health/auth/session/privilege checks, external port test, external restore and rollback exercise before real data.

No deployment, commit or push is performed by this slice. The existing public demo remains unchanged.

Version evidence: [Spring Boot requirements](https://docs.spring.io/spring-boot/system-requirements.html) and [4.1.2 Maven Central POM](https://repo.maven.apache.org/maven2/org/springframework/boot/spring-boot-starter-parent/4.1.2/spring-boot-starter-parent-4.1.2.pom), checked on 2026-10-26. SQL uses Spring JDBC explicitly for this small foundation; JPA remains a planned option for the task domain, with no automatic schema generation.

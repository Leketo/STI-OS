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

Open `http://localhost:3000/login`. The protected local home is `/app`; an ADMIN can create clients and accounts there.

`STI_API_ORIGIN` is read in two different moments. `next.config.ts` resolves it inside `rewrites()`, which Next evaluates **at build time**, so a production or standalone bundle built without that variable ships an empty rewrite table and can never proxy `/api`. The `/app` server component reads the same variable **at run time**. Set it for `npm run build` and for the process that serves the build; `npm run dev` only needs it in the running shell. Create a client first, then select it when creating a CLIENTE account. The board remains a clearly marked public demo. The same-origin frontend proxy includes auth, accounts and catalog endpoints, but excludes `/api/health`. The local profile allows HTTP cookies only for local development.

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

After the local client-onboarding follow-up, `backend/scripts/test-local.ps1` passed **13 tests, 0 failures/errors/skips** on an isolated PostgreSQL 15.3 cluster, packaged all three JARs and stopped that synthetic cluster. The new HTTP test creates a client as ADMIN, rejects non-ADMIN and missing CSRF, creates a CLIENTE account, logs it in and verifies company isolation. Frontend typecheck and targeted ESLint passed. PostgreSQL 18 and VPS runtime remain unverified.

After the task domain was added, `backend/scripts/test-local.ps1` passed **17 tests, 0 failures/errors/skips** on an isolated PostgreSQL 15.3 cluster and packaged the three JARs. The four new tests cover the full lifecycle with two assignees and the confirmation counter, the role matrix of forbidden transitions, the location rule including its absence reason, and company isolation with the ADMIN-only cancelled view. A separate end-to-end run through the frontend proxy on `127.0.0.1:3021` created a project and `TAR-0001`, assigned it, started it, confirmed it to `FINALIZADO`, reopened it with the confirmations cleared, cancelled it, and confirmed the cancelled task disappears from the normal list while remaining in the ADMIN view. The React board itself has not been browser-smoked: the Chrome extension disconnected during that attempt.

The ADMIN forms were browser-verified on 2026-10-26 against the standalone production bundle on `127.0.0.1:3021`, the backend on `127.0.0.1:8080` and the persistent PostgreSQL 15 cluster: ADMIN login, client creation, CLIENTE account creation with that client preselected, password field cleared after submit, logout, CLIENTE login limited to its own view with no administration forms, and the service-unavailable screen shown instead of a `/login` redirect while the backend was stopped. `psql` confirmed both rows and the account→client link. The CLIENTE account used there is disposable local test data and must not be recreated on the VPS.

## Task domain

Migration `V2__tasks.sql` adds `task`, `task_assignment` and `task_event` plus the `task_number_seq` sequence behind the visible `TAR-0001` code, a global correlative. Endpoints: `POST /api/projects` (ADMIN), `GET /api/operators` (ADMIN and SUPERVISOR), `GET|POST /api/tasks`, `GET /api/tasks/{id}`, `POST|DELETE /api/tasks/{id}/assignments[/{userId}]`, `POST /api/tasks/{id}/status` and `POST /api/tasks/{id}/confirmations`.

Rules as the client defined them. Every role creates in `POR_HACER`; USUARIO is auto-assigned to what it creates and CLIENTE creates unassigned inside its own company only. ADMIN and SUPERVISOR assign and unassign; an assigned USUARIO can start a task but never move it backwards. `FINALIZADO` is never requested directly: it is reached when **every** assignee confirms, which is the `1 de 2` counter. Moving a task backwards clears every confirmation, so all must confirm again. Only ADMIN cancels, and cancelled tasks stay in the history behind an ADMIN-only `?status=ANULADA` view. `FACTURADO` requires a client signature and belongs to the next slice; the API rejects it.

Visibility: ADMIN everything, SUPERVISOR everything except cancelled, USUARIO only its assigned tasks and never `FACTURADO`, CLIENTE every task of its company except `FACTURADO` and `ANULADA`. A task outside reach returns the same 404 as a missing one.

Every defined step stores actor, instant and device location in `task_event`. Coordinates **or** an explicit absence reason must arrive; a step with neither is rejected. That follows the decision of 26/10/2026: a device that cannot obtain a fix records why instead of blocking a technician on site. Assignment and unassignment are the exception, because the client has not defined whether location applies there. `occurred_at` defaults to `clock_timestamp()`, not `now()`, so a confirmation and the `FINALIZADO` it triggers keep their order inside one transaction.

## Photos, signature and invoicing

Migration `V3__signatures_photos.sql` adds `task_photo` and `task_signature`. Endpoints: `POST /api/tasks/{id}/photos` (multipart), `GET /api/tasks/{id}/photos/{photoId}`, `POST /api/tasks/{id}/signature` and `GET /api/tasks/{id}/signature`.

**Bytes never live in the database and never under Nginx.** They go to the private uploads directory, `STI_UPLOADS_DIR` (`sti.uploads.dir`), which defaults to `output/backend-local/uploads` for development and must point at the private server path in deployment. The backend streams them only to an account that can already see the task, with `Cache-Control: no-store`. Storage names are generated as UUIDs; no part of a request ever reaches the file system, and reads are confined to the configured root.

Photos: at most five per task, JPEG or PNG, 10 MB each. The declared content type is **not** trusted — the file is accepted only if its own first bytes are a JPEG or PNG signature. Assignees, ADMIN, SUPERVISOR and the company's CLIENTE may upload while the task is open; a closed task takes no more photos.

Each rejection answers with its own status so the interface can name the real problem instead of one generic message: **415** when the bytes are not an image whatever the file is called, **413** over 10 MB, **409** when five photos already exist, **400** when the task is closed, **403** for a role that cannot attach. The 413 needs the `MaxUploadSizeExceededException` handler in `ApiErrors`; without it the container's own limit surfaces as a server error.

Signature: only on a `FINALIZADO` task. Face to face, an operator or assignee presents the task on its own device and the signer types a name and draws without logging in there; remotely, the company's CLIENTE signs from its own account, which is recorded as `remote`. Either way the signature stores the session account, the instant, the signer's name, the chosen date, the stroke as PNG and the device location under the same coordinates-or-reason rule. A partial unique index guarantees at most **one signature in force** per task, so a second attempt returns 409. Reopening a task supersedes its signature and keeps it as evidence.

`FINALIZADO → FACTURADO` is ADMIN only and requires a signature in force. `FACTURADO` is terminal: nothing moves out of it, and USUARIO and CLIENTE never see it.

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

There is no default production account or seeded production password. The first ADMIN is created only by `sti-os-backend-0.1.0-SNAPSHOT-bootstrap.jar` using migration credentials and explicit `STI_INITIAL_ADMIN_NAME`, `STI_INITIAL_ADMIN_EMAIL`, `STI_INITIAL_ADMIN_PASSWORD` environment values from a protected operator source. Bootstrap requires an empty account table and uses a transaction lock to avoid concurrent initialization. Thereafter, only a currently enabled ADMIN can POST `/api/clients` and `/api/accounts` with a valid CSRF token. A CLIENTE must reference exactly one existing company; internal roles cannot carry a company ID. Passwords are BCrypt cost 12 and never returned. The ADMIN UI does not store the submitted password and clears its input after an attempt. Accounts are reloaded for every identity/catalog request, so disabled accounts and changed company links do not retain catalog access through an old session.

CLIENTE receives only its own company's directory and projects. An unknown or foreign project returns the same 404 status. ADMIN, SUPERVISOR and USUARIO can read the project/client creation catalog, because operators may create requests for any client; this does **not** grant access to other operators' tasks. Project creation is ADMIN only, as described under "Task domain" below.

## Release gates still pending

- Fresh security/reliability review and PostgreSQL 18 verification. Everything below was tested only on PostgreSQL 15.
- Login rate limiting at Nginx before public authentication; local login and proxy do not change the published demo.
- Browser verification of the authenticated task board, the signature pad and photo upload. Their API behaviour was verified over HTTP; the React UI itself has not been exercised in a real browser.
- A private uploads path on the server, its backup coverage and the DB/uploads consistency question the VPS report already raised. Photos and signatures are files now, not rows.
- Deployed JAR, health/auth/session/privilege checks, external port test, external restore and rollback exercise before real data.

The authentication foundation was committed and pushed to `origin/main` as `91e76d8503fe87f857f0db64ba1ada9d8155ac14`, the client and account onboarding as `673075c`, and the task domain as `4393228`. None of them is deployed. `https://app.stisistemas.com` still serves the earlier demo commit `bef587fbebcf921d39eb5ec2b2572606ec418c7a`. Next verify PostgreSQL 18 compatibility and prepare a reviewed revision for the VPS agent. Keep local credentials and data out of that handoff.

Version evidence: [Spring Boot requirements](https://docs.spring.io/spring-boot/system-requirements.html) and [4.1.2 Maven Central POM](https://repo.maven.apache.org/maven2/org/springframework/boot/spring-boot-starter-parent/4.1.2/spring-boot-starter-parent-4.1.2.pom), checked on 2026-10-26. SQL uses Spring JDBC explicitly for this small foundation; JPA remains a planned option for the task domain, with no automatic schema generation.

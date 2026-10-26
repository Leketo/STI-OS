# STI-OS local development handoff

Updated: 2026-10-26. This file describes the desktop repository, not the separate VPS handoff file.

## Preserve

- Public demo commit: `bef587fbebcf921d39eb5ec2b2572606ec418c7a` at `https://app.stisistemas.com`.
- Existing uncommitted change in `docs/stack-y-plan-tecnico.md` predates this backend slice. Preserve it.
- `server/` and `output/` are ignored by Git. They are not transferred by cloning the repository.
- Do not deploy, push or overwrite server evidence as an automatic consequence of opening this handoff.

## Current work

`backend/` contains the first foundation: contract, Java 21 / Spring Boot 4.1.2, migration-only executable, PostgreSQL schema, JDBC sessions, login/logout/CSRF/current-user and company-scoped project/client catalog. The published frontend revision still uses mock data.

Next local slice completed locally: ADMIN-only `/api/accounts`, offline first-admin bootstrap executable, persistent development PostgreSQL under `output/backend-local`, and frontend `/login` plus protected `/app` with same-origin `/api` proxy. Public boards stay mock/demo. See `backend/README.md` for commands and JDBC. This slice has not been deployed or pushed.

Persistent local connection: `jdbc:postgresql://127.0.0.1:55432/sti_os`; schema `sti`; runtime user `sti_runtime`. Credentials and generated local ADMIN login are in ignored, current-user ACL-restricted `output/backend-local/credentials.json`. The DB is running on loopback. The backend was launched on `127.0.0.1:8080` for smoke testing, then stopped to release the JAR for packaging. An isolated frontend standalone package was launched on `127.0.0.1:3017` for smoke testing; an existing STI dev server on `:3000` was preserved and still returned 200 after build. Do not assume these processes survive a reboot; `backend/scripts/start-local.ps1` reuses the persistent DB and `run-local.ps1` starts the backend.

Checks on 2026-10-26: `npm run lint`, `npm run typecheck`, and `npm run build` all exited 0; production frontend built 19/19 static pages. `backend/scripts/test-local.ps1` passed **12 tests, 0 failures/errors/skips** on isolated PostgreSQL 15.3 and confirmed that synthetic cluster stopped. Local HTTP on backend and isolated same-origin frontend confirmed login 204, ADMIN identity, protected `/app` 200, logout 204, unauthenticated `/app` 307, public board 200 and no `/api/health` frontend proxy (404). This does not establish PostgreSQL 18 or VPS runtime behavior.

Final review fixes: `role: null` now returns 400, bootstrap re-entry requires an enabled matching ADMIN, and `/app` shows service unavailability for backend/network failures while redirecting only for denied sessions. The focused suite passed 12/12 after these edits, but its Maven `verify` packaging step could not rename the runtime JAR while our local backend was running on Windows. After stopping that owned process, a separate `mvn -DskipTests package` succeeded and produced all three JARs. Frontend typecheck and targeted ESLint passed. The updated `/app` unavailable-state UI has not been browser-smoked after this last edit.

The build must use JDK 21 explicitly; Maven defaults to JDK 17 on this workstation. PostgreSQL 15 binaries are installed; Docker daemon is unavailable. Use `backend/scripts/test-local.ps1` for an isolated synthetic cluster and Maven verification; it does not use the installed database service or VPS. See `backend/README.md` for configuration and all commands.

## Verification details

- Main Java sources compiled against Boot 4.1.2. The 12-test result above supersedes the initial 10-test foundation run.
- The isolated test harness uses a temporary password file under an ACL-restricted output directory because PostgreSQL 15 `initdb` does not accept `--pwfile=-`. It removes that file and stops its synthetic cluster.
- Tests cover authentication, CSRF, session rotation/persistence/logout/expiry, customer isolation, disabled users, long email, ADMIN account creation and runtime DDL denial. Secure-cookie HTTPS behavior and deployed artifacts are not yet tested.
- The OpenAPI YAML parses with 9 paths. Local test report: `backend/target/surefire-reports/com.stisistemas.os.FoundationTest.txt`.

## Next steps

1. Run against PostgreSQL 18 before VPS deployment; finalize credential delivery with the server agent.
2. Implement task creation/assignment/transitions and connect real task data to the authenticated frontend. Current boards remain public mock data.
3. Publish a specific tested Git revision, then hand it to VPS Codex for deployment. No CI/CD pipeline is implemented yet.

Server report supplied by the user: administrative T1 checks passed, demo preserved, backend inactive/no `/api` proxy; first JAR/auth/health, external ports and external recovery remain pending. This is reported evidence, not a desktop verification of VPS state.

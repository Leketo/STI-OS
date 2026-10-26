# STI-OS local development handoff

Updated: 2026-10-26. This file describes the desktop repository, not the separate VPS handoff file.

## Preserve

- Public demo commit: `bef587fbebcf921d39eb5ec2b2572606ec418c7a` at `https://app.stisistemas.com`.
- The earlier edit to `docs/stack-y-plan-tecnico.md` was preserved and included in the repository commit described below.
- `server/` and `output/` are ignored by Git. They are not transferred by cloning the repository.
- Do not deploy, push or overwrite server evidence as an automatic consequence of opening this handoff.

## Current work

`backend/` contains the first foundation: contract, Java 21 / Spring Boot 4.1.2, migration-only executable, PostgreSQL schema, JDBC sessions, login/logout/CSRF/current-user and company-scoped project/client catalog. The published frontend revision still uses mock data.

Next slice completed locally and pushed to `origin/main` as `91e76d8503fe87f857f0db64ba1ada9d8155ac14`: ADMIN-only `/api/accounts`, offline first-admin bootstrap executable, persistent development PostgreSQL under `output/backend-local`, and frontend `/login` plus protected `/app` with same-origin `/api` proxy. Public boards stay mock/demo. See `backend/README.md` for commands and JDBC. The VPS still serves the earlier demo commit `bef587fbebcf921d39eb5ec2b2572606ec418c7a`; this backend and login slice has not been deployed.

Current local follow-up, not yet committed or deployed: ADMIN can POST `/api/clients` and use forms in protected `/app` to create a client and then a CLIENTE account assigned to that client. The UI requests a fresh CSRF token for each write and clears the password field after submission. Public boards are unchanged mock data. The isolated PostgreSQL test suite now includes the create-client → create-account → CLIENTE-login/isolation flow.

The final verification rerun passed 13/13 integration tests and packaged the three JARs with isolated PostgreSQL 15.3, which stopped cleanly. Frontend typecheck and targeted ESLint passed. Review corrections preserved any in-progress CLIENTE selection when another client is created, removed the 100-client catalog cap, and added a warning plus catalog refresh if a client-creation response is lost. PostgreSQL 18 and VPS validation remain pending.

## Browser verification completed on 2026-10-26 (late session)

The pending browser smoke of the ADMIN onboarding forms is now done, on the standalone production package, against the backend on `127.0.0.1:8080` and the persistent PostgreSQL 15 cluster on `127.0.0.1:55432`.

First a real defect was found and fixed in the verification procedure, not in the code: `next.config.ts` resolves `STI_API_ORIGIN` inside `rewrites()`, which Next evaluates **at build time**, so the earlier production build carried zero rewrites (`routes-manifest.json` had empty `afterFiles`) and its `/api` proxy could never work. `STI_API_ORIGIN` must be present **both** when building and when running the standalone server; at runtime alone it only feeds the `/app` server component. The rebuilt bundle has the five expected rewrites and generated 19/19 pages with exit 0.

Observed in Chrome on `http://127.0.0.1:3021` (isolated standalone server; the pre-existing dev server on `:3000` was left running):

- ADMIN login with the generated local account, `/app` rendered with role `ADMIN` and the access-administration section.
- Created client `Constructora Demo Local`; the form reported it and the catalog counter moved to 1.
- Created a `CLIENTE` account with that client preselected; the form reported success, cleared the password field and reset itself to role `USUARIO`.
- Logout returned to `/login`; logging in as the new CLIENTE rendered `/app` with role `CLIENTE` and **no** administration forms.
- With the backend stopped, `/app` with a valid session cookie rendered "Servicio temporalmente no disponible" instead of redirecting to `/login` — the reliability fix behaves as intended in the browser.
- The public demo board rendered normally with its DEMO banner while the backend was down.

Database check through `psql` as the migration role: `sti.app_user` holds `admin@sti.local` (ADMIN, no client) and `cliente.demo@example.invalid` (CLIENTE, linked to `Constructora Demo Local`); both enabled. The generated password of that smoke account is in ignored, ACL-restricted `output/backend-local/smoke-account.json`; it is a disposable local test account and must never be created on the VPS.

Process state left behind: PostgreSQL on `127.0.0.1:55432` running; the backend stopped (keeping the runtime JAR free for Windows packaging); both smoke frontends (`:3021` and the stale `:3017` from the previous session) stopped; the pre-existing dev server on `:3000` untouched and still returning 200 for the demo board after the rebuild. Restart with `backend/scripts/run-local.ps1`.

This slice was then committed and pushed to `origin/main` as `673075c`. It is published in Git but **not** deployed: `https://app.stisistemas.com` still serves the earlier demo commit `bef587fbebcf921d39eb5ec2b2572606ec418c7a`.

Persistent local connection: `jdbc:postgresql://127.0.0.1:55432/sti_os`; schema `sti`; runtime user `sti_runtime`. Credentials and generated local ADMIN login are in ignored, current-user ACL-restricted `output/backend-local/credentials.json`. The DB is running on loopback. The backend was launched on `127.0.0.1:8080` for smoke testing, then stopped to release the JAR for packaging. An isolated frontend standalone package was launched on `127.0.0.1:3017` for smoke testing; an existing STI dev server on `:3000` was preserved and still returned 200 after build. Do not assume these processes survive a reboot; `backend/scripts/start-local.ps1` reuses the persistent DB and `run-local.ps1` starts the backend.

Checks on 2026-10-26: `npm run lint`, `npm run typecheck`, and `npm run build` all exited 0; production frontend built 19/19 static pages. `backend/scripts/test-local.ps1` passed **12 tests, 0 failures/errors/skips** on isolated PostgreSQL 15.3 and confirmed that synthetic cluster stopped. Local HTTP on backend and isolated same-origin frontend confirmed login 204, ADMIN identity, protected `/app` 200, logout 204, unauthenticated `/app` 307, public board 200 and no `/api/health` frontend proxy (404). This does not establish PostgreSQL 18 or VPS runtime behavior.

Final review fixes: `role: null` now returns 400, bootstrap re-entry requires an enabled matching ADMIN, and `/app` shows service unavailability for backend/network failures while redirecting only for denied sessions. The focused suite passed 12/12 after these edits, but its Maven `verify` packaging step could not rename the runtime JAR while our local backend was running on Windows. After stopping that owned process, a separate `mvn -DskipTests package` succeeded and produced all three JARs. Frontend typecheck and targeted ESLint passed. The updated `/app` unavailable-state UI has not been browser-smoked after this last edit.

The build must use JDK 21 explicitly; Maven defaults to JDK 17 on this workstation. PostgreSQL 15 binaries are installed; Docker daemon is unavailable. Use `backend/scripts/test-local.ps1` for an isolated synthetic cluster and Maven verification; it does not use the installed database service or VPS. See `backend/README.md` for configuration and all commands.

## Task domain, 2026-10-26

Decisions taken by the user this session, now recorded in `docs/definiciones-funcionales.md`: the visible task identifier is a **global correlative** `TAR-0001`; a device that cannot obtain GPS **records the reason and the action continues** instead of blocking the technician; and the slice scope is tasks, states and assignment, leaving signature and photos for the next one.

Implemented: migration `V2__tasks.sql` (`task`, `task_assignment`, `task_event`, `task_number_seq`), `POST /api/projects` for ADMIN, `GET /api/operators`, the task endpoints, and an authenticated board in `/app` with real data plus an ADMIN project form. `backend/README.md` holds the full rule set.

A real gap surfaced during verification and was closed inside this slice: there was no way to create a project, and without a project no task can exist, so the hierarchy client → project → task was unusable end to end.

Verified: **17/17** integration tests on isolated PostgreSQL 15.3 with the three JARs packaged; frontend typecheck, ESLint and production build clean; and an end-to-end HTTP run through the frontend proxy covering project creation, `TAR-0001`, assignment, start, confirmation to `FINALIZADO`, reopen with confirmations cleared, cancellation, and the ADMIN-only cancelled view. The traceability log came back in order as `CREADA, ASIGNADA, ESTADO, CONFIRMACION, ESTADO`, with two events carrying coordinates and two carrying an absence reason.

Not verified: the React board in a real browser. The Chrome extension disconnected mid-session and that check is still pending. `FACTURADO`, the client signature and the five photos are not implemented.

Two fixes found by verification, not by review: the production bundle needs `STI_API_ORIGIN` at **build** time or it ships no `/api` rewrites, and `task_event.occurred_at` uses `clock_timestamp()` because `now()` gave a confirmation and the `FINALIZADO` it triggers the same instant and lost their order.

## Verification details

- Main Java sources compiled against Boot 4.1.2. The 12-test result above supersedes the initial 10-test foundation run.
- The isolated test harness uses a temporary password file under an ACL-restricted output directory because PostgreSQL 15 `initdb` does not accept `--pwfile=-`. It removes that file and stops its synthetic cluster.
- Tests cover authentication, CSRF, session rotation/persistence/logout/expiry, customer isolation, disabled users, long email, ADMIN account creation and runtime DDL denial. Secure-cookie HTTPS behavior and deployed artifacts are not yet tested.
- The OpenAPI YAML parses with 9 paths. Local test report: `backend/target/surefire-reports/com.stisistemas.os.FoundationTest.txt`.

## Next steps

1. Browser-verify the authenticated task board once the Chrome extension is available again.
2. Next slice: client signature, the five photos in private storage, and the ADMIN-only `FINALIZADO → FACTURADO` transition that a valid signature unlocks.
3. Hand `server/mensaje-codex-verificar-pg18.md` to the server agent: PostgreSQL 18 parity, credential delivery and Nginx login rate limiting. The suite is Windows-only, so that message carries the equivalent commands; the VPS has no Maven installed.
4. Use the latest published commit for the PostgreSQL 18 parity check and VPS handoff. Deploy and validate it only when those checks and configuration are ready; the VPS still serves the earlier demo. No CI/CD pipeline is implemented yet.

Server report supplied by the user: administrative T1 checks passed, demo preserved, backend inactive/no `/api` proxy; first JAR/auth/health, external ports and external recovery remain pending. This is reported evidence, not a desktop verification of VPS state.

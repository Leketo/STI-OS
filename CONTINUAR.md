# STI-OS local development handoff

Updated: 2026-10-27, end of the day the application went public. This file describes the desktop repository, not the separate VPS handoff file.

## Start here, next session

Everything is pushed to `origin/main`. Check `git log -1` for the current head instead of trusting a hash written here.

**The application is live at `https://app.stisistemas.com` and it is empty**: zero accounts, tasks, photos and signatures. That is deliberate. It replaced the demo that used to be served there, commit `bef587fbebcf921d39eb5ec2b2572606ec418c7a`.

Verified from this desktop, which is a host outside the VPS, after the final deployment of 2026-10-27:

| From outside | |
| --- | --- |
| `/` and `/login` | 200 |
| `/app` without a session | 307 |
| `/api/health` | **404** — internal readiness is not published |
| Session cookie | `Secure; HttpOnly; SameSite=Lax` over real HTTPS |
| `Strict-Transport-Security` | `max-age=300`, on pages **and** error responses |
| `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` | present, including error responses |
| `X-Powered-By` | gone |

The root no longer serves the fictitious dashboard. Deployed on 2026-10-27 from `bab6a1c` and verified from outside: `/` answers **307 to `/login`** with `Cache-Control: no-store, must-revalidate, no-cache, max-age=0, private`, and following the redirect lands on the real login screen with no trace of the demo. `/demo` still serves the demonstration at 200. The cache header mattered: the root used to be static with `s-maxage=31536000`, and a cached copy would have hidden the redirect no matter how correct the deployment was. Rollback for that deployment: `sudo /srv/sti-os/private/docs/20261027T132246Z-frontend-bab6a1c/rollback-frontend.sh`.

### What to do next, in this order

1. **Raise HSTS to a year.** It sits at `max-age=300` on purpose: HSTS is remembered by browsers, so a year-long value plus a certificate problem locks clients out with no way to reach them. It was left short until the deployment proved stable. It now has; raise it to `31536000`, still without `includeSubDomains` and without `preload`.
2. **Create the first real ADMIN**, with the bootstrap JAR. Until that exists, nobody has verified a valid login, session and logout against the **public** site — only against loopback and the tunnel. That verification is the last gap in the authentication story, and it cannot be closed without an account. The owner does this by hand in their own SSH session, reading the password with `read -rsp` so it reaches neither the shell history nor an agent transcript: a password pasted into an agent prompt lives in that tool's log, which is why the first one generated for this account was rotated before it was ever used.
3. **Decide the external backup.** Today the backup is local, on the same machine. If the VPS is lost, everything is lost with it, including the signatures, which are the client's proof of conformity. This is the one open risk that matters before real data is loaded, and it has been open since 25/10.
4. Read the errors in `/srv/sti-os/private/docs/20261027T041938Z/REPORT.md`. Two checks failed during the header cutover; both triggered the rollback and the site came back at 200. The recovery worked, but nobody has looked at *why* they failed.

### Launching the server agent

Launch it from PuTTY as plain `codex`, with no flags, and run it **inside tmux**. Two sessions were lost to this: one that died when the SSH connection dropped, and two that could do nothing because they were sandboxed — `sudo` refused by `NoNewPrivileges`, no systemd bus, no DNS. Same `codexdev` user both times; the difference is how the session is started. A session that arrives through the Codex app-server daemon or the code-mode host runs confined and is useless for server work.

Put this at the top of every server handoff so a bad session fails in ten seconds instead of ten minutes:

```
Antes de nada, comprobá tu propio entorno:
  sudo -n true && echo sudo-ok
  systemctl is-system-running
  getent hosts app.stisistemas.com
Si sudo está bloqueado por "no new privileges", no hay systemd, o no resuelve
DNS, estás en una sesión sandboxeada y no sirve para este trabajo. Pará ahí y
decilo, sin buscar rodeos.
```

### Rollback, tested and ready

```bash
sudo /srv/sti-os/private/docs/20261027T041938Z/rollback-current-production.sh
```

That returns both the frontend and Nginx to the previous production state. An earlier one for Nginx alone is at `20261027T040332Z/rollback-nginx.sh`. Server evidence lives under `/srv/sti-os/private/docs/<timestamp>/`, `root:root 0600`, one directory per session.

### What is finished

The application itself. Authentication, accounts, clients, projects, the whole task domain with states and multiple assignees, GPS traceability, photos, client signature and invoicing — implemented, covered by 19 integration tests, verified on PostgreSQL 18.6 on the server, and exercised in a real browser against the real deployment. The functional cycle the client described is closed end to end.

What is **not** built, and was never in scope for this slice: editing a task's title or detail, deleting photos, notifications, the ERP integration and the time-tracking feature of the second commercial phase.

Local stack, if the processes below are gone (a reboot kills them):

```powershell
./backend/scripts/start-local.ps1          # reuses the persistent cluster and applies new migrations
./backend/scripts/run-local.ps1            # backend on 127.0.0.1:8080, separate terminal
cd frontend; $env:STI_API_ORIGIN = 'http://127.0.0.1:8080'; npm run dev    # http://localhost:3000/login
```

Left running at the end of the session: PostgreSQL on `127.0.0.1:55432`, backend on `127.0.0.1:8080`, a **standalone production** frontend on `127.0.0.1:3021` (that one already has the `/api` proxy baked in, so `http://127.0.0.1:3021/app` works immediately), and a **pre-existing dev server on `:3000` that belongs to the user — do not kill it**. Local ADMIN credentials: `output/backend-local/credentials.json`, Git-ignored and ACL-restricted; never paste the values anywhere.

Traps that already cost time, all confirmed on this machine:

- Build with **JDK 21 explicitly**; Maven picks 17 by default here. The repository now carries the Maven wrapper, so `./mvnw` works without a system Maven; the server is meant to use it.
- **Stop the local backend before packaging.** Windows locks the running JAR and the Maven rename fails.
- `STI_API_ORIGIN` must be set **at build time** for the production bundle, not only at runtime: `next.config.ts` resolves it inside `rewrites()`, which Next evaluates during the build. Without it the bundle ships zero `/api` rewrites. To check a build, confirm `rewrites.afterFiles` in `.next/routes-manifest.json` is **not empty** and covers `/api/auth`, `/api/tasks` and `/api/projects`. Do **not** check it against a fixed count: the number grows with every endpoint, and a stale number in a handoff once led a server session to edit `next.config.ts` until the count matched, dropping a rule in the process. The config file is the source of truth; a mismatched manifest means the build is wrong, never the file.
- `backend/scripts/test-local.ps1` builds its own throwaway PostgreSQL cluster. It never touches the persistent dev database or the VPS.
- **Stop the standalone frontend before `npm run build`.** A `node server.js` running from `.next/standalone` locks that directory and the build dies with `EBUSY: rmdir`, after having already emptied it. Same class of trap as the JAR lock.
- Launching that script as a hidden background process with redirected output **sometimes dies before Maven runs**, leaving no output and its synthetic cluster still listening. It happened twice on 2026-10-26, to two different agents, and re-running it worked each time. It is a launcher flake, not a backend failure: do not diagnose the backend over it. Check for a leftover `output/backend-test-*` cluster with `pg_ctl status` and stop it before retrying.
- Docker daemon is unavailable; PostgreSQL 15 is the local version and 18 is the VPS one.

Current state of the work: authentication, accounts, clients, projects, the full task domain, client signature, photos and invoicing are implemented and verified locally, and the suite also passes on the VPS against PostgreSQL 18.6. The functional cycle the client described is closed end to end. Still unverified: the deployed service, HTTPS, Nginx rate limiting and backup consistency between the database and the uploads directory. The server agent's pending work is written in `server/mensaje-codex-verificar-pg18.md` and has not been handed over yet.

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

Published as `4393228` on `origin/main`. Not verified: the React board in a real browser. The Chrome extension disconnected mid-session and that check is still pending. `FACTURADO`, the client signature and the five photos are not implemented.

Two fixes found by verification, not by review: the production bundle needs `STI_API_ORIGIN` at **build** time or it ships no `/api` rewrites, and `task_event.occurred_at` uses `clock_timestamp()` because `now()` gave a confirmation and the `FINALIZADO` it triggers the same instant and lost their order.

## Signature, photos and invoicing, 2026-10-26

Decisions taken by the user, recorded in `docs/definiciones-funcionales.md`: photos are **JPEG and PNG up to 10 MB**, verified by their own bytes rather than by the declared type; a superseded signature is **kept as evidence** when a signed task is reopened; and photos may be uploaded by assignees, ADMIN, SUPERVISOR **and the company's CLIENTE**, while the task is open.

Implemented: migration `V3__signatures_photos.sql`, photo upload and streaming, the signature endpoint with its PNG stroke, and the ADMIN-only `FINALIZADO → FACTURADO` transition that a signature in force unlocks and that nothing moves out of. In the UI: a signature pad drawn with finger or stylus, photo upload with a counter, thumbnails, and an expandable panel with photos, signatures and the full history.

Bytes live in the private uploads directory (`STI_UPLOADS_DIR`, development default `output/backend-local/uploads`), never in the database and never under Nginx. The backend streams them only to an account that can already see the task.

Verified: **19/19** integration tests on isolated PostgreSQL 15.3; frontend typecheck and ESLint clean; production build with the proxy baked in; and an end-to-end HTTP run through the frontend proxy that rejected a non-image, stored and downloaded a PNG byte-identical, refused invoicing before the signature, signed, refused a second signature with 409, served the stroke as `image/png`, invoiced, refused to leave `FACTURADO`, and on a second task confirmed that reopening leaves the signature stored but no longer in force.

Not verified: the React board, the signature pad and the upload control in a real browser. That check is still pending from the previous session.

One test changed meaning rather than breaking: a USUARIO asking for `FACTURADO` now gets 403 instead of 400, because the role can never invoice and the permission is evaluated before the transition's validity.

## Independent test pass and its two fixes, 2026-10-26

A second agent tested commit `5592d96` without touching code: 19/19 on the first run, and a real browser pass over creation, photos, states, **denied geolocation**, mouse-drawn signature, reopening, a second signature, `FACTURADO`, the CLIENTE view with a remote signature, and the board at 390 px with no horizontal overflow. Its report is at `output/informe-pruebas-2026-10-26.md`, which Git ignores.

It found two things and both were fixed:

- A `.txt` renamed to `.jpg` was rejected, but with the generic "Revisá los datos ingresados". Photo rejections now answer with distinct statuses — 415 not an image, 413 too large, 409 already five, 400 task closed — and the board names the real problem. A `MaxUploadSizeExceededException` handler was added, without which an oversized upload surfaced as a server error instead of 413.
- Assignment controls stayed visible on a `FACTURADO` task. The backend already refused the write; the interface now hides them whenever the task is not `POR_HACER` or `EN_PROCESO`, matching the rule.

Re-verified after the fixes: 19/19, typecheck and ESLint clean, production build, and a run through the proxy confirming 415, 413, 409 and 400 each on its own path.

What that pass did **not** cover, stated by the tester: a forced sixth photo straight to the server, which is now covered by the test above; a physical device or real GPS fix; PostgreSQL 18; the VPS.

## PostgreSQL 18 parity: verified on the server, 2026-10-27

**The suite passed 19/19 on the VPS against PostgreSQL 18.6** (`Ubuntu 18.6-0ubuntu0.26.04.1`, x86_64), with `BUILD SUCCESS` and the three JARs built there. No behaviour differed from PostgreSQL 15: not in Flyway, not in the runtime privileges, not in the Spring Session tables. The long-standing "results on 15 do not prove parity with 18" caveat is now closed.

How it ran, and what that establishes:

- The repository was cloned on the server through a **read-only deploy key** on the `ubuntu` account, after the earlier session proved the VPS had no GitHub credentials at all.
- `./mvnw` built it with **no system Maven**: the wrapper downloaded Maven 3.9.3 into the user's `~/.m2` and installed nothing. Adding the wrapper paid for itself the first time it was used.
- The database was a throwaway `sti_os_test` with its own roles, never `sti_os`.
- `pg_hba` did **not** block the test roles. An earlier attempt failed with `28P01`, which looked like a configuration wall but was only a pre-existing `test_migrator` role left by the previous session carrying a different password. Worth remembering: `28P01` means the connection was accepted and the password was wrong; a real `pg_hba` block says so by name.

What this does **not** establish: the deployed service, HTTPS and Secure cookies, the credential delivery under systemd at runtime, Nginx rate limiting, or backup consistency between the database and the uploads directory.

## The application is public, 2026-10-27

The server session replaced the enabled Nginx site in one move, with `nginx -t` before reloading, a backup kept, and a rollback script tested beforehand at `/srv/sti-os/private/docs/20261027T040332Z/rollback-nginx.sh`. Its report is in that same directory. Backend and frontend are `active/enabled` and listen only on loopback behind Nginx; the `db-runtime` residue was retired; the preview unit was stopped; and the database and uploads hold no synthetic data.

**Verified independently from this desktop, which is a host outside the VPS** — the measurement the server session could not make from inside:

- `/` and `/login` answer 200, `/app` answers 307 without a session.
- **`/api/health` answers 404 from outside.** The internal readiness endpoint is not published.
- `/api/auth/csrf` answers 200 and sets `STI_SESSION=…; Path=/; Secure; HttpOnly; SameSite=Lax`. That cookie, observed over real HTTPS from another machine, is the proof that the service is **not** running the `local` profile, whose only effect is to drop the `Secure` flag.

The server session additionally reported login/session/logout at 204/200/204 over HTTPS and the login rate limit returning 429 on a burst and recovering after 21 seconds.

**There is no real ADMIN yet**: zero accounts, tasks, photos and signatures. The system is published and empty, which is the right state. The first administrator is created with the bootstrap JAR when the owner decides.

Two hardening gaps were found in the public response headers right after the cutover, and both were closed the same day in a second deployment: `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY` and `Referrer-Policy: strict-origin-when-cross-origin` are now served on pages **and** on error responses, which is where they matter for a 401 or a 429. `X-Powered-By` was turned off in `next.config.ts` rather than stripped at the server, because the framework announcing itself is a code decision, not a proxy one.

HSTS deliberately sits at `max-age=300` rather than a year. Browsers remember it: a long value combined with a certificate problem locks clients out for that whole period with no way to reach them. Short first, raise once the deployment has proved stable.

That second deployment also carried the frontend rebuild that fixed the two-second location timeout left behind by the first one. Two checks failed mid-cutover; both triggered the tested rollback and the site returned 200. The errors are in `/srv/sti-os/private/docs/20261027T041938Z/REPORT.md` and have not been analysed.

## Browser verification, done at last, 2026-10-27

Verified from this desktop, driving Chrome against the **real VPS deployment** through an SSH tunnel to `127.0.0.1:3002`, with no port exposed. This closes the check that had been pending since the task board was written.

- Login as ADMIN through the proxy, board rendering real data in four columns.
- **The location rule works in a real browser.** A state change ran with the location permission never granted: the action completed and the history recorded `ESTADO → EN_PROCESO · sin ubicación`. That is the decision taken on 26/10, now confirmed against the deployment rather than against a simulation.
- **A signature drawn with the mouse** was stored and the stroke came back rendered, served by the backend from the private uploads directory. `Firmar conformidad` was replaced by `Marcar facturada`, so invoicing unlocks only once signed.
- **Reopening superseded it**: the card returned to EN_PROCESO and the signature stayed as `Firma superada`, greyed out but intact with its stroke.
- **A photo uploaded** from a real file picker: counter `1/5`, badge on the card, thumbnail served back.
- **The CLIENTE view obeys its rules**: three columns with no `Facturadas`, no state buttons at all, no unassign control, but it can attach photos and read the history.
- Logout returns `/app` to a 307, and the public demo stayed at 200 throughout.

Not re-done here, because the same code was already browser-verified locally on 26/10: the remote signature by a CLIENTE, and the 390 px layout. The window resize did not take effect in this session and was not worth fighting.

That run surfaced a usability cost, not a defect: **every action waits up to ten seconds** while the browser tries for a location fix before the request is sent, so a technician who denies the permission, or who is somewhere without a fix, sees "Guardando…" on every step. The server was never the slow part.

The ceiling was briefly cut to two seconds and then **put back to ten on purpose**: a cold GPS rarely answers faster, and shortening it would have filled the log with "sin ubicación" for technicians who did grant the permission — the opposite of what the traceability rule is for. What was kept is accepting a **position cached within the last minute**, so a device that already has a fix answers instantly instead of waiting out a timeout for nothing; a person does not move far in a minute. The rule itself never changed: coordinates when available, an explicit reason when not.

Worth measuring in the field rather than guessing: how many actions end up without coordinates on a real phone. That number, not an argument, is what should decide the timeout.

## The whole cycle ran on the VPS, 2026-10-27

Reported by the server session, with evidence kept at `/srv/sti-os/private/docs/20261027T030011Z/`. Not independently verified from this desktop.

**The functional cycle ran end to end on PostgreSQL 18.6 on the server**: the migrator JAR with the migration credentials (exit 0, Flyway validated the three migrations), the bootstrap JAR creating the first synthetic ADMIN (exit 0), then against `127.0.0.1:8080` login 204, `/api/auth/me` 200 as ADMIN, logout 204 and `/api/auth/me` 401 afterwards, plus CSRF 200, client/project/task creation 201, photo upload 201 and download 200, signature 201 and download 200.

**The backup question is answered.** Today's backup included a real photo and signature on the same task; the database was restored into an isolated PostgreSQL 18.6, the tar extracted, and both rows kept the same `task_id` while both PNGs were readable with hashes matching the originals. That supersedes the 25/10 rehearsal, which proved nothing about this because the uploads directory was empty then. The synthetic data was cleaned afterwards and every count is back to zero.

**The credential mechanism is settled: the config tree, not the legacy file.** The unit loads `STI_DB_URL`, `STI_DB_USER`, `STI_DB_PASSWORD` and `STI_UPLOADS_DIR` into `/run/credentials/sti-backend.service/` with `SPRING_CONFIG_IMPORT=configtree:`. The older `db-runtime`, holding only a password, is not loaded by that unit and nothing references it; it survives as residue and should be retired deliberately rather than left to confuse the next reader.

Two failures during that run were the test harness, not the application: a trailing newline mismatch between the password the harness sent and the one bootstrap had received, which produced a first 401; and a `KeyError` while the harness serialised its own manifest, worked around by reading the metadata from the database.

## The backend runs on the VPS, 2026-10-27

Reported by a server session with real administrative access, and not independently verified from this desktop: **the service is active on `127.0.0.1:8080` and `/api/health` returns 200.** Since that endpoint includes database connectivity, the application reached PostgreSQL 18 using credentials delivered by systemd — which answers the question left open on 26/10, when we knew the credential files arrived but not that the application consumed them.

Also reported: the public demo still answers 200 and was not modified; Nginx validates and the only enabled site is still the demo's; `NeedDaemonReload=no`, so nothing is half-applied; `/etc/sudoers.d/codex-sti-os` does not exist, meaning that session always had sudo and the earlier one was blocked by its own sandbox, not by the host. The audit found the state left by the previous session coherent and changed nothing. Its report is at `/srv/sti-os/private/docs/20261027T025309Z/REPORT.md`, `root:root 0600`.

Two things to keep in view:

- The service is running but **disabled** for autostart. That is the right state for now, but it is a decision to revisit, not an oversight to inherit.
- The unit modified at 02:41 has no `.bak` under `/etc/systemd/system`; the backups live as `*.before` inside the evidence directory. The rollback path exists but is not where someone would look for it first.

Still pending: the login rate limit is prepared and **not active**. Turning it on means replacing the currently enabled site file, which is the one serving the demo — so it should be done together with exposing `/api`, not before, since taking that risk buys nothing until then.

## VPS deployment: blocked on an administrative session, 2026-10-27

A second server session could not act at all: `sudo` was refused by its isolation, `/home/ubuntu/sti-os` returned permission denied, and `systemctl` could not reach the system bus. It changed nothing — no pull, no services, no Nginx, no database, no credentials — and reported the exact errors instead of working around them. Its notes are on the server as `informe-vps-2026-10-27-continuacion.md`.

So the deployment is not blocked by anything technical: it needs a session that actually holds administrative access on the host, or the work done by hand over SSH.

One thing it raised that must be reconciled before the service starts: the credential mechanism **reported** on 27/10 is not the one **documented** on 26/10. The unit already carried `LoadCredential=db-runtime:/etc/sti-os/credentials/db-runtime`, a single file holding only the password, while our configuration expects a config tree with files named `STI_DB_URL`, `STI_DB_USER`, `STI_DB_PASSWORD` and `STI_UPLOADS_DIR`. The previous session says it added those files; nobody has yet confirmed the application reads them. Treat both as present and verify which one the running process actually consumes.

## VPS first pass, 2026-10-27: blocked on repository access

The server agent started the handoff and ran out of quota mid-run; its own report is on the server as `informe-vps-2026-10-27.md`. Nothing it reports has been verified from this desktop.

**The blocker is access, not code: the VPS cannot clone the repository.** It is private, and the server has no deploy key, no token and no stored credential. The agent looked in the environment, in the codex auth file, in its own platform token and in local snapshots, found nothing, and stopped instead of improvising. That is the correct outcome, and it blocks point 1 entirely: the suite cannot run against PostgreSQL 18 without the source.

What it reported doing before the block, all pending desktop confirmation:

- **The credential mechanism is confirmed as `LoadCredential`, not a config tree of its own.** The existing unit carried a single `db-runtime` file holding only the password. The agent added files named exactly `STI_DB_URL`, `STI_DB_USER`, `STI_DB_PASSWORD` and `STI_UPLOADS_DIR`, delivered at `/run/credentials/sti-backend.service/` as `root:root 0400`, so `SPRING_CONFIG_IMPORT=configtree:` resolves. Our design holds; it needed the extra files, not a different approach.
- The earlier report said "Java 21 installed"; the server actually had only the **JRE**. The agent installed `openjdk-21-jdk-headless` to be able to build. Reported-versus-verified paid off again.
- Nginx rate limiting prepared in `sites-available` and left disabled. It proposed 10 login attempts per IP per 10 minutes with burst 3, pending the owner's decision. It also found that enabling the new site alongside the existing one collides on `default_server`: activation must **replace** the current file, not add to it.
- **The backup is sequential, not atomic**: `pg_dump` runs, then uploads are tarred. A photo or signature written in between leaves a row without its file or a file without its row. It documented this rather than changing the script. Worth answering from our side: a missing file is not a crash — `Uploads.read` returns 404 for that one image and the rest of the task still loads.

Unblocking is a decision for the owner: a read-only deploy key on the VPS is the cleanest path.

## Verification details

- Main Java sources compiled against Boot 4.1.2. The 12-test result above supersedes the initial 10-test foundation run.
- The isolated test harness uses a temporary password file under an ACL-restricted output directory because PostgreSQL 15 `initdb` does not accept `--pwfile=-`. It removes that file and stops its synthetic cluster.
- Tests cover authentication, CSRF, session rotation/persistence/logout/expiry, customer isolation, disabled users, long email, ADMIN account creation and runtime DDL denial. Secure-cookie HTTPS behavior and deployed artifacts are not yet tested.
- The OpenAPI YAML parses with 9 paths. Local test report: `backend/target/surefire-reports/com.stisistemas.os.FoundationTest.txt`.

## Next steps

1. Browser-verify the authenticated task board, the signature pad and the photo upload once the Chrome extension is available again.
2. Tell the server agent that photos and signatures are **files**: the deployment needs the private uploads path wired through `STI_UPLOADS_DIR`, owned by the backend user, outside Nginx, and inside the backup. The 25/10 report already listed `/srv/sti-os/data/uploads`.
3. Hand `server/mensaje-codex-verificar-pg18.md` to the server agent: PostgreSQL 18 parity, credential delivery and Nginx login rate limiting. The suite is Windows-only, so that message carries the equivalent commands; the VPS has no Maven installed.
4. Use the latest published commit for the PostgreSQL 18 parity check and VPS handoff. Deploy and validate it only when those checks and configuration are ready; the VPS still serves the earlier demo. No CI/CD pipeline is implemented yet.

Server report supplied by the user: administrative T1 checks passed, demo preserved, backend inactive/no `/api` proxy; first JAR/auth/health, external ports and external recovery remain pending. This is reported evidence, not a desktop verification of VPS state.

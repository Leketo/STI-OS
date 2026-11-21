# Stack de trabajo STI-OS

Índice de entrada de este directorio. El estado del trabajo y lo que sigue están en **[CONTINUAR.md](CONTINUAR.md)**; este archivo solo orienta.
Este directorio se copió desde `C:\dev\STI\STI-OS` el 29/10/2026. Índice actualizado el 20/11/2026.

## Documentos

| Documento | Para qué |
|---|---|
| [CONTINUAR.md](CONTINUAR.md) | Traspaso de sesión: estado, próximos pasos, cómo levantar, trampas. **Se lee primero.** |
| [CLAUDE.md](CLAUDE.md) | Reglas de trabajo del agente de desarrollo, fijadas por el PO. Si algo choca con otro documento, vale este. |
| [coordinacion/](coordinacion/) | Registro de eventos: entregas, rectificaciones y decisiones, uno por archivo (`E-NNN-…`). |
| [docs/informe-corte-1-2026-11-19.md](docs/informe-corte-1-2026-11-19.md) | Corte 1, "Tareas que no se traban": criterios CA-01 a CA-11 con comando, resultado y evidencia ([docs/evidencia-corte-1/](docs/evidencia-corte-1/)). |
| [docs/informe-corte-2-2026-11-19.md](docs/informe-corte-2-2026-11-19.md) | Corte 2, "Usuarios y contraseñas": criterios CA-12 a CA-27, límites de la vuelta atrás y respuestas del encargo ([docs/evidencia-corte-2/](docs/evidencia-corte-2/)). |
| [docs/informe-corte-2b-2026-11-20.md](docs/informe-corte-2b-2026-11-20.md) | Corte 2B, "Recuperar la contraseña y frenar intentos": criterios CA-28 a CA-43, credenciales y comandos para el servidor, sumas de los JAR ([docs/evidencia-corte-2b/](docs/evidencia-corte-2b/)). |
| [docs/informe-e2e-2026-11-18.md](docs/informe-e2e-2026-11-18.md) | Prueba de punta a punta del 18/11 con datos falsos: matriz de reglas, hallazgos N-11 a N-18 (antes D1–D8) con archivo y línea. |
| [docs/definiciones-funcionales.md](docs/definiciones-funcionales.md) | Decisiones del cliente y preguntas abiertas. Manda sobre el relevamiento original. |
| [docs/stack-y-plan-tecnico.md](docs/stack-y-plan-tecnico.md) | Stack elegido, fases T1/T2/T3 y seguridad. Plan del 26/10; los hashes de commit que cita son históricos. |
| [docs/frontend-redesign.md](docs/frontend-redesign.md) | Especificación del rediseño Kanban y los arreglos posteriores. |
| [docs/revision-frontend-kanban.md](docs/revision-frontend-kanban.md) | Revisión medida del rediseño contra el backend real (hallazgos 1–9). |
| [docs/dominio-sti-os.md](docs/dominio-sti-os.md) | DNS de `app.stisistemas.com`. |
| [docs/adopcion-starter-kiranism.md](docs/adopcion-starter-kiranism.md) | Por qué se adoptó el starter de Kiranism para la demo. |
| [backend/README.md](backend/README.md) | Backend: comandos, reglas de dominio, configuración y seguridad. |
| [backend/api/openapi.yaml](backend/api/openapi.yaml) | Contrato de la API. |
| [frontend/README.md](frontend/README.md) | Frontend: `/app`, comprobaciones y doble de API (`ui-fixture-server.mjs`). |

## Dónde está cada cosa

| Ruta | Qué es |
|---|---|
| `backend/` | Java 21 / Spring Boot 4.1.2, JDBC, Flyway V1–V5, sesiones en PostgreSQL, correo de recuperación por SMTPS. Scripts en `backend/scripts/`: `ensayo.ps1` (entorno efímero en Docker), `start-local.ps1` y `run-local.ps1` (base de desarrollo persistente), `test-local.ps1` (suite sobre un cluster temporal), `ensayo/matriz-api.mjs` (matriz de reglas por API con datos falsos), `ensayo/recuperacion-e2e.mjs`, `ensayo/tiempos-corte2b.mjs` y `ensayo/calibracion-tope.mjs` y `consultas/` (consultas de solo lectura, como `tareas-trabadas.sql`). |
| `frontend/` | Next.js 16 / React 19. `/app` autenticado con Kanban. El prototipo `/demo` se quitó en el corte 3B. |
| `docs/` | Documentación de producto y técnica. `docs/transcripciones/` está **fuera de Git**. |
| `server/` | Todo lo del VPS: inventario, entrega, checklist, mensajes al agente del servidor y la auditoría del 29/10 (`auditoria-servidor-2026-10-29/`). **Fuera de Git**. |
| `output/` | Evidencia de corridas y bases locales: `backend-local/` (base de desarrollo), `ensayo/` (última prueba de punta a punta), informes viejos. **Fuera de Git**. |
| `new_version/` | Plantilla genérica de sistema de diseño (TypeUI, "Kanban PM Kit") que se usó como referencia para el rediseño. **No es** otra versión de la aplicación. |
| `.starter-source/` | El starter original, con su propio `.git`. **Fuera de Git**. |
| `job-seeker/` | Otro proyecto, sin trackear. No pertenece a STI-OS. |

## Enlaces

- **Repositorio:** `https://github.com/Leketo/STI-OS`, rama `main`; cada corte trabaja en su rama (el 2B en `feat/recuperar-contrasena`) y `main` avanza solo por fast-forward.
- **Aplicación:** `https://app.stisistemas.com`. En línea desde el 19/11: `v0.2.0-candidato.1` (`7232b9d`), según E-008 y E-009. `/` redirige a `/login` y `/demo` sigue pública.
- **Dominio y DNS:** registro A de `app.stisistemas.com` → `54.39.110.0` en Toledo Hosting. Detalle en `docs/dominio-sti-os.md`.
- **VPS:** `vps-ffc655c1` en OVH, Ubuntu 26.04.1, PostgreSQL 18.6. Inventario en `server/ovh-vps-development.md`. La evidencia del servidor vive allá, en `/srv/sti-os/private/docs/<timestamp>/`.
- **Local:**
  - Ensayo: base en `127.0.0.1:5434`, backend en `:8099`, frontend en `:3000`.
  - Desarrollo: PostgreSQL en `127.0.0.1:55432`, backend en `:8080`.

## Qué no se copió desde `C:\dev`, y por qué

Solo lo que se regenera con un comando: `frontend/node_modules` (`npm ci`), `frontend/.next` (`npm run build`), `backend/target` (`./mvnw package`) y los clusters temporales `output/backend-test-*`. `output/backend-local` sí se copió, porque es la base de desarrollo persistente.

## Credenciales

`output/vps-admin-credentials.txt` y `output/backend-local/credentials.json` están fuera de Git y existen también en el origen, `C:\dev\STI\STI-OS`: hay dos copias en disco. Nunca se pegan en chats ni en commits.

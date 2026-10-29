# Stack de trabajo STI-OS

Índice de entrada de este directorio. Copiado desde `C:\dev\STI\STI-OS` el 29/10/2026.
Para el estado real del trabajo y qué sigue, el documento vivo es **[CONTINUAR.md](CONTINUAR.md)** — este archivo solo orienta.

## Dónde está cada cosa

| Ruta | Qué es |
|---|---|
| `CONTINUAR.md` | Handoff del escritorio: estado, trampas confirmadas, próximas rodajas. Se lee primero. |
| `backend/` | Java 21 / Spring Boot 4.1.2, PostgreSQL, sesiones JDBC. Comandos y JDBC en `backend/README.md`. |
| `frontend/` | Next.js. Adoptado del starter de Kiranism, ver `docs/adopcion-starter-kiranism.md`. |
| `docs/` | Dominio, definiciones funcionales, stack y plan técnico, transcripciones. |
| `server/` | Todo lo del VPS: inventario y plan de seguridad, entrega, checklist, mensajes al agente del servidor. **Fuera de Git** por `.gitignore`. |
| `output/` | Evidencia de corridas: capturas de browser, informes de prueba, base local. **Fuera de Git**. |
| `new_version/` | Diseño y skill de la versión siguiente de la interfaz. |
| `.starter-source/` | El starter original de referencia, con su propio `.git`. **Fuera de Git**. |

## Enlaces

**Repositorio** — `https://github.com/Leketo/STI-OS`, remote `origin` ya configurado acá; rama `main`.

**Aplicación** — `https://app.stisistemas.com`. En producción y vacía a propósito: cero cuentas, tareas, fotos y firmas. `/` redirige 307 a `/login`; `/demo` sigue sirviendo la demostración, que se conserva deployada porque de ahí sale el lenguaje visual que `/app` todavía no tiene.

**Dominio y DNS** — registro A de `app.stisistemas.com` → `54.39.110.0`, creado en [Toledo Hosting](https://us.cloudlogin.co/dns/records/). El dominio principal `stisistemas.com` sigue apuntando al hosting, intacto. Detalle en `docs/dominio-sti-os.md`.

**VPS** — `vps-ffc655c1` en OVH, Ubuntu 26.04.1. Inventario y estado de seguridad en `server/ovh-vps-development.md`; la entrega del proveedor en `server/entrega-vps-2026-10-25.md`. La evidencia del servidor vive allá, en `/srv/sti-os/private/docs/<timestamp>/` como `root:root 0600`, y no se replica acá.

**Local** — backend `127.0.0.1:8080`, PostgreSQL `127.0.0.1:55432` (`jdbc:postgresql://127.0.0.1:55432/sti_os`, esquema `sti`), frontend dev en `:3000`. Los arranques están en `backend/scripts/start-local.ps1` y `run-local.ps1`.

## Qué no se copió, y por qué

Se dejó afuera solo lo que se regenera con un comando:

- `frontend/node_modules` (480 MB) → `npm install`
- `frontend/.next` (232 MB) → `npm run build`
- `backend/target` (80 MB) → `./mvnw package`
- `output/backend-test-*`, 19 directorios (880 MB) → son clústeres `pgdata` efímeros que crea `backend/scripts/test-local.ps1` en cada corrida

Sí se copió `output/backend-local`: esa es la base de desarrollo persistente, no un descarte.

El `.git` vino completo — mismo HEAD, mismo remote, `fsck` limpio.

## Credenciales

`output/vps-admin-credentials.txt` y `output/backend-local/credentials.json` viajaron en la copia. Siguen existiendo también en el origen. Están fuera de Git por `.gitignore`; que este directorio esté bajo `C:\tools\repository` no cambia eso, pero conviene recordar que ahora hay dos copias en disco.

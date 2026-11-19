# STI-OS — traspaso de sesión

Actualizado: **19/11/2026**. Es el documento vivo y se lee primero. El índice de todo lo demás está en [STACK.md](STACK.md); las reglas de trabajo, en [CLAUDE.md](CLAUDE.md); el registro de entregas y decisiones, en [coordinacion/](coordinacion/).
La versión anterior de este archivo (25 al 27/10, con todo el detalle del despliegue en el VPS) está en git: `git show e954689:CONTINUAR.md`.

## Qué es

STI-OS es la aplicación de órdenes de servicio de STI Sistemas, una empresa de servicios técnicos en terreno en Paraguay.

- **Jerarquía:** cliente → proyecto → tarea.
- **Roles:** ADMIN, SUPERVISOR, USUARIO (técnico) y CLIENTE.
- **Estados de una tarea:** `POR_HACER → EN_PROCESO → FINALIZADO → FACTURADO`, más `ANULADA`.
- **Para llegar a FINALIZADO** tiene que confirmar cada asignado. Desde D-26 (19/11) una tarea no se inicia sin asignados, no se queda sin asignados en curso, y se finaliza si se quita al único pendiente.
- **Para facturar** hace falta una firma de conformidad vigente, presencial o remota.
- **Fotos:** 5 por tarea como máximo, JPEG o PNG, verificadas por sus bytes.
- **Ubicación:** cada paso guarda la posición GPS o el motivo por el que no la hay.

Las reglas de negocio están en [docs/definiciones-funcionales.md](docs/definiciones-funcionales.md) y las técnicas en [backend/README.md](backend/README.md).

## Estado al 19/11/2026

**Código:**
- **Corte 1, "Tareas que no se traban" (ENCARGO-DEV-001 v2):** se entrega como `v0.1.1-candidato.1`. Informe: [docs/informe-corte-1-2026-11-19.md](docs/informe-corte-1-2026-11-19.md). Corrige N-11 a N-17 y aplica D-26. No migra la base. **Publicado** el 19/11 a las 18:15 UTC (E-008).
- **Corte 2, "Usuarios y contraseñas" (ENCARGO-DEV-002):** se entrega como `v0.2.0-candidato.1`. Informe: [docs/informe-corte-2-2026-11-19.md](docs/informe-corte-2-2026-11-19.md). Pantalla Usuarios, contraseña inicial generada por el sistema, primer ingreso, "Mi contraseña", filtro de estado. **Trae la migración V4** (solo agrega) y la reescritura `/api/accounts/:path*`. **Aceptado por el PO (E-007). Publicado** el 19/11 a las 18:50 UTC (E-008).
- Cada corte trabaja en su rama (el 2 en `feat/usuarios-y-contrasenas`); `main` avanza solo por fast-forward.

**Producción** (`https://app.stisistemas.com`), según lo que informó el PO el 19/11 (E-008). El desarrollo no lo verificó: no toca el servidor.
- Dos pases el 19/11, en el orden de D-92:
  - `v0.1.1-candidato.1` (`c8b36fa`) a las 18:15 UTC;
  - `v0.2.0-candidato.1` (`7232b9d`) a las 18:50 UTC. **Es lo que corre hoy.**
- Antes del segundo pase, el servidor ensayó V4 sobre una copia restaurada de los datos reales, con el mismo resultado (D-93).
- Base: **Flyway en 4.** El migrador tardó 1,9 s y ninguna cuenta quedó con cambio obligatorio de contraseña. **Los datos son reales.**
- Las 9 reescrituras de `/api` llegan al backend.
- Releases en línea (E-009):
  - backend `20261119T183954Z-7232b9d`;
  - frontend `20261119-7232b9d1-production` (Build ID `hw7N8WwQbv1mgeSNKD_xD`).
- Release anterior conservada: la del corte 1.
- **Encargo 001 del servidor ("tener a dónde volver"): CERRADO.** La vuelta atrás está ensayada y tarda unos 6 s.
- HSTS sigue en 300 s.
- Tareas trabadas en producción: **0**. El servidor lo midió tres veces el 19/11 (13:31, 18:11 y 18:46 UTC); no hay nada que reparar.

**Pruebas:**
- 18/11, antes del corte: [docs/informe-e2e-2026-11-18.md](docs/informe-e2e-2026-11-18.md). Suite 19/19, matriz por API 110 OK y 4 fallas.
- 19/11, corte 1: suite 25/25 contra PG 18.6 y matriz por API 120 OK y 0 fallas. Detalle y límites en el informe del corte.
- 19/11, corte 2: suite 41/41 contra PG 18.6, matriz por API 194 OK y 0 fallas, y la matriz del corte 1 con el JAR de v0.1.1 contra el esquema 4: 120 OK.

## Lo próximo, en orden

Los defectos del 18/11 se numeran N-11 a N-18 (antes D1 a D8). Las decisiones del PO usan la serie D-NN; los defectos propios del desarrollo, DEV-NN.

1. **QA de los cortes 1 y 2:** 0/11 y 0/16. Empieza la noche del 19/11. Los dos cortes ya están publicados. Si hiciera falta volver a v0.1.1, esa vuelta tiene los dos límites escritos en el informe del corte 2 (CA-25).
2. **Corte 2B, sin encargo todavía. No se empieza:**
   - N-30, límite de intentos fallidos de ingreso;
   - N-32, texto propio del panel tras restablecer;
   - actualizar el doble de API `frontend/scripts/ui-fixture-server.mjs`;
   - D-101, que el JAR diga de qué commit salió;
   - N-35, que el migrador lea la contraseña del directorio de credenciales y no de una variable de entorno;
   - D-102: `allowScripts` de `unrs-resolver` **no se aprueba**.

   N-31 (desborde de "Filtros activos" a 360–370 px) va en el corte 3.
3. **Facturar pide confirmación** (N-18, decidido en D-15). Queda fuera del corte 1.
4. **Decisiones abiertas**, las decide el dueño:
   - ¿Los nombres de empresa son únicos?
   - ¿El estilo visual es el de `/demo` (lo pedido el 27/10) o el del rediseño del 29/10?
5. **Pendientes del servidor**, que se arrastran desde el 27/10 y **no se cierran solos**:
   - Subir HSTS a un año (`31536000`, sin `includeSubDomains` ni `preload`).
   - **Backup fuera del VPS.** Hoy el backup es local; si se pierde la máquina se pierden las firmas, y los datos ya son reales.
   - Analizar las dos verificaciones que fallaron en `/srv/sti-os/private/docs/20261027T041938Z/REPORT.md`.
   - Higiene que levantó la auditoría del 29/10 (`server/auditoria-servidor-2026-10-29/INFORME-GENERAL.md`, ignorado por git): sudo amplio, credenciales de prueba en `/tmp`, releases y unidades viejas habilitadas, sin monitoreo, paquetes pendientes.
6. **Rodaja decidida pero sin empezar: rastro de uso de la interfaz.** Las preguntas abiertas son:
   - ¿tabla o archivo?
   - ¿cuánto se retiene?
   - ¿qué se registra?
   - avisar al personal que es monitoreo.

   Antes de construirla hay que escuchar al primer cliente real.

## Cómo levantar en local

**Para probar: entorno de ensayo efímero.** Es lo recomendado y no toca nada persistente. Necesita Docker; Node 24.22.1 corre en un contenedor y no se instala en la PC.

```powershell
./backend/scripts/ensayo.ps1 -Accion Suite        # tests contra PG 18.6 en contenedor
./backend/scripts/ensayo.ps1 -Accion Interfaz     # build, lint, tipos, test:ui y npm audit con Node 24.22.1
./backend/scripts/ensayo.ps1 -Accion Levantar     # base 5434, backend 8099, interfaz en contenedor en 3000
node backend/scripts/ensayo/matriz-api.mjs output/ensayo   # matriz de reglas por API con datos falsos
./backend/scripts/ensayo.ps1 -Accion Bajar        # borra contenedores, secretos y libera puertos
```

- El admin de ensayo y sus credenciales están en `output/ensayo/secretos.json`, que Bajar borra. Las cuentas falsas de la matriz reciben una contraseña al azar en cada corrida.
- `-Frontend prod` compila la interfaz en la PC en lugar del contenedor; la evidencia de una entrega sale del contenedor.

**Para desarrollar con datos que persisten:** la base de desarrollo en `output/backend-local`, PostgreSQL 15 en `:55432`.

```powershell
./backend/scripts/start-local.ps1     # crea o reutiliza el cluster, compila, migra
./backend/scripts/run-local.ps1       # backend en 127.0.0.1:8080
cd frontend; $env:STI_API_ORIGIN='http://127.0.0.1:8080'; npm run build; node scripts/prepare-standalone.mjs
$env:PORT='3021'; node .next/standalone/server.js
```

**Trampas confirmadas en esta máquina:**
- **JDK 21 explícito.** `JAVA_HOME` del sistema apunta a 17. Los scripts lo fijan solos.
- **Maven.** `ensayo.ps1` usa `./mvnw.cmd`. `start-local.ps1` y `test-local.ps1` usan el `mvn` del sistema (3.9.3, que está instalado).
- **Windows PowerShell 5.1 y stderr.** Con `ErrorActionPreference=Stop`, cualquier línea que Maven, Mockito o docker escriben en stderr corta el script. `ensayo.ps1` usa `Continue` y revisa `$LASTEXITCODE`.
- **Lanzar `test-local.ps1` en segundo plano** con la salida redirigida a veces muere antes de llegar a Maven y deja su cluster escuchando. Pasó el 26/10 y otra vez el 18/11. Hay que revisar `output/backend-test-*` con `pg_ctl status` y bajarlo.
- **Procesos en segundo plano.** Si se detiene la tarea que los lanzó, se cae todo su árbol, backend incluido. Se terminan solo por PID (DEV-02).
- **`STI_API_ORIGIN`:**
  - se necesita **al compilar y al correr**;
  - debe ser exactamente `http://127.0.0.1:…`; `localhost` falla;
  - `ensayo.ps1` comprueba por contenido que el manifiesto traiga las reescrituras de `/api/auth`, `/api/tasks`, `/api/projects` y `/api/accounts`.
- **Detección de agentes de Next.** Con 16.4.2, `next build` terminaba con código 1 después de compilar si lo corría un agente (N-17). Con 16.4.6 el build sale 0 con las variables de agente puestas, y `ensayo.ps1` ya no tolera un build fallido. `next dev` con 16.4.6 desde un agente no se volvió a probar.
- **Bloqueos de archivos.** Hay que parar el backend antes de `package` (Windows bloquea el JAR) y parar el standalone antes de `npm run build` (`EBUSY`). `ensayo.ps1` copia los JAR para no bloquear `target/`.
- **Node.** El servidor usa 24.22.1; esta PC tiene 22.19 y no se actualiza (lo decidió el dueño). Lo que acredita una entrega corre en el contenedor `node:24.22.1-bookworm-slim`.

## Servidor

- **El agente de servidor es Claude, en `~/sti-agente`.** Codex ya no hace pases. Cómo se lanza ese agente no consta en este repositorio.
- **No hay vuelta atrás probada** hasta que el servidor cierre su encargo 001. Los scripts de reversión del 27/10 no se dan por válidos.
- La evidencia vive en `/srv/sti-os/private/docs/<timestamp>/` (`root:root 0600`).
- **Credenciales del backend.** Según lo que reportó el agente de servidor el 27/10, la unidad systemd entrega con `LoadCredential` los archivos `STI_DB_URL`, `STI_DB_USER`, `STI_DB_PASSWORD` y `STI_UPLOADS_DIR` en `/run/credentials/sti-backend.service/`, y Spring los lee con `SPRING_CONFIG_IMPORT=configtree:/run/credentials/sti-backend.service/`. Ese día `/api/health` respondió 200. No se verificó desde esta PC ni se volvió a medir el 19/11. El archivo viejo `db-runtime` no lo carga nadie y quedó como residuo. La misma versión está en [backend/README.md](backend/README.md).

## Preservar

- `server/`, `output/`, `docs/transcripciones/` y `APP Servicio STI 2026.txt` están **fuera de git**: un clon nuevo no los trae, y algunos enlaces de los documentos apuntan ahí.
- Credenciales locales: `output/backend-local/credentials.json` y `output/vps-admin-credentials.txt`. Nunca se pegan en chats ni en commits.
- No desplegar, no hacer push a `main` sin entrega y no tocar evidencia del servidor como consecuencia automática de abrir este documento.
- `job-seeker/` en la raíz es otro proyecto, excluido en `.git/info/exclude`; no pertenece a este repo.

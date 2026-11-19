# STI-OS — traspaso de sesión

Actualizado: **18/11/2026**. Es el documento vivo y se lee primero. El índice de todo lo demás está en [STACK.md](STACK.md).
La versión anterior de este archivo (25 al 27/10, con todo el detalle del despliegue en el VPS) está en git: `git show e954689:CONTINUAR.md`.

## Qué es

STI-OS es la aplicación de órdenes de servicio de STI Sistemas, una empresa de servicios técnicos en terreno en Paraguay.

- **Jerarquía:** cliente → proyecto → tarea.
- **Roles:** ADMIN, SUPERVISOR, USUARIO (técnico) y CLIENTE.
- **Estados de una tarea:** `POR_HACER → EN_PROCESO → FINALIZADO → FACTURADO`, más `ANULADA`.
- **Para llegar a FINALIZADO** tiene que confirmar cada asignado.
- **Para facturar** hace falta una firma de conformidad vigente, presencial o remota.
- **Fotos:** 5 por tarea como máximo, JPEG o PNG, verificadas por sus bytes.
- **Ubicación:** cada paso guarda la posición GPS o el motivo por el que no la hay.

Las reglas de negocio están en [docs/definiciones-funcionales.md](docs/definiciones-funcionales.md) y las técnicas en [backend/README.md](backend/README.md).

## Estado al 18/11/2026

**Código:**
- `main` = `60115ab`, que incluye el rediseño Kanban con temas día y noche (commits del 29 y 30/10; el PR #1 se integró el 18/11).
- La rama de trabajo actual es `fix/ajustes-kanban`.

**Producción** (`https://app.stisistemas.com`), según los documentos del 27/10 y la auditoría del 29/10; **no se volvió a verificar**:
- Frontend `bab6a1c` en loopback `:3004`, backend en `:8080` y PostgreSQL 18.6.
- **El rediseño Kanban no está desplegado.**
- HSTS sigue en 300 s.

**Prueba de punta a punta del 18/11:** [docs/informe-e2e-2026-11-18.md](docs/informe-e2e-2026-11-18.md).
- Suite 19/19 contra PG 18.6.
- Matriz por API: 110 OK y 4 fallas.
- Recorrido completo en Chrome con todos los roles.

## Lo próximo, en orden

1. **Corregir la concurrencia en el backend.** Es lo único que bloquea cargar datos reales. Dos confirmaciones simultáneas dejan la tarea trabada (8 de 8 vueltas), las fotos simultáneas pasan de 5, y una firma simultánea da 500 y deja un archivo huérfano. También se traba al desasignar al último pendiente. Detalle y dirección del arreglo en el informe, D1–D4.
2. **Interfaz:**
   - Un 401 tiene que llevar al login (D5).
   - La fecha de la firma tiene que ser la local, no UTC (D6).
3. **Pasar `next` de 16.4.2 a 16.4.6** (D7) y revalidar dev, build y standalone.
4. **Decisiones del dueño:**
   - ¿Facturar pide confirmación?
   - ¿Los nombres de empresa son únicos?
   - ¿Cómo se gestionan las cuentas CLIENTE (listar, desactivar, cambiar contraseña)?
   - ¿El estilo visual es el de `/demo` (lo pedido el 27/10) o el del rediseño del 29/10?
5. **Pendientes del servidor**, que se arrastran desde el 27/10 y **no se cierran solos**:
   - Subir HSTS a un año (`31536000`, sin `includeSubDomains` ni `preload`).
   - Confirmar si existe el primer ADMIN real. El 27/10 decía cero cuentas; la auditoría del 29/10 registra un login válido posterior.
   - **Backup fuera del VPS.** Hoy el backup es local; si se pierde la máquina se pierden las firmas.
   - Analizar las dos verificaciones que fallaron en `/srv/sti-os/private/docs/20261027T041938Z/REPORT.md`.
   - Higiene que levantó la auditoría del 29/10 (`server/auditoria-servidor-2026-10-29/INFORME-GENERAL.md`, ignorado por git): sudo amplio, credenciales de prueba en `/tmp`, releases y unidades viejas habilitadas, sin monitoreo, paquetes pendientes.
6. **Rodaja decidida pero sin empezar: rastro de uso de la interfaz.** Las preguntas abiertas son:
   - ¿tabla o archivo?
   - ¿cuánto se retiene?
   - ¿qué se registra?
   - avisar al personal que es monitoreo.

   Antes de construirla hay que escuchar al primer cliente real.

## Cómo levantar en local

**Para probar: entorno de ensayo efímero.** Es lo recomendado y no toca nada persistente.

```powershell
./backend/scripts/ensayo.ps1 -Accion Suite                    # tests contra PG 18.6 en contenedor
./backend/scripts/ensayo.ps1 -Accion Levantar -Frontend prod  # base 5434, backend 8099, frontend 3000
./backend/scripts/ensayo.ps1 -Accion Bajar                    # borra contenedores, secretos y libera puertos
```

- El admin de ensayo y sus credenciales están en `output/ensayo/secretos.json`, que Bajar borra.
- Los datos falsos se cargan por la API. El script de la prueba del 18/11 no está en el repo; su lógica está descrita en el informe.

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
- **Procesos en segundo plano.** Si se detiene la tarea que los lanzó, se cae todo su árbol, backend incluido.
- **`STI_API_ORIGIN`:**
  - se necesita **al compilar y al correr**;
  - debe ser exactamente `http://127.0.0.1:…`; `localhost` falla;
  - hay que verificar que `rewrites.afterFiles` en `.next/routes-manifest.json` no esté vacío, sin compararlo contra un número fijo.
- **Next 16.4.2 detecta agentes.** En ese caso:
  - `next dev` sirve un solo pedido y se cierra;
  - `next build` termina con código 1 **después** de compilar.

  Para seguir: correr `node scripts/prepare-standalone.mjs` y servir el standalone. El aviso pide ejecutar `next upgrade`; eso no se hace sin decidirlo (ver D7).
- **Bloqueos de archivos.** Hay que parar el backend antes de `package` (Windows bloquea el JAR) y parar el standalone antes de `npm run build` (`EBUSY`). `ensayo.ps1` copia los JAR para no bloquear `target/`.
- **Node.** El README del frontend dice Node 24; esta máquina tiene 22.19 y todo pasa.

## Servidor

- **Lanzar el agente del servidor** desde PuTTY como `codex`, sin flags y **dentro de tmux**. Las sesiones que llegan por el daemon o el host de código quedan en sandbox y no sirven. Al principio de cada traspaso hay que pegar este chequeo:

```
Antes de nada, comprobá tu propio entorno:
  sudo -n true && echo sudo-ok
  systemctl is-system-running
  getent hosts app.stisistemas.com
Si sudo está bloqueado por "no new privileges", no hay systemd, o no resuelve
DNS, estás en una sesión sandboxeada y no sirve para este trabajo. Pará ahí y
decilo, sin buscar rodeos.
```

- **Rollback probado:**
  - todo: `sudo /srv/sti-os/private/docs/20261027T041938Z/rollback-current-production.sh`;
  - solo el frontend `bab6a1c`: `…/20261027T132246Z-frontend-bab6a1c/rollback-frontend.sh`.
- La evidencia vive en `/srv/sti-os/private/docs/<timestamp>/` (`root:root 0600`).
- Credenciales: el backend las recibe por `LoadCredential` y `SPRING_CONFIG_IMPORT=configtree:/run/credentials/sti-backend.service/`.

## Preservar

- `server/`, `output/`, `docs/transcripciones/` y `APP Servicio STI 2026.txt` están **fuera de git**: un clon nuevo no los trae, y algunos enlaces de los documentos apuntan ahí.
- Credenciales locales: `output/backend-local/credentials.json` y `output/vps-admin-credentials.txt`. Nunca se pegan en chats ni en commits.
- No desplegar, no hacer push y no tocar evidencia del servidor como consecuencia automática de abrir este documento.
- `job-seeker/` en la raíz es otro proyecto, sin trackear; no pertenece a este repo.

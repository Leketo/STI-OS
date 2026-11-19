# Corte 1 — "Tareas que no se traban" · informe de entrega

ENCARGO-DEV-001 (v2), 19/11/2026. Base: `main` en `d872084`. Etiqueta de entrega: `v0.1.1-candidato.1`.

Esto es **validación propia del desarrollo**. La revisión independiente la hace QA. Nada de esto se publicó: producción no se tocó.

## Resumen

| Criterio | Resultado | Evidencia principal |
|---|---|---|
| CA-01 Interfaz: next 16.4.6, Node 24, build con agente, audit | **OK** | `ensayo.ps1 -Accion Interfaz -Agente 1`, exit 0; un build roto detiene el script |
| CA-02 Confirmaciones simultáneas | **OK** | Suite: 0 de 10 vueltas con falla (código anterior: 10 de 10) |
| CA-03 Fotos simultáneas | **OK** | Suite: 0 de 10 (código anterior: 10 de 10) |
| CA-04 Firmas simultáneas | **OK** | Suite: 0 de 10 (código anterior: 10 de 10) |
| CA-05 Regla 1, iniciar sin asignados | **OK** | Suite, matriz y navegador |
| CA-06 Regla 2, quitar al único pendiente | **OK** | Suite, matriz y navegador (bitácora) |
| CA-07 Regla 3, quitar al último en curso | **OK** | Suite, matriz y navegador |
| CA-08 Sesión vencida lleva al ingreso | **OK** | Chrome con el bundle de producción compilado con Node 24.22.1 |
| CA-09 Fecha de la firma de Paraguay | **OK**, con el reloj simulado en la página | Chrome + prueba de instante fijo; ver límites |
| CA-10 Suite, matriz, lint, tipos, test:ui | **OK** | Suite 25/25 en PG 18.6; matriz 120 OK y 0 fallas |
| CA-11 Sin migración nueva | **OK** | Sin cambios en `backend/src/main/resources/db/` |

**11/11 = 100 % verificado por el desarrollo.** El reloj de CA-09 se simuló en el navegador; no se ejecutó en la franja real de 21:00 a 23:59 de Paraguay (ver "Qué no ejecuté").

## Entorno

- Base: PostgreSQL 18.6 en contenedor (`sti-suite` para la suite, `sti-ensayo` para el ensayo), con los roles `sti_migrator` y `sti_runtime` y Flyway V1–V3.
- Backend: JDK 21 con `./mvnw.cmd`, los JAR reales (web, migrador y bootstrap).
- Interfaz: imagen `sti-ensayo-frontend:local` desde `node:24.22.1-bookworm-slim`. `node -v` dentro de la imagen da `v24.22.1`. Se compila con `CLAUDECODE=1` y `AI_AGENT=claude-code` (`-Agente 1`) para reproducir lo que vio el agente del servidor.
- Navegador: Chrome de escritorio en la PC de desarrollo, sobre `http://127.0.0.1:3000`, que es la interfaz servida por el contenedor.
- Datos: falsos, creados por la API (`@example.invalid`). Las contraseñas de las cuentas falsas se generan al azar en cada corrida y no quedan en el repositorio.

Para repetir todo:

```powershell
./backend/scripts/ensayo.ps1 -Accion Suite        # CA-02 a CA-07 y CA-10 (backend)
./backend/scripts/ensayo.ps1 -Accion Interfaz     # CA-01 y CA-10 (interfaz)
./backend/scripts/ensayo.ps1 -Accion Levantar
node backend/scripts/ensayo/matriz-api.mjs output/ensayo     # CA-10 (matriz)
# CA-08 y CA-09 en el navegador sobre http://127.0.0.1:3000, como se describe abajo
./backend/scripts/ensayo.ps1 -Accion Bajar
```

## Commits del corte

| Paso | Commit | Qué |
|---|---|---|
| 0 | `32abe01` | Registro `coordinacion/` (E-001), Node 24.22.1 fijado (`.nvmrc`, `engines`) y contenedor de interfaz |
| 1 | `33f5f78` | next 16.4.6 (solo next, @next/env y @next/swc-*); `ensayo.ps1` ya no tolera un build fallido y comprueba las reescrituras por contenido |
| 2 | `da592be` | Bloqueo por tarea (N-11, N-12, N-13), 409 con mensaje, nada de archivos sin fila |
| 3 | `7a3e295` | Reglas D-26 en backend e interfaz (N-14), documentadas |
| 4 | `302f0ec` | 401 → `/login` en toda lectura y escritura (N-15) |
| 5 | `4d139d4` | Fecha de la firma de Paraguay (N-16) |
| 6 | `9f9144f` | Documentación, matriz por API y consulta de tareas trabadas en el repo |

## Detalle por criterio

### CA-01 — Interfaz con next 16.4.6 y Node 24 · OK

- **Comando:** `./backend/scripts/ensayo.ps1 -Accion Interfaz` (por defecto `-Agente 1`), sobre `4d139d4`.
- **Resultado:**
  - `Interfaz compilada con Node v24.22.1 … (agente=1)`, exit 0.
  - Las reescrituras de `/api/auth`, `/api/tasks` y `/api/projects` hacia `http://127.0.0.1:8099` están presentes en el manifiesto, comprobadas por contenido.
  - lint OK, typecheck OK, test:ui OK.
  - `npm audit`: 0 avisos en total, ninguno de `next`.
- **Línea base, 16.4.2 con las mismas variables** (registrada en E-001): `SecurityFatalError`, exit 1, y en audit GHSA-mfr8-8qww-v76h y GHSA-vc7v-qv4w-wrv8.
- **El script ya no tolera un build fallido.** Se agregó a propósito una línea que no compila en `task-model.ts` y se corrió `Interfaz`. Resultado: `npm run build` dentro del contenedor terminó con `exit code: 1` y el script se detuvo con `La compilación de la interfaz falló`. La línea se revirtió después y el árbol quedó limpio.
- **Comprobación de reescrituras:** se probó `Verificar-Reescrituras` aparte. Acepta el manifiesto real y rechaza tanto un manifiesto sin `/api/tasks/:path*` como uno vacío (Paso 1).

### CA-02, CA-03 y CA-04 — Acciones simultáneas · OK

Son tres pruebas nuevas en `FoundationTest`:
- `simultaneousLastConfirmationsFinishTheTask`
- `simultaneousUploadsStopAtFivePhotos`
- `simultaneousSignaturesKeepOneAndAnswerConflict`

Cómo están armadas:
- Cada participante tiene su propia sesión HTTP (y por lo tanto su conexión), con el token CSRF pedido antes.
- Una `CyclicBarrier` los suelta juntos, cada uno en su hilo.
- Corren **10 vueltas** y cada vuelta informa si falló.
- El estado se lee **en la base**, con la conexión del dueño del esquema, y **en el disco**: archivos de la carpeta de subidas contra filas de `task_photo` + `task_signature`.

| Criterio | Qué exige cada vuelta | Código anterior | Con el arreglo |
|---|---|---|---|
| CA-02 | respuestas [200, 200], `FINALIZADO`, 2 eventos `CONFIRMACION`, 1 cambio a `FINALIZADO` | **10 de 10 con falla**: la tarea quedó `EN_PROCESO` con 2 confirmaciones | **0 de 10** |
| CA-03 | sobre 4 fotos, 4 subidas a la vez: 1 × 201, 3 × 409, 5 filas, 5 archivos | **10 de 10 con falla**: 4 × 201, 8 filas | **0 de 10** |
| CA-04 | 2 firmas a la vez: [201, 409], el 409 dice "ya tiene una firma vigente", 1 vigente, archivos = filas | **10 de 10 con falla**: [201, 500] y archivo huérfano | **0 de 10** |

- **Código anterior:** se corrió con los arreglos apartados (`git stash` de `backend/src/main`). Log: `output/ensayo/logs/suite-codigo-anterior.log`, fuera de Git.
- **Con el arreglo:** `./backend/scripts/ensayo.ps1 -Accion Suite` da `Tests run: 25, Failures: 0, Errors: 0`, sobre `PostgreSQL 18.6 (Debian 18.6-1.pgdg13+2)`.
- **La matriz por API repite los tres escenarios** con 10 vueltas, sesiones independientes y estado leído con `psql`:
  - confirmaciones: 10/10 finalizadas, 0 trabadas, 0 dobles finalizaciones;
  - fotos: 0/10 con más de 5; códigos 10 × 201 y 30 × 409;
  - firmas: 10 × 201, 10 × 409, 0 tareas con más de una firma vigente.

Cómo se arregló:
- Cada endpoint que cambia una tarea toma primero `SELECT … FOR UPDATE` sobre su fila y la retiene hasta el commit.
- El archivo se escribe después del INSERT y se borra si la transacción vuelve atrás.
- Un `DuplicateKeyException` que se escape responde 409, nunca 500.

### CA-05, CA-06 y CA-07 — Reglas de D-26 · OK

| Criterio | Suite (estado leído en la base) | Matriz por API | Navegador |
|---|---|---|---|
| CA-05, regla 1 | `taskWithoutAssigneesCannotStart`: 409 `SIN_ASIGNADOS` con el mensaje, sigue `POR_HACER`, 0 eventos `ESTADO` | 409 `SIN_ASIGNADOS`; `POR_HACER` según `psql` | Una tarea sin asignados no muestra "Iniciar" y dice "Asigná al menos una persona para poder iniciar la tarea." (`d26-regla1-sin-boton-iniciar.jpg`) |
| CA-06, regla 2 | `removingTheOnlyPendingAssigneeFinishesTheTask`: `FINALIZADO`; el evento guarda actor = supervisor, sujeto = la persona quitada y el motivo; 1 `DESASIGNADA`. Quitar a quien ya confirmó, con otro pendiente, no cambia nada | 200 `FINALIZADO`; la bitácora en la base dice `supervisora@…` y `tecnico2@…` | La bitácora muestra "Finalizó la tarea al quitar a la única persona pendiente · Sofía Supervisora" |
| CA-07, regla 3 | `lastAssigneeOfATaskInProgressCannotBeRemoved`: 409 `ULTIMO_ASIGNADO` con el mensaje; sigue `EN_PROCESO`, 1 asignado, 0 `DESASIGNADA`. En `POR_HACER` sí se puede quitar | 409 `ULTIMO_ASIGNADO`; `EN_PROCESO\|1` según `psql` | Sin botón para quitar al único asignado en curso, con "Para quitar a esta persona, asigná a otra antes o volvé la tarea a Por hacer." (`d26-regla3-sin-boton-quitar.jpg`) |

- Una prueba existente, `everyStepKeepsLocationOrAnExplicitReason`, iniciaba una tarea sin asignados, y la regla 1 lo prohíbe. Ahora asigna a alguien antes de iniciar. Sus comprobaciones de ubicación no cambiaron.
- Las reglas están escritas en `docs/definiciones-funcionales.md` (duda 4, resuelta en parte) y en `backend/README.md`.
- No hizo falta migración. El evento de la regla 2 usa columnas que ya existían: `subject_id` y `location_absent_reason`.

### CA-08 — Sesión vencida · OK

Se probó en Chrome sobre el bundle de producción del contenedor (Node 24.22.1, `-Agente 1`), con la cuenta falsa `supervisora@example.invalid`.

1. **"Actualizar":** ingreso, borrado de las sesiones de esa cuenta en `sti.spring_session` (base de ensayo), clic en "Actualizar". La pantalla pasó a `/login` (`ca-08-actualizar-lleva-al-login.jpg`).
2. **Escritura:**
   - Ingreso, "Nueva tarea" con cliente, proyecto y título, sesión borrada, "Crear tarea".
   - La red registró `GET /api/auth/csrf 200` y luego `POST /api/tasks 401`, y la pantalla pasó a `/login` (`ca-08-escritura-lleva-al-login.jpg`).
   - En la base hay 0 tareas con ese título.
   - Se corrió dos veces: la primera sin el registro de red activo y la segunda con él. Las dos llegaron a `/login`.

El 401 se trata en un solo lugar, `leaveIfSessionEnded` en `api.ts`. Lo usan:
- el hook de datos (`read`/`refresh`);
- cada mutación (`mutate`);
- el detalle de la tarea.

Tiene una prueba en `test:ui`.

### CA-09 — Fecha de la firma · OK, con el reloj simulado

- **Prueba de instante fijo** (`test:ui`): `paraguayDate(2026-11-19T00:37:00Z)` da `2026-11-18`. El resultado es el mismo a las 21:00 y a las 23:59:59 (`2026-11-18`), y a medianoche de Asunción da el día siguiente. Se comprobó con la zona del proceso en `UTC`, `Pacific/Kiritimati`, `America/Los_Angeles` y `America/Asuncion`. La misma prueba deja asentado que el código anterior (`toISOString`) daba `2026-11-19`.
- **Navegador:**
  - Se ingresó y se reemplazó `Date` en la página para que "ahora" fuera `2026-11-19T00:37:00Z`. La página lo mostró como "Wed Nov 18 2026 21:37:00 GMT-0300 (hora estándar de Paraguay)", porque la PC está en esa zona.
  - En una tarea finalizada sin firma, "Firmar conformidad" propuso **18/11/2026** (`ca-09-fecha-propuesta-2137-paraguay.png`).
  - Se firmó, y en la base quedó `signed_on = 2026-11-18`, `remote = false`, vigente (`ca-09-firma-registrada.jpg`).
  - En esa misma PC y en ese mismo instante, el código anterior habría propuesto 19/11: `toISOString` toma el día UTC sin mirar la zona del equipo.
- **Backend:** si no llega una fecha, toma el día de `America/Asuncion`, no la zona del servidor.

### CA-10 — Suite completa y matriz · OK

- **Suite:** 25 pruebas, 0 fallas, 0 errores, contra PostgreSQL 18.6 (`4d139d4`; los commits que siguen no tocan código). Son las 19 del 18/11 más 6 nuevas: CA-02 a CA-07.
- **Interfaz:** lint y typecheck limpios. `test:ui` da 15/15: las 10 que había, 3 de D-26, 1 de N-15 y 1 de N-16.
- **Matriz por API:** `backend/scripts/ensayo/matriz-api.mjs`, resultado completo en `docs/evidencia-corte-1/matriz-api-2026-11-19.md`. Da **120 OK, 0 fallas, 6 observaciones**. El 18/11 había dado 110 OK, 4 fallas y 9 observaciones.
  - **Las 110 que pasaban siguen pasando** con la misma expectativa.
  - **Las 4 que fallaban:**
    - las tres de concurrencia pasan como estaban escritas, ahora con 10 vueltas en vez de 8;
    - la cuarta ("El que queda reconfirma → FINALIZADO") **cambió de expectativa por D-26**: con la regla 2 la tarea se finaliza al quitar al pendiente. Esa fila ahora exige `200 FINALIZADO` al desasignar, y 400 si el que queda intenta confirmar sobre una tarea que ya no está en curso.
  - Tres observaciones de la sección 6 pasaron a ser reglas con resultado esperado (D-26), y se agregaron tres comprobaciones en la base.
  - Cada cambio está escrito en la cabecera del script. Ninguno se hizo para que algo pase.

### CA-11 — Sin migración · OK

- `git diff d872084..HEAD -- backend/src/main/resources/db/` está vacío. Siguen V1, V2 y V3.
- No hay variables ni credenciales nuevas.
- No cambió la versión del pom ni la de `package.json`. En `package.json` solo cambiaron `engines` y `next`.

## Qué no ejecuté y por qué

- **CA-09 en la franja real de 21:00 a 23:59 de Paraguay.** Las pruebas se hicieron a la mañana, con el reloj de la página simulado y con la prueba de instante fijo. No se esperó a la noche.
- **Revisión independiente.** Es de QA.
- **`npm run dev` con next 16.4.6 desde un agente.** El encargo pide el build; el servidor de desarrollo no se volvió a probar.
- **La matriz por API corrió con el Node de la PC (22.19.0).** Es solo el cliente de prueba. El producto bajo prueba son los JAR con JDK 21, PostgreSQL 18.6 y la interfaz compilada con Node 24.22.1 en contenedor. El script usa `docker exec … psql`, que no se puede llamar desde dentro del contenedor de Node.
- **La suite corre el backend en la JVM de la PC** (JDK 21) contra PostgreSQL 18.6 en contenedor, igual que el 18/11. No corre en el VPS.
- **Navegador:** solo Chrome de escritorio. No se probaron otros navegadores, el ancho de móvil ni el tacto real en este corte. El permiso de ubicación estaba denegado, así que los pasos del navegador guardaron el motivo y no coordenadas.
- **Producción:** no se miró ni se tocó. La consulta de tareas trabadas se probó solo en la base de ensayo.

## Observación sin defecto asignado

Con el permiso de ubicación denegado, "Crear tarea" queda varios segundos en "Creando…" antes de mandar el pedido. No se midió cuánto. Es el comportamiento previo de `deviceLocation`, no lo cambió este corte y queda fuera de su alcance.

## Defectos propios

- **DEV-01** (media, Node 22.19.0 en la evidencia del 18/11): la evidencia de CA-01, CA-08 y CA-09 ya sale de Node 24.22.1 en contenedor. **Queda para que el PO lo dé por cerrado.**
- **DEV-02** (media, `taskkill` por nombre que pudo cerrar otros procesos Node): sigue **abierto**; lo cierra el dueño. Desde entonces los procesos se terminan solo por PID.
- No aparecieron defectos propios nuevos.

## Preguntas del encargo

**1. Consulta para detectar las tareas ya trabadas en producción.** Está en [backend/scripts/consultas/tareas-trabadas.sql](../backend/scripts/consultas/tareas-trabadas.sql):

- Abre la transacción `READ ONLY` y termina en `ROLLBACK`.
- Devuelve número, id, motivo y conteos; ningún dato personal.
- Los motivos son dos:
  - `SIN_ASIGNADOS`: `EN_PROCESO` sin nadie asignado;
  - `TODOS_CONFIRMARON`: `EN_PROCESO` con asignados y ninguno pendiente.
- No repara nada.
- Se probó en la base de ensayo:
  - con el código del corte devuelve 0 filas;
  - forzados a mano los dos estados, devuelve las dos tareas con su motivo;
  - un `UPDATE` dentro de `READ ONLY` falla con "cannot execute UPDATE in a read-only transaction".

**2. ¿Hubo que cambiar la estructura de la base?** No. Flyway sigue en 3 y V1–V3 no se tocaron.

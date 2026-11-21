# Corte 3B — "Fechas y edición" · informe de entrega

ENCARGO-DEV-005 v2, 21/11/2026.

- **Base:** `079deb6`.
- **Rama:** `feat/fechas-y-edicion`.
- **Etiqueta de entrega:** `v0.3.1-candidato.1`.
- **Eventos:**
  - E-022 (recepción), E-023 (D-261 a D-266 y N-54);
  - E-024 (las 12 imágenes borradas), E-025 (arranque sin Docker, D-267 y D-268, N-55);
  - E-026 (disco liberado, tope de las 06:45, D-269 y D-270);
  - E-027 (D-271: la suite y la interfaz finales, otra vez, con tope de 2 horas);
  - E-028 (entrega).
- **Decisiones aplicadas:** D-250 a D-271.

Esto es **validación propia del desarrollo**. La revisión independiente la hace QA. Producción no se miró ni se tocó.

## Resumen

| Criterio | Resultado | Evidencia principal |
|---|---|---|
| CA-65 Alta con responsables y fecha; fecha obligatoria con responsables; el cliente no ve el bloque; la del técnico queda para hoy | **OK** | `ScheduleAndNamesTest`, matriz §13, capturas 03, 21 y 24 |
| CA-66 Asignar pide el día; poner o cambiar la fecha en Por hacer y En proceso; historial y "Programada para"; técnico y cliente no la cambian | **OK** | Matriz §13, `ScheduleAndNamesTest`, capturas 04, 05, 07, 08 y 22 |
| CA-67 Bloque "Fechas": cada acción con su fecha, igual al historial y a la constancia, para los cuatro roles | **OK**, con un límite declarado | Capturas 06, 08, 20, 23 y 25; constancia de la misma tarea |
| CA-68 Tarjetas y Lista con Cargada, Asignación y Terminada; "Atrasada" según D-246 | **OK** | Capturas 01, 02, 09; `test:ui` (`isOverdue`, `taskDates`) |
| CA-69 Solo ADMIN edita; nombre único; el proyecto no cambia de cliente; el nombre nuevo se ve | **OK**, después de DEV-10 | Matriz §13 (también a través del frontend), `ScheduleAndNamesTest`, capturas 11 y 12, `ca69-nombre-nuevo-v031.md` |
| CA-70 Sin desborde a 360; ventana de No facturable del boceto 6.2; sin "Ver demo pública"; direcciones del prototipo | **OK** | 43 capturas con desborde 0; captura 10; `paquete-final-4a74adb.txt` |
| CA-71 Pantallas nuevas y cambiadas en navegador real: escritorio, 390 y 360, día y noche | **OK** | 55 capturas en `docs/evidencia-corte-3b/capturas/` |
| CA-72 Permisos por API, cuatro roles y sin sesión | **OK** | Matriz §13 (46 filas), `ScheduleAndNamesTest` |
| CA-73 Reglas en el backend y carreras | **OK** | `ScheduleAndNamesTest`: 0 de 10 vueltas con falla en las tres carreras |
| CA-74 V7 limpia y desde el esquema 6 con datos; v0.3.0 sobre el esquema 7 pasa la matriz del 3A; qué ve | **OK** | `UpgradeFromSchema4Test`; matriz del 3A **310 OK, 0 FALLA**; sonda 11 OK |
| CA-75 Suite, matrices anteriores, lint, tipos, `test:ui`, build Node 24.22.1, audit; paquete sin prototipo ni "Sallustro" | **OK** | Ver detalle; D-269 aplicado |

**11/11 = 100 % verificado por el desarrollo.** Los límites están en "Qué no ejecuté y por qué".

**Defectos propios del corte:**

- **DEV-08:** la imagen de ensayo que quedaba de cada compilación. Cerrado y verificado (`dev08.md`).
- **DEV-09:** una prueba nueva dependía del orden de la intercalación de la base. Cerrado en `c4f8814`.
- **DEV-10:** desde la interfaz, el panel "Editar cliente" no llegaba al backend. Apareció con las capturas y se cerró en `4a74adb`.

## Entorno

- **Base:** PostgreSQL 18.6 en contenedor.
  - La suite corre en `sti-suite`.
  - El ensayo corre en `sti-ensayo` (127.0.0.1:5434), con `sti_migrator`, `sti_runtime` y Flyway V1 a V7.
- **Backend:** JDK 21, `./mvnw.cmd`, los tres JAR reales.
- **Interfaz:** imagen `sti-ensayo-frontend:local` desde `node:24.22.1-bookworm-slim`, con `LABEL sti.ensayo=frontend` (DEV-08).
- **Navegador para las capturas:** el Chrome instalado, sin ventana, manejado por el protocolo DevTools (`capturas-3b.mjs`).
  - Los anchos de 1440, 390 y 360 son exactos, sin el iframe del 3A.
  - **No es un teléfono real.**
- **Datos:** falsos, en `@example.invalid`.
  - Las contraseñas se sortean en cada corrida y viven solo en `output/ensayo/secretos.json`, fuera del repositorio.
  - El script de capturas recibe la del ADMIN por una variable de entorno de esa sola corrida. No la escribe en ningún archivo.
  - Ninguna captura muestra una contraseña, porque la sesión se abre con una llamada a la API.
- **Disco:** 81,99 GB libres en C: antes de arrancar Docker (E-026).
- **Carga y servidor:** comparten la PC. Los milisegundos son de esta máquina, no del VPS.

Para repetir:

```powershell
./backend/scripts/ensayo.ps1 -Accion Suite
./backend/scripts/ensayo.ps1 -Accion Interfaz
./backend/scripts/ensayo.ps1 -Accion Levantar -Compilar
node backend/scripts/ensayo/matriz-api.mjs output/ensayo
# capturas: ids.json con las tareas y los nombres (ver el LEEME de las capturas), y la contraseña del ADMIN en STI_CAPTURA_PASS
node backend/scripts/ensayo/capturas-3b.mjs <carpeta> <ids.json>
# vuelta atrás: Levantar -JarWeb <JAR web de v0.3.0-candidato.1>, la matriz de esa etiqueta sin cambios, y:
node backend/scripts/ensayo/ca74-sonda.mjs output/ensayo
./backend/scripts/ensayo.ps1 -Accion Bajar
```

## Commits del corte

| Commit | Qué |
|---|---|
| `83f10e9` | E-022, recepción, bloqueada por el disco; DEV-08 |
| `8ce33e7` | E-023, D-261 a D-266 y N-54; la lista de las 12 imágenes |
| `e747bb9` | E-024, las 12 imágenes borradas; el disco virtual no se achica |
| `4e11db9` | E-025, arranque sin Docker (D-267 y D-268), N-55 |
| `e524203` | DEV-08: la marca `sti.ensayo=frontend` y el borrado de las imágenes viejas con esa marca |
| `ed81aad` | Parte D: fuera el prototipo público y sus enlaces (D-250, D-256, N-53, D-270) |
| `1683bc6` | El servidor de prueba de la interfaz usa un nombre de cliente falso (N-53) |
| `9571645` | Parte E: textos del boceto 6.2 (N-49) y barra a 360 (N-31) |
| `8434f65` | Partes A y B, backend: V7, la fecha al crear, al asignar y al cambiarla, y las fechas de cada tarea |
| `1843e17` | Partes A y B, interfaz |
| `d25eeca` | Parte C, backend: renombrar con nombres únicos, el registro de ediciones y los conteos |
| `808d250` | Parte C, interfaz |
| `ee41616` | `ScheduleAndNamesTest`, V7 desde el esquema 6, y las pruebas anteriores mandan el día (D-262) |
| `8da445d` | La matriz manda el día, espera 409 en el nombre repetido y suma la sección 13 (D-262) |
| `b682ae9` | Sonda CA-74 |
| `81bf3ce` | README y STACK del frontend sin el prototipo |
| `17b0ebd` | E-026 |
| `c4f8814` | `AccountsTest` espera el esquema 7; DEV-09 |
| `e686446` | D-269, `npm audit fix` |
| `19279e1` | Evidencia: DEV-08 y la búsqueda en el paquete |
| `3ba48d6` | Evidencia de la vuelta atrás (CA-74) |
| `4a74adb` | DEV-10: la reescritura `/api/clients/:path*`, y el ensayo la exige en el manifiesto |
| `8afec6e` | Capturas de CA-71 y su script |
| `ca9d5f2` | Capturas como SUPERVISOR, USUARIO y CLIENTE; el nombre nuevo en la constancia de v0.3.1; la búsqueda repetida en el paquete final |
| `9f273a9` | E-027, D-271 |
| (este) | Informe, con la suite y la interfaz finales |

## Detalle por criterio

### CA-65 — Alta con responsables y fecha · OK

- **Backend:**
  - el cliente y el técnico que mandan responsables o fecha reciben `403 ASIGNACION_NO_PERMITIDA`, y la tarea no se crea;
  - responsables sin fecha dan `400 FECHA_OBLIGATORIA`;
  - fuera de ±5 años (D-264) da `400 FECHA_FUERA_DE_RANGO`;
  - la tarea que crea un técnico queda con el día de hoy **en Paraguay**, no el del servidor.
- **Pruebas:** `ScheduleAndNamesTest` (las tres primeras) y matriz §13, leyendo `sti.task.scheduled_on` y `sti.task_assignment`.
- **Interfaz (captura 03):** el bloque "Asignación — Solo supervisor y administrador", con chips, "+ Agregar técnico" y la fecha con su día escrito.
- **El cliente y el técnico no ven el bloque** (21 y 24): en la página no existe `.sti-assign-block`. El cliente ve "Un supervisor asignará la tarea al equipo." No lo cubre ninguna prueba automática de la interfaz: el componente lo decide por el rol.

### CA-66 — Asignar y cambiar la fecha · OK

- **Asignar en una tarea sin fecha** pide el día: la API da `400 FECHA_OBLIGATORIA`, y la interfaz abre la ventana "Asignar a X" con la fecha (captura 04).
- **Asignar con otro día a una tarea con fecha:** `409 FECHA_DISTINTA`. La fecha es de la tarea, no de cada persona.
- **Cambiar la fecha** (`POST /api/tasks/{id}/schedule`):
  - ADMIN y SUPERVISOR en Por hacer y En proceso dan 200;
  - el técnico asignado y el cliente reciben 403, el cliente de otra empresa 404 y sin sesión 401;
  - en Finalizada da `409 FECHA_NO_EDITABLE`;
  - el mismo día no escribe nada.
- **El evento:** `FECHA` con la fecha anterior y la nueva, quién y cuándo, y el motivo "No aplica: cambio de fecha" (D-263). La matriz lo lee en `sti.task_event`.
- **En pantalla:**
  - el recuadro "Fecha de asignación" con "Reprogramada N veces" (05 y 09);
  - la ventana "Cambiar fecha de asignación" (07);
  - el historial "Cambió la fecha de asignación · A → B" (06 y 08);
  - en "Fechas", la fila "Programada para", con "Antes: … · cambiada por … el …";
  - el técnico asignado ve el recuadro sin botón para cambiar la fecha (22). `test:ui` cubre `canSchedule` (D-259).

### CA-67 — Bloque "Fechas" · OK, con un límite declarado

- **Qué se vio (06):**
  - Cargada, Asignada, Programada para, Iniciada, Terminada, Firmada y Facturada o cerrada;
  - cada una con quién, en hora de Paraguay;
  - "—" y "Todavía no" en lo que no pasó.
- **De dónde sale:** de los eventos de la tarea, con la misma regla de Terminada que la constancia (D-224). `ScheduleAndNamesTest.terminadaFollowsTheServiceRecordAndIsEmptyWhileReopened` lo compara contra la base.
- **Los cuatro roles** (06 como ADMIN; 20, 23 y 25 como SUPERVISOR, USUARIO y CLIENTE): el script leyó el texto del bloque en la misma tarea (TAR-0072) y es igual en los cuatro.
  - Para entrar con esos roles, el ADMIN blanqueó sus contraseñas y el script hizo el primer ingreso con una clave al azar que solo existió en memoria (ver el `LEEME.md` de las capturas).
- **Contra la constancia de la misma tarea:** Solicitud, Atención y Finalizada (21/11/2026 01:45) coinciden con Cargada, Iniciada y Terminada. Con el historial coinciden también.
- **El límite:** la matriz hizo todos los pasos de esa tarea en el mismo minuto, así que esta comparación no distingue un evento de otro. Lo que sí los distingue es `ScheduleAndNamesTest`, contra la base, y que las dos reglas son la misma (primer paso a EN_PROCESO; último paso a FINALIZADO que no venga de un cierre).

### CA-68 — Tarjetas, Lista y "Atrasada" · OK

- **Tarjetas (01):** la franja Cargada / Asignación / Terminada, con "—" cuando falta.
- **Lista (02):** las tres columnas.
- **"Atrasada" (01, 09 y 13):** aparece en TAR-0039, con fecha del 19/11 en Por hacer. La regla de D-246 (fecha anterior a hoy en Paraguay y tarea abierta) está en `isOverdue` y la cubre `test:ui`.

### CA-69 — Editar cliente y proyecto · OK, después de DEV-10

- **Backend:**
  - solo ADMIN: SUPERVISOR, USUARIO y CLIENTE reciben 403, y sin sesión 401, en renombrar y en los conteos;
  - el nombre se compara sin mayúsculas ni espacios en los extremos. Un choque da `409 NOMBRE_REPETIDO`, al crear y al editar;
  - guardar el mismo nombre se acepta y no se registra (D-265);
  - el mismo nombre de proyecto en otro cliente se acepta;
  - el pedido solo lleva el nombre, así que el proyecto no cambia de cliente (la matriz lo lee en `sti.project.client_id`);
  - cada cambio deja una fila en `sti.catalog_name_edit`, con el nombre anterior, el nuevo, quién y cuándo.
- **Carreras:** dos ADMIN con el mismo nombre nuevo a la vez dejan uno solo (`pg_advisory_xact_lock` por ámbito).
- **Interfaz (11 y 12):** "Editar" en cada tarjeta abre el panel de los bocetos 7.4 y 7.5, con los conteos y "Ver proyectos".
- **El nombre nuevo se ve:**
  - en la lista de clientes y proyectos (11 y 12);
  - **en la constancia, medido en v0.3.1** (`ca69-nombre-nuevo-v031.md`): se renombró un cliente con tareas, y el PDF de una de ellas trae el nombre nuevo y no el viejo;
  - **en el tablero y las tareas:** la tarea lleva el `clientId`, y la interfaz pone el nombre desde `GET /api/clients`, que devuelve el nuevo. No queda copia guardada que regenerar;
  - con v0.3.0 sobre el esquema 7, la sonda lo vio en la lista de clientes.
- **DEV-10** (ver "Defectos propios"): las primeras capturas del panel mostraron "No se pudieron contar sus datos". Después del arreglo, la matriz corrida **a través del frontend** pasó las 46 filas de la sección 13.

### CA-70 — N-31, N-49 y N-53 · OK

- **Sin desborde a 360:** el script midió `scrollWidth - innerWidth` en cada una de las 55 capturas, y dio 0 en todas, también a 390 y en escritorio. La 13 muestra la barra con "Filtros activos" a 360.
- **No facturable (10):** "¿Por qué no se factura?", los dos motivos con su explicación y "Confirmar: no facturable", inactivo hasta elegir.
- **Sin "Ver demo pública":** ni en el ingreso ni en la barra lateral (D-270). El HTML de `/login` no tiene la palabra "demo".
- **Direcciones del prototipo:** `/demo`, `/inbox`, `/my-work`, `/projects/proj-1` y `/views` dan 404; `/login` da 200 y `/app` lleva al ingreso (307). Las 13 direcciones del encargo están en `rutas-http.txt`.

### CA-71 — Pantallas · OK

- **Las capturas:** 55 en `docs/evidencia-corte-3b/capturas/`, con un `LEEME.md` que dice qué muestra cada una, el ancho, el tema y el desborde medido.
  - Como ADMIN: 43. Escritorio 1440: 17; 390: 14; 360: 12. Día: 29; noche: 14.
  - Como SUPERVISOR, USUARIO y CLIENTE: 12, de día, en escritorio y 390.
- **Navegador real:** Chrome 157.0.8103.79 de escritorio, sin ventana, con el ancho y la densidad de un teléfono emulados. No es un teléfono.

### CA-72 — Permisos por API · OK

Matriz §13, 46 filas, con los cuatro roles y sin sesión:

- el cliente no manda responsables ni fecha (403), y el técnico tampoco manda fecha (403);
- el técnico asignado no cambia la fecha (403);
- solo ADMIN renombra y ve los conteos.

`ScheduleAndNamesTest` repite lo mismo leyendo la base.

### CA-73 — Reglas y carreras · OK

`ScheduleAndNamesTest`, 12 pruebas, todas leen la base. Las carreras usan conexiones independientes, una barrera y 10 vueltas:

| Carrera | Vueltas con falla | Respuestas |
|---|---|---|
| Dos cambios de fecha a la vez | 0 de 10 | los dos 200; historial encadenado (la anterior del segundo es la nueva del primero) y queda el último día |
| Dos asignaciones a una tarea sin fecha, con días distintos | 0 de 10 | `{200=10, 409 FECHA_DISTINTA=10}`: queda un solo día |
| Dos ADMIN con el mismo nombre nuevo | 0 de 10 | `{200=5, 201=5, 409=20}`: queda un solo nombre |

### CA-74 — V7 y vuelta atrás · OK

- **Instalación limpia:** la suite entera arranca de una base vacía hasta V7.
- **Actualización desde el esquema 6 con datos:** `UpgradeFromSchema4Test.schema7OverSchema6WithData`.
  - Toda fila del esquema 6 queda igual.
  - Ninguna tarea toma una fecha sola.
  - El registro de ediciones arranca vacío.
  - El rol de ejecución puede escribir el evento `FECHA`.
- **v0.3.0 sobre el esquema 7:** JAR web compilado desde un clon en `c566b29` (`v0.3.0-candidato.1`), como pide N-50; la interfaz de v0.3.0, también desde el clon.
  - Datos cargados antes: tareas con fecha, dos cambios de fecha y dos nombres editados.
  - **La matriz del 3A sin cambios: 310 OK, 0 FALLA, 6 observaciones** (`matriz-3a-contra-v030-esquema7.md`). Es lo mismo que la matriz final del 3A.
  - **La sonda (`ca74-sonda.md`): 11 OK, 0 FALLA, 6 observaciones.**
- **Qué ve v0.3.0:**
  - el tablero, el panel y la constancia responden 200;
  - la constancia no cambia sus fechas por un evento `FECHA`;
  - el cliente renombrado aparece con el nombre nuevo;
  - **en el historial, cada cambio de fecha sale "Actualizó la tarea", con "Ubicación no disponible"** (`ca74-v030-historial-con-fecha.jpg`). No dice qué cambió;
  - las tareas que crea o asigna v0.3.0 quedan **sin fecha**, igual que las de antes del 3B. Al volver a v0.3.1 se ven "Sin fecha", y asignar otra persona pide el día;
  - un cambio de estado no toca la fecha.
- **Las corridas de la sonda, todas:**
  1. 409 al iniciar una tarea sin responsables: defecto de la sonda, que elegía mal la tarea;
  2. falló con un uuid vacío: la sonda no encontró la tarea con su nueva selección;
  3. desde un ambiente nuevo: 11 OK, 0 FALLA. Es la que vale.

### CA-75 — Nada se rompe · OK

- **Suite completa sobre el código final:** **101/101**, sobre `9f273a9` (Git-Dirty false), en PostgreSQL 18.6 (`sti-suite`). Tardó 13 min 34 s, dentro de los 15 de D-168.

  | Clase | Pruebas | Resultado |
  |---|---|---|
  | AccountsTest | 16 | OK |
  | ClosingTest | 5 | OK |
  | ConstanciaRenderTest | 3 | OK |
  | ConstanciaTest | 2 | OK |
  | CredentialsTest | 5 | OK |
  | ErrorsAndNoMailTest | 4 | OK |
  | FoundationTest | 25 | OK |
  | MailTransportTest | 6 | OK |
  | RecoveryTest | 22 | OK |
  | ScheduleAndNamesTest | 12 | OK (nueva) |
  | UpgradeFromSchema4Test | 1 | OK |

  - **Carreras:** todas dieron 0 de 10 vueltas con falla:
    - de cortes anteriores: CA-02, CA-03, CA-04, CA-17 y CA-51 (cierres y vueltas);
    - de este corte (CA-73): cambios de fecha; asignaciones con días distintos `{200=10, 409 FECHA_DISTINTA=10}`; nombres `{200=7, 201=3, 409 NOMBRE_REPETIDO=20}`.
  - **Esta es la tercera corrida completa del corte:**
    1. la primera dio 2 fallas: `AccountsTest`, que esperaba el esquema 6, y DEV-09. Arregladas en `c4f8814`, esas dos clases pasaron solas (28/28);
    2. la segunda, sobre el código final, se cortó por falta de memoria en la PC a mitad de `ScheduleAndNamesTest`, sin fallas hasta ahí (E-027);
    3. esta es la que vale.
  - **El backend no cambió desde `c4f8814`.** Lo que cambió después es la interfaz, scripts de ensayo y documentos.
- **Matrices:**
  - la de API actualizada (D-262) sobre v0.3.1: **357 OK, 0 FALLA, 5 observaciones** (`matriz-api-v031.md`). Corrió igual en cada ambiente nuevo del corte;
  - la del 3A sin cambios, contra v0.3.0 sobre el esquema 7: 310 OK (CA-74).
- **Interfaz en Node 24.22.1 sobre el código final** (`-Accion Interfaz`, 11:03, sobre `9f273a9`):
  - build OK. Docker reutilizó la imagen `0f24261f0cb1` de las 01:41, porque el frontend no cambió desde DEV-10 (`git diff 4a74adb 9f273a9 -- frontend` sale vacío);
  - en el manifiesto están las reescrituras de `/api/auth`, `/api/tasks`, `/api/projects`, `/api/accounts` y `/api/clients`;
  - lint OK, typecheck OK y `test:ui` OK;
  - `npm audit`: 0 avisos en total, y `next` sin avisos.
- **D-269, `npm audit fix` sin `--force`:**
  - antes: 7 avisos moderados (GHSA-g3hv-75wg-m249, `minimatch` dentro de `eslint-config-next` y `typescript-eslint`);
  - cambió solo `package-lock.json`. `package.json` quedó igual;
  - solo dependencias de desarrollo:

    | Paquete | Antes | Después |
    |---|---|---|
    | `typescript-eslint` y `@typescript-eslint/*` | 8.72.0 | 8.73.0 |
    | `minimatch` (el que traía el aviso) | 10.2.6 | 11.0.9 |
    | `brace-expansion` | 5.0.12 | 5.0.13 |
    | `ignore` | 7.0.14 | 7.0.16 |
    | `@isaacs/nonrecursive-glob-match` | — | 1.1.0 (nuevo) |

  - después: **0 avisos**, y pasaron build, lint, tipos y `test:ui` con Node 24.22.1 (`d269-npm-audit-fix.txt`).
  - N-56 no hizo falta.
- **El paquete compilado** (`paquete-final-4a74adb.txt`, sobre la imagen del código final): 0 archivos con "Sallustro" en todo `/app`, ninguna dirección del prototipo en `.next/server/app`.

### Los cambios a pruebas y matrices anteriores (D-262)

Los fuerzan dos reglas nuevas: la 5 (no se asigna una tarea sin fecha sin dar el día) y la 16 (nombres únicos).

| Dónde | Qué cambió | Por qué |
|---|---|---|
| `AccountsTest` (3), `ClosingTest` (1), `ConstanciaTest` (1), `FoundationTest` (11) | Las 16 llamadas que asignan mandan `scheduledOn` = hoy en Paraguay. Mismas personas, mismas tareas, mismas respuestas esperadas | Regla 5 |
| `AccountsTest` | La versión esperada del esquema es 7 | V7 |
| `UpgradeFromSchema4Test` | El paso del esquema 6 se detiene en 6, y sigue el paso nuevo a 7 | Para medir V7 sobre el 6 con datos |
| `matriz-api.mjs` | Los 20 lugares que asignan mandan `scheduledOn: HOY` | Regla 5 |
| `matriz-api.mjs` | "Cliente con nombre repetido" era una observación (201) y pasa a regla: espera `409 NOMBRE_REPETIDO`, con otro caso y espacios | Regla 16, D-258 |
| `matriz-api.mjs` | Sección 13 nueva, 46 filas | CA-72 y CA-73 |

Ninguna prueba se bajó ni cambió lo que espera, salvo la observación del nombre repetido, que pasa a regla por la decisión D-258.

## Lo que el servidor tiene que saber

**Hay migración nueva: V7** (`V7__schedule_and_name_edits.sql`). Solo agrega:

- `sti.task.scheduled_on date`, nula;
- `sti.task_event.scheduled_from` y `scheduled_to date`, nulas, con dos restricciones con nombre (`task_event_scheduled_kind_check` y `task_event_fecha_check`);
- `FECHA` en la lista de tipos de `task_event_kind_check`, sin quitar ninguno;
- la tabla `sti.catalog_name_edit` y sus índices.

No borra ni modifica datos: las filas que existen cumplen las restricciones nuevas sin tocarlas. Se corre con el migrador de esta etiqueta, como en el pase anterior.

**No hay variables ni credenciales nuevas.** La unidad `sti-backend.service` no cambia.

**Reescrituras de `/api`: ahora son 10.** DEV-10 sumó `/api/clients/:path*`. Al comprobar el manifiesto de rutas, tienen que estar estas 10:

- `/api/auth/:path*`;
- `/api/accounts/:path*` y `/api/accounts`;
- `/api/clients/:path*` (**nueva**) y `/api/clients`;
- `/api/projects/:path*` y `/api/projects`;
- `/api/operators`;
- `/api/tasks/:path*` y `/api/tasks`.

Si el servidor web delante de Next limita rutas, tiene que dejar pasar `/api/clients/<id>` (renombrar) y `/api/clients/<id>/summary` (conteos del panel). Sin esa reescritura, el panel "Editar cliente" no cuenta ni guarda (DEV-10). El ensayo ahora exige las de `/api/clients` en el manifiesto.

**Direcciones que dejan de existir:** las del prototipo (`/demo`, `/inbox`, `/my-work`, `/projects/...`, `/views` y las demás de `rutas-http.txt`). Dan 404.

**D-269:** cambió solo `package-lock.json`, en dependencias de desarrollo (ver CA-75). `npm ci` instala esas versiones. El paquete publicado no cambia por esto, porque esas dependencias no entran en `.next/standalone`.

**Nombres repetidos en producción (D-265):** antes del pase, conviene saber si ya los hay. Desde que se instale v0.3.1, un nombre nuevo que choque se rechaza, pero los que ya estén repetidos se pueden guardar sin cambios. Las consultas, de solo lectura:

```sql
-- empresas con el mismo nombre, sin mayúsculas ni espacios de los extremos
SELECT lower(btrim(name)) AS nombre, count(*) FROM sti.client GROUP BY 1 HAVING count(*) > 1;
-- proyectos con el mismo nombre dentro del mismo cliente
SELECT client_id, lower(btrim(name)) AS nombre, count(*) FROM sti.project GROUP BY 1, 2 HAVING count(*) > 1;
```

**Si hay que volver a v0.3.0 después del pase** (medido en CA-74):

- funciona sobre el esquema 7, que no se deshace;
- el historial muestra cada cambio de fecha como "Actualizó la tarea";
- las tareas que se creen o asignen con v0.3.0 quedan sin fecha.

**Las tareas que ya existen** quedan sin fecha de asignación: V7 no inventa ninguna. En la interfaz se ven "Sin fecha", y asignar a otra persona pide el día.

**sha256 de los JAR:** se compilan en el servidor desde el commit de la etiqueta, así que no coinciden con los de esta PC. El commit se lee del manifiesto (`Git-Commit`, `Git-Dirty`).

## Qué no ejecuté y por qué

- **CA-67:** la comparación del bloque con la constancia se hizo en una tarea con todos los pasos en el mismo minuto. Ver CA-67.
- **Los otros roles en el navegador:** se vieron solo de día y en escritorio y 390, en las pantallas de CA-65 a CA-67. El resto de las pantallas, como ADMIN.
- **Teléfono real y Safari en iOS:** no los usé. 390 y 360 son emulados en Chrome.
- **El nombre nuevo en el tablero de v0.3.1:** no hay captura de un cliente renombrado que tenga tareas. Lo medido es la constancia y `GET /api/clients`, de donde el tablero toma el nombre (`ca69-nombre-nuevo-v031.md`).
- **La matriz a través del frontend:** la corrí una vez para comprobar DEV-10. Las 46 filas de la sección 13 pasaron, pero hay 8 fallas fuera de este corte, que salen de pasar por Next y no por el backend directo:
  - `/api/health` y las rutas fuera de las reescrituras dan el 404 de Next, en HTML;
  - la foto de 10,5 MB da 500 en lugar de 413.
  
  La matriz está hecha para el backend directo, que es como corre en todas las entregas. **El 500 de la foto grande a través de Next no lo investigué.** No sé si pasa igual en producción, donde hay un servidor web delante.
- **El migrador de v0.3.0 contra el esquema 7:** no lo corrí. Su Flyway conoce hasta V6.

## Observaciones sin defecto asignado

- **Imagen vieja del ensayo:** queda `e98e1064c916` (1,09 GB, sin etiqueta y sin la marca de DEV-08), probablemente del ensayo del 3A. No la borro sin autorización (D-165, D-261).
- **N-54:** `GET /api/projects` corta en 100. Sigue anotado; no se tocó.
- **Capturas de Chrome por la extensión:** las capturas de la extensión se cortaban por tiempo, así que las del corte se sacaron con el script sin ventana. Solo la de v0.3.0 (`ca74-v030-historial-con-fecha.jpg`) es de la extensión.

## Defectos propios

| ID | Severidad | Pasos | Resultado | Esperado | Cierre |
|---|---|---|---|---|---|
| DEV-08 | media | `Levantar` o `Interfaz` varias veces | cada compilación dejaba la imagen anterior sin etiqueta (~1 GB) | una sola imagen de ensayo | `e524203`; verificado en `dev08.md`: se borró 1 imagen con la marca y las 35 ajenas quedaron con los mismos ID |
| DEV-09 | baja | suite completa en PostgreSQL 18.6 | `ScheduleAndNamesTest` falló por comparar en un orden que dependía de la intercalación | la prueba no depende del orden | `c4f8814`; la clase pasa |
| DEV-10 | alta | como ADMIN, Clientes → "Editar" | el panel decía "No se pudieron contar sus datos", y guardar el nombre desde la interfaz no llegaba al backend: faltaba la reescritura `/api/clients/:path*` (el 404 era de Next) | el panel muestra los conteos y guarda | `4a74adb`; el ensayo exige la reescritura en el manifiesto; matriz §13 a través del frontend, 46 de 46; capturas 11 recapturadas |

**Por qué no lo vio antes ninguna prueba:** la matriz y la suite van directo al backend. Las reescrituras solo se comprobaban para `/api/auth`, `/api/tasks`, `/api/projects` y `/api/accounts`.

## Preguntas al PO

Ninguna.

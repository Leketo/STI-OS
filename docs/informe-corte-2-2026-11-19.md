# Corte 2 — "Usuarios y contraseñas" · informe de entrega

ENCARGO-DEV-002, 19/11/2026. Base: `main` en `c16dbe8`. Rama: `feat/usuarios-y-contrasenas`. Etiqueta de entrega: `v0.2.0-candidato.1`.

Esto es **validación propia del desarrollo**. La revisión independiente la hace QA. Nada de esto se publicó: producción no se tocó.

## Resumen

| Criterio | Resultado | Evidencia principal |
|---|---|---|
| CA-12 Lista de personas, filtros, solo ADMIN | **OK** | Suite, matriz (sección 9), navegador |
| CA-13 Alta sin contraseña escrita, la genera el sistema, una vez, nunca en claro | **OK** | Suite (busca la contraseña en toda la base y en los logs), matriz, navegador |
| CA-14 Con contraseña inicial, solo la lista permitida | **OK** | Suite, matriz, navegador (403 `CAMBIO_DE_CONTRASENA` y `/app` → `/primer-ingreso`) |
| CA-15 Cambio de la propia contraseña | **OK** | Suite, matriz, navegador (rechazo "distinta de la actual") |
| CA-16 Restablecer | **OK** | Suite, matriz, navegador |
| CA-17 Desactivar y activar | **OK** | Suite (con carrera entre dos ADMIN, 0 de 10), matriz, navegador |
| CA-18 Edición con todas las condiciones de la regla 6 | **OK** | Suite (incluye D-88), matriz, navegador |
| CA-19 Teléfono | **OK** | Suite, matriz, `test:ui`, navegador |
| CA-20 "Tareas asignadas" lleva al tablero filtrado y cuenta lo mismo | **OK** | Suite, navegador (30 en la lista, "Mostrando 30 de 45" en el tablero) |
| CA-21 Filtro por estado, combinable, por rol (D-85) | **OK** | `test:ui`, navegador con ADMIN, SUPERVISOR, técnico y cliente |
| CA-22 Bitácora de cuentas completa y sin contraseñas | **OK** | Suite |
| CA-23 Matriz por API con las operaciones nuevas, 4 roles y sin sesión | **OK** | Matriz: 194 OK, 0 FALLA, 6 obs.; sección 9 con 67 filas |
| CA-24 V4 en instalación limpia y en actualización con datos | **OK** | Suite (base migrada a 3, cargada, migrada a 4) y ensayo limpio |
| CA-25 JAR de v0.1.1 contra el esquema 4 | **OK**, con los dos límites escritos abajo | Matriz del corte 1: 120 OK, 0 FALLA |
| CA-26 Suite, matriz, lint, tipos, test:ui, build Node 24.22.1, audit | **OK** | Ver detalle |
| CA-27 Seis pantallas en navegador real, escritorio y 390, día y noche | **OK**, con el ancho de 390 emulado (ver límites) | 32 capturas en `docs/evidencia-corte-2/` |

**16/16 = 100 % verificado por el desarrollo.** Hay un defecto propio nuevo, DEV-04, que apareció en la verificación del navegador y quedó corregido antes de la entrega. Los límites de lo verificado están en "Qué no ejecuté y por qué".

## Entorno

- Base: PostgreSQL 18.6 en contenedor. La suite usa `sti-suite` y, para la actualización, una segunda base `sti_os_actualizacion`. El ensayo usa `sti-ensayo`, con los roles `sti_migrator` y `sti_runtime` y Flyway V1–V4.
- Backend: JDK 21 con `./mvnw.cmd` y los JAR reales (web, migrador y bootstrap).
- Interfaz: imagen `sti-ensayo-frontend:local` desde `node:24.22.1-bookworm-slim`, compilada con las variables de agente (`-Agente 1`).
- Navegador: Chrome de escritorio en la PC de desarrollo, sobre `http://127.0.0.1:3000`, la interfaz servida por el contenedor (bundle de producción).
- Datos: falsos, creados por la API con correos `@example.invalid`. Las contraseñas de las cuentas falsas se sortean en cada corrida y no quedan en el repositorio.

Para repetir todo:

```powershell
./backend/scripts/ensayo.ps1 -Accion Suite        # CA-12 a CA-22, CA-24 y la suite de CA-26
./backend/scripts/ensayo.ps1 -Accion Interfaz     # build, lint, tipos, test:ui y audit con Node 24.22.1
./backend/scripts/ensayo.ps1 -Accion Levantar
node backend/scripts/ensayo/matriz-api.mjs output/ensayo     # CA-23 y las 120 reglas del corte 1
# CA-27 en el navegador sobre http://127.0.0.1:3000, como se describe abajo
./backend/scripts/ensayo.ps1 -Accion Bajar
```

## Commits del corte

| Commit | Qué |
|---|---|
| `52083eb` | E-003, recepción del encargo |
| `d087a2f` | V4 y backend: cuentas, contraseña inicial, filtro de estado de cuenta, bitácora de cuentas, suite |
| `9de7152` | D-88: tarea reabierta cuyo asignado pasó a ser cliente de otra empresa |
| `7bb446f` | Matriz por API del corte 2 y JAR de v0.1.1 contra el esquema 4 (CA-23, CA-25) |
| `bfdf4d6` | E-004, DEV-03 |
| `3ed32db` | Pantallas: Usuarios, paneles, primer ingreso, "Mi contraseña", filtro de estado del tablero |
| `e9be00a` | DEV-04: el primer ingreso salía dentro del armazón de la demo; capturas de CA-27 |

## Detalle por criterio

Todas las pruebas de suite nombradas abajo están en `backend/src/test/java/com/stisistemas/os/AccountsTest.java` y leen el estado en la base, no solo la respuesta.

### CA-12 — Lista de personas · OK

- **Suite:** `theListShowsEveryPersonWithRoleCompanyPhoneStateAndInitialPasswordMark` y `onlyAnAdminManagesAccounts` (SUPERVISOR, técnico y cliente reciben 403 en cada operación de cuentas).
- **Matriz:** sección 9, la lista con los 4 roles y sin sesión.
- **`test:ui`:** filtros por rol y por estado, combinables (`filterPeople`).
- **Navegador:**
  - la lista muestra a todas las personas, clientes incluidos, con rol, empresa, teléfono, tareas asignadas, estado y la marca "Todavía no cambió la contraseña inicial";
  - "Solo inactivos" muestra 1 persona con el contador "1 persona";
  - el técnico no ve "Usuarios" en el menú.
- **Capturas:** `ca27-escritorio-dia-1-usuarios.jpg`, `ca27-escritorio-noche-1-usuarios.jpg`, `ca27-390-dia-1-usuarios.png`, `ca27-escritorio-noche-d86-solo-inactivos.jpg`.

### CA-13 — Alta con contraseña generada · OK

- **Suite:** `creationDrawsADifferentPasswordShownOnceAndNeverKeptInClear`.
  - Dos altas dan contraseñas distintas.
  - El `GET` de la cuenta no la devuelve.
  - La respuesta del alta lleva `Cache-Control: no-store`.
  - La contraseña **no aparece en ninguna fila de ninguna tabla**: se recorre cada tabla como texto y como bytes en hexadecimal.
  - Tampoco aparece en la salida capturada de los logs.
  - La bitácora (`ALTA`) no la contiene.
- **Matriz:** "Alta con contraseña escrita por el ADMIN" responde 201, y la contraseña enviada no abre la cuenta (D-23).
- **Navegador:**
  - el panel "Nuevo usuario" no tiene campo de contraseña y explica que la genera el sistema;
  - "Contraseña inicial" la muestra una vez, con "Copiar" y "Se muestra una sola vez.";
  - al tocar "Listo", el texto de la contraseña ya no está en el DOM de la página (comprobado buscándolo en `document.documentElement.outerHTML`).
- **Alcance de "se borra":** al cerrar el panel se suelta la referencia en el estado de React y el texto sale del DOM. JavaScript no permite borrar un string de la memoria; queda para el recolector de basura.

### CA-14 — Contraseña inicial vigente · OK

- **Suite:** `anInitialPasswordOnlyLetsThePersonChangeItOrLeave`.
  - Con la contraseña inicial pasan solo `GET /api/auth/csrf`, `GET /api/auth/me`, `POST /api/auth/password` y el logout.
  - Todo lo demás da 403 con `code = CAMBIO_DE_CONTRASENA`.
  - Después del cambio el acceso es normal y la contraseña inicial ya no abre.
- **Navegador**, con una cuenta falsa recién creada:
  - el ingreso lleva a `/primer-ingreso`;
  - `GET /api/tasks` da 403 `CAMBIO_DE_CONTRASENA` y `/app` redirige;
  - después de guardar, entra a `/app` con `mustChangePassword = false`, y `/primer-ingreso` redirige a `/app`.
- **Capturas:** `ca27-escritorio-dia-5-primer-ingreso.jpg`, `ca27-390-noche-5-primer-ingreso.png`.

### CA-15 — Cambio de la propia contraseña · OK

- **Suite:** `changingTheOwnPasswordAsksForTheCurrentOneAndEndsTheOtherSessions`.
  - Se rechazan la actual errónea (`CONTRASENA_ACTUAL`), la de menos de 12 caracteres (`CONTRASENA_CORTA`) y la igual a la actual (`CONTRASENA_IGUAL`).
  - La sesión propia sigue, y las otras sesiones de la persona desaparecen de `sti.spring_session`.
  - Queda un evento `CAMBIO_CONTRASENA`.
- **Navegador:**
  - "Mi contraseña" está en el menú de la persona, también en el menú ☰ a 390;
  - pide la actual, muestra "Coinciden." / "No coinciden." mientras se escribe y no deja guardar hasta que se cumple la regla;
  - en el primer ingreso, poner la inicial como nueva muestra "La contraseña nueva tiene que ser distinta de la actual." (`ca27-escritorio-dia-5b-primer-ingreso-rechazo-igual.jpg`).
- **Detalle del formulario:** tras un rechazo se vacía la contraseña actual y se conservan la nueva y su repetición, para corregirlas sin volver a escribirlas.

### CA-16 — Restablecer · OK

- **Suite:** `aResetVoidsTheOldPasswordEndsEverySessionAndAsksForTheChangeAgain`.
  - La contraseña anterior deja de servir.
  - Las sesiones de la persona se cierran.
  - El próximo ingreso exige el cambio.
  - Queda el evento `RESTABLECIMIENTO`.
  - Restablecerse a uno mismo da 409 `PROPIA_CONTRASENA`, con un mensaje que remite a «Mi contraseña» (D-83).
- **Navegador:**
  - "Restablecer" pide confirmación ("¿Generar una nueva contraseña inicial para …? La actual deja de servir y se cierran sus sesiones abiertas.");
  - al confirmar, muestra la nueva contraseña inicial una sola vez;
  - en la propia cuenta, el botón se reemplaza por "Tu propia contraseña la cambiás desde «Mi contraseña», en tu menú."
- **Capturas:** `ca27-escritorio-dia-4b-editar-restablecer.jpg`, `ca27-escritorio-noche-3-contrasena-inicial-tras-restablecer.jpg`, `ca27-escritorio-dia-4c-editarse-a-si-mismo.jpg`.

### CA-17 — Desactivar y activar · OK

- **Suite:** `deactivatingKeepsTasksAndHistoryAndTakesTheAccessAway`.
  - La persona no ingresa, y su sesión abierta recibe 401 en el próximo pedido.
  - Tareas y eventos quedan iguales en la base.
  - No se la ofrece para asignar, y asignarla da error.
  - No se puede desactivar uno mismo ni al último ADMIN activo.
  - Al reactivarla vuelve a ingresar.
- **Concurrencia:** `twoAdminsRemovingEachOtherAtOnceNeverLeaveNone`.
  - Dos ADMIN, cada uno con su sesión, se desactivan mutuamente a la vez detrás de una barrera, durante 10 vueltas.
  - **0 de 10 con falla:** siempre queda un ADMIN activo.
- **D-82:** `aSupervisorUnblocksATaskWhoseOnlyPendingTechnicianWasDeactivated` cubre las dos salidas: asignar a otra persona y quitar a la desactivada, o volver la tarea a Por hacer.
- **Navegador:**
  - al apagar "Usuario activo" de un técnico con tareas en proceso sin confirmar aparece el aviso de D-82 antes de guardar;
  - una técnica desactivada desde la pantalla queda "Inactivo", conserva sus 14 tareas y no aparece en el selector de asignación de una tarea.
- **Capturas:** `ca27-escritorio-dia-4-editar-aviso-d82.jpg`, `ca27-escritorio-noche-4-editar-aviso-d82.jpg`, `ca27-390-noche-4-editar-aviso-d82.png`.

### CA-18 — Edición · OK

- **Suite:** `editingFollowsEveryRuleOfRoleCompanyAndEmail` y `aReopenedTaskWhoseAssigneeBecameACustomerOfAnotherCompanyGoesOnWithoutThem` (D-88). Cubren:
  - el correo único, y que cambiarlo cierra las sesiones de la persona;
  - nadie cambia su propio rol (`PROPIO_ROL`);
  - nunca quedan cero ADMIN activos (`ULTIMO_ADMIN`);
  - pasar a CLIENTE exige empresa, y dejar de serlo la quita;
  - no pasa a CLIENTE quien tiene tareas Por hacer o En proceso (`TAREAS_ABIERTAS`); Finalizada no cuenta (D-88);
  - **D-88:** reabierta la tarea, el supervisor asigna a otra persona y quita al que pasó a cliente; ese cliente recibe 404 sobre la tarea de la otra empresa.
- **Navegador:** en la propia cuenta, el selector de rol y el interruptor de activo están deshabilitados, con "Tu propio rol lo cambia otro administrador." y "No podés desactivar tu propia cuenta."

### CA-19 — Teléfono · OK

- **Suite:** `phoneIsOptionalValidatedAndEditable`.
  - Opcional en el alta y en la edición, y `""` lo borra.
  - Hasta 30 caracteres de dígitos, espacios, `+`, `-` y paréntesis; fuera de eso, 400 `TELEFONO`.
  - La base tiene además el `CHECK` de V4.
- **`test:ui`:** `phoneProblem`.
- **Navegador:** un alta con `+595 (981) 123-456` aparece así en la lista.

### CA-20 — "Tareas asignadas" · OK

- **Suite:** `assignedTasksCountWhatTheBoardShowsForThatPerson`. El conteo excluye ANULADA (D-84) y coincide con lo que el tablero filtra para esa persona.
- **Navegador:**
  - la lista decía 30 para un técnico;
  - "Ver sus tareas" abrió el tablero con ese responsable elegido y "Mostrando 30 de 45 tareas";
  - para una técnica inactiva: 14 en la lista y 14 en el tablero, con "(inactiva)" junto al nombre.
- **Capturas:** `ca27-escritorio-dia-ca20-ver-sus-tareas.jpg`, `ca27-escritorio-noche-ca20-ver-sus-tareas.jpg`, `ca27-390-noche-ca20-ver-sus-tareas.png`, `ca27-escritorio-noche-d86-tablero-persona-inactiva.jpg`.

### CA-21 — Filtro por estado · OK

- **`test:ui`:** `visibleStatuses` por rol (Facturada solo para ADMIN y SUPERVISOR) y `personOptions` (inactivas solo para ADMIN, D-86).
- **Navegador**, en los cuatro roles:
  - **ADMIN:** "Todos los estados, Por hacer, En proceso, Finalizadas, Facturadas". Combinado con el responsable: 4 En proceso y 2 Facturadas de ese técnico.
  - **SUPERVISOR:** los mismos cinco que el ADMIN; con "Facturadas" mostró 2 de 45 tareas. Su filtro de responsables no ofrece inactivas.
  - **Cliente:** "Todos los estados, Por hacer, En proceso, Finalizadas", sin Facturadas; ve solo las 3 tareas de su empresa.
  - **Técnico:** "Todos los estados, Por hacer, En proceso, Finalizadas", sin Facturadas. Su filtro de responsables no ofrece a nadie más, y `GET /api/operators?includeInactive=true` le responde 403.
  - A 390, el filtro queda dentro de "Filtros" junto con los demás.
- **Capturas:** `ca27-escritorio-dia-ca21-filtro-estado.jpg`, `ca27-escritorio-noche-ca21-filtro-facturadas.jpg`, `ca27-390-noche-ca21-filtros.png`, `ca27-escritorio-dia-d85-tecnico-sin-facturadas.jpg`, `ca27-escritorio-dia-d85-supervisor-con-facturadas.jpg`, `ca27-escritorio-dia-d85-cliente-sin-facturadas.jpg`.
- SUPERVISOR y cliente se probaron en una tercera base de ensayo: el ADMIN los creó por la API, cada uno cambió su contraseña inicial por la API y después se abrió `/app` en el navegador con su sesión.

### CA-22 — Bitácora de cuentas · OK

- **Suite:** `theAccountLogNamesWhoWhatAndWhenAndHoldsNoPassword`.
  - Cada operación deja quién, a quién, qué y cuándo: `ALTA`, `EDICION` (con antes y después por campo), `ACTIVACION`, `DESACTIVACION`, `RESTABLECIMIENTO` y `CAMBIO_CONTRASENA`.
  - Ningún evento contiene la contraseña ni su hash.

### CA-23 — Matriz por API · OK

- **Archivo:** `docs/evidencia-corte-2/matriz-api-2026-11-19.md`. **194 OK, 0 FALLA, 6 observaciones.**
- La sección 9 ("Cuentas") agrega 67 filas: cada operación nueva con los 4 roles y sin sesión.
- La matriz se volvió a correr dos veces durante la verificación del navegador, sobre bases nuevas, con el mismo resultado.
- **Expectativas que cambiaron** (aceptadas por el PO al recibir `7bb446f`), cada una escrita en la cabecera del script:
  1. Las cuentas falsas toman la contraseña inicial sorteada y la cambian, como lo hace la pantalla de primer ingreso (D-23).
  2. "Cuenta con contraseña de 11 caracteres" (400) ya no tiene objeto. La reemplaza "Alta con contraseña escrita por el ADMIN": 201, y esa contraseña no abre la cuenta.
  3. "SUPERVISOR ve operadores" espera 5 personas (antes 4), porque ahora existe x1, y además que ninguna sea CLIENTE.

### CA-24 — V4 · OK

- **Instalación limpia:** cada `Levantar` migra de cero a 4.
- **Actualización con datos:** `upgradeFromSchema3KeepsAccountsAndPasswordsWithoutForcingAChange`.
  - La base `sti_os_actualizacion` se migra hasta 3, se cargan cuentas y tareas, y se migra a 4.
  - Las cuentas entran con su contraseña de siempre, con `must_change_password = false` (D-78), y los datos siguen.
- **Qué hace V4:** solo agrega dos columnas en la tabla de cuentas (`phone` con `CHECK`, y `must_change_password` con default `false`) y la tabla `sti.account_event`. V1 a V3 no se tocaron.

### CA-25 — v0.1.1 contra el esquema 4 · OK, con dos límites

- **Archivo:** `docs/evidencia-corte-2/ca25-matriz-v011-esquema4.md`.
  - JAR web compilado desde `v0.1.1-candidato.1` (sha256 `eb7e2f1d…cf33`), sobre una base migrada a 4.
  - Corrió la matriz de esa etiqueta, sin cambios.
  - **120 OK, 0 FALLA, 6 observaciones**, igual que en el corte 1.
- **Límite 1 (D-87):** en una vuelta atrás a v0.1.1 con el esquema 4, las cuentas que se creen **no exigen cambio de contraseña**. Las 6 cuentas creadas por v0.1.1 quedaron con `must_change_password = false`, y v0.1.1 sigue aceptando la contraseña escrita por el ADMIN.
- **Límite 2:** la bitácora de cuentas **no registra lo que se haga durante una vuelta atrás**. Después de la corrida, `sti.account_event` tenía 0 filas aunque v0.1.1 creó 6 cuentas. Al volver a v0.2.0 la bitácora no tiene esas altas ni sus cambios.

### CA-26 — Todo junto · OK

- **Suite:** `./backend/scripts/ensayo.ps1 -Accion Suite` sobre `e9be00a` da `Tests run: 41, Failures: 0, Errors: 0` (16 de `AccountsTest` y 25 de `FoundationTest`), contra PostgreSQL 18.6. Las 4 concurrencias (CA-02, CA-03, CA-04 y la carrera de dos ADMIN) dieron 0 de 10 vueltas con falla.
- **Interfaz:** `./backend/scripts/ensayo.ps1 -Accion Interfaz` sobre `e9be00a` da:
  - compilado con Node v24.22.1, con las variables de agente;
  - reescrituras de `/api/auth`, `/api/tasks`, `/api/projects` y `/api/accounts` presentes en el manifiesto;
  - lint OK, typecheck OK;
  - `test:ui` 20/20;
  - `npm audit`: 0 avisos.
- **Matriz:** 194 OK, con las 120 reglas del corte 1 dentro (CA-23).

### CA-27 — Pantallas en el navegador · OK

- **Cómo se probó:**
  - Chrome, con el bundle de producción del contenedor, y cuentas y datos falsos.
  - 32 capturas en `docs/evidencia-corte-2/` (más la del defecto DEV-04): escritorio día, escritorio noche, 390 día y 390 noche.
  - Las seis pantallas: Usuarios, Nuevo usuario, Contraseña inicial, Editar usuario, Primer ingreso y Mi contraseña. Además, el filtro de estado y "Ver sus tareas".
- **Ancho de 390, cómo se hizo:** la ventana de Chrome no se pudo achicar (está maximizada en la PC del dueño). La aplicación se cargó dentro de un `iframe` de 390 px en la misma pestaña; las media queries responden al ancho del iframe.
  - Las capturas de Usuarios, Nuevo usuario, Contraseña inicial y Editar usuario se tomaron con 370 px útiles, porque Windows le resta 20 a la barra de desplazamiento.
  - Las del tablero, "Mi contraseña" y el primer ingreso se tomaron con 390 px útiles (iframe de 410).
  - Ninguna pantalla nueva tiene desplazamiento horizontal a 390. Para el tablero a 370, ver "Observaciones".
- **Contraseñas visibles en las capturas:** las de "Contraseña inicial" son de cuentas falsas en una base de ensayo que ya se destruyó (`Bajar`), y nunca sirvieron fuera de ella. No hay ninguna contraseña real.

## Qué no ejecuté y por qué

- **Un teléfono real y el ancho de 390 con la ventana.** El ancho se emuló con un iframe. No se probó tacto real, el teclado del teléfono ni otros navegadores.
- **Lector de pantalla.** Los controles tienen etiqueta y el interruptor usa `role="switch"`, pero no se escuchó con un lector.
- **"Copiar" contra el portapapeles real.** El botón llama a `navigator.clipboard.writeText`. Desde la automatización no se leyó el portapapeles para confirmar que el texto llegó.
- **El doble de API `frontend/scripts/ui-fixture-server.mjs`** (revisión visual sin backend) no se actualizó: no tiene `GET`/`PUT /api/accounts` ni el cambio de contraseña. Las pantallas nuevas se probaron contra el backend real.
- **La matriz por API corre con el Node de la PC (22.19.0).** Es solo el cliente de prueba, igual que en el corte 1.
- **La suite corre el backend en la JVM de la PC** (JDK 21) contra PostgreSQL 18.6 en contenedor.
- **Producción:** no se miró ni se tocó. Tampoco se probó la actualización de V4 sobre una copia de la base real; la prueba de actualización usa datos falsos.
- **Revisión independiente:** es de QA.

## Observaciones sin defecto asignado

- **Tablero a 370 px útiles.** El botón "Filtros activos" y la búsqueda se salen 5 px del ancho y aparece desplazamiento horizontal. A 390 útiles no pasa.
  - El rótulo "Filtros activos" ya existía en el corte 1 (`v0.1.1-candidato.1`, mismo marcado).
  - Este corte hace que se vea más seguido, porque "Ver sus tareas" llega con un filtro puesto.
  - Afectaría a teléfonos de 360 px. No se corrigió porque está fuera del corte; queda para que el PO decida.
- **El panel de contraseña inicial dice lo mismo tras restablecer que tras un alta** ("… ya puede ingresar"). El encargo no tiene un texto propio para el restablecimiento.

## Defectos propios

- **DEV-04** (media, nuevo, cerrado en `e9be00a`):
  - **Qué pasaba:** `/primer-ingreso` se mostraba dentro del armazón de la demo pública: barra lateral de la demo, cinta "DEMO / DATOS FICTICIOS" y el tema de la demo. El armazón solo dejaba afuera `/login` y `/app`.
  - **Pasos:** crear una cuenta, ingresar con la contraseña inicial y ver `/primer-ingreso`.
  - **Esperado:** la pantalla completa propia del encargo.
  - **Arreglo:** la ruta se agregó a la excepción del armazón (`src/components/sites/kanban/AppShell.tsx`).
  - **Evidencia:** el defecto en `dev-04-primer-ingreso-dentro-de-la-demo.jpg` y el cierre en `ca27-escritorio-dia-5-primer-ingreso.jpg` y `ca27-390-noche-5-primer-ingreso.png`. Después del arreglo se volvió a correr `Interfaz` completo.
  - Registrado en E-005.
- **DEV-02:** sigue abierto; lo cierra el dueño.
- **DEV-03:** registrado en E-004; lo cierra el PO o el dueño.

## Lo que el servidor tiene que saber

- **Hay migración nueva: V4.** Es la primera desde que hay datos reales. Solo agrega; no modifica ni borra.
- **Sin variables ni credenciales nuevas.**
- **Reescritura nueva:** `/api/accounts/:path*` (además de `/api/accounts`). `ensayo.ps1` la exige en el manifiesto. Si el servidor verifica las reescrituras por contenido, tiene que esperarla.
- **Cuentas existentes:** siguen entrando con su contraseña y no se les pide cambiarla (D-78). Lo mismo vale para el ADMIN que cree el bootstrap.
- **Vuelta atrás:** ver los dos límites de CA-25.
- **Cerrar el corte no autoriza publicar.** El pase lo decide el PO.

## Preguntas del encargo

**1. ¿Hay algún límite de intentos fallidos de ingreso?** **No.** Se midió en el ensayo, sin cambiar nada:

- 100 intentos seguidos con contraseña errónea sobre la cuenta ADMIN de ensayo dieron 100 respuestas 401 en 37,5 s, unos 360–375 ms cada uno.
- Inmediatamente después, el ingreso con la contraseña correcta dio 204.
- No hay bloqueo de cuenta, ni demora creciente, ni límite por dirección.
- Lo único que frena es el costo de BCrypt 12, que es el mismo en cada intento.
- El código no tiene ningún mecanismo para esto. Si hace falta, es una decisión de negocio para un corte futuro.

**2. ¿Qué pasa con una tarea En proceso cuyo único técnico pendiente se desactiva?**

- La tarea **queda En proceso y no se finaliza sola**, porque la persona desactivada sigue asignada y sin confirmar.
- Esa persona ya no puede entrar a confirmar.
- **La destraba un supervisor (o ADMIN) de dos maneras:**
  - asigna a otra persona y quita a la desactivada;
  - o vuelve la tarea a Por hacer.
- Antes de guardar la desactivación, la pantalla avisa cuántas tareas en proceso quedan en ese caso (D-82).
- Lo prueba `aSupervisorUnblocksATaskWhoseOnlyPendingTechnicianWasDeactivated`, con las dos salidas.

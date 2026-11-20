# Corte 2B — "Recuperar la contraseña y frenar intentos" · informe de entrega

ENCARGO-DEV-003, 20/11/2026.

- **Base:** `33318d2`.
- **Rama:** `feat/recuperar-contrasena`.
- **Etiqueta de entrega:** `v0.2.1-candidato.1`.
- **Eventos:** E-010 y E-011 (recepción), E-012 (DEV-05) y E-013 (entrega).
- **Decisiones aplicadas:** D-154 a D-170.

Esto es **validación propia del desarrollo**. La revisión independiente la hace QA. Producción no se miró ni se tocó.

## Resumen

| Criterio | Resultado | Evidencia principal |
|---|---|---|
| CA-28 Enlace "¿Olvidaste tu contraseña?" y misma respuesta para cualquier correo | **OK** | Suite, matriz §10, tiempos (cuerpo idéntico), capturas 1–3 |
| CA-29 Recuperación completa con el enlace | **OK** | Recorrido completo §1, suite, capturas 2–5 |
| CA-30 Un solo uso, 30 min, "Este enlace ya no sirve", un pedido nuevo anula el anterior | **OK** | Recorrido completo §2–3, suite (con DEV-05), capturas 6 |
| CA-31 Bloqueo tras 5 fallos en 15 min | **OK** | Matriz §10, recorrido completo §7, suite, capturas 7 |
| CA-32 Error de firma junto al botón (QA-002) | **OK** | Capturas 10 en los cuatro modos |
| CA-33 Errores de `/api` con el JSON propio | **OK** | Matriz §10, `ErrorsAndNoMailTest` |
| CA-34 Textos después de restablecer (N-32) | **OK** | Capturas 9 |
| CA-35 Pantallas en escritorio y 390, día y noche | **OK**, con 390 emulado | 40 capturas en `docs/evidencia-corte-2b/` |
| CA-36 Correo según D-38 | **OK**, sin un proveedor real | Suite (`MailTransportTest`, cola, topes, 60 min), recorrido completo, "correo no configurado" |
| CA-37 Token seguro, solo su hash, después del `#`, un Host falso no cambia el enlace | **OK** | `theLinkIsSafe`, recorrido completo §6 y §8 |
| CA-38 No revela qué correos tienen cuenta (tiempos) | **OK**, cerrado con dos mediciones (D-167) | `ca38-tiempos-1-ecd91a5.md`, `ca38-tiempos-2-dde7656.md` |
| CA-39 Frenos por API y dominios reservados | **OK** | Suite, matriz §10, recorrido completo §4–5, calibración |
| CA-40 Permisos y bitácora de cuentas | **OK** | Matriz §10 (4 roles y sin sesión), suite |
| CA-41 Commit en el JAR y credenciales del migrador | **OK** | Manifiestos, `CommitLog`, `CredentialsTest` |
| CA-42 V5 y vuelta atrás | **OK** | `UpgradeFromSchema4Test`, instalación limpia, JAR de v0.2.0 sobre el esquema 5: 194 OK |
| CA-43 Suite, matrices, lint, tipos, `test:ui`, build Node 24.22.1 y audit | **OK** | Ver detalle |

**16/16 = 100 % verificado por el desarrollo**, con los límites escritos en "Qué no ejecuté y por qué".

Defecto propio nuevo: **DEV-05** (E-012). Apareció en la medición de CA-38 y quedó corregido en `dde7656` antes de la entrega. Por ese arreglo se volvieron a correr la suite, la matriz y el recorrido completo sobre el commit final (D-170).

## Entorno

- **Base:** PostgreSQL 18.6 en contenedor. La suite corre en `sti-suite`; el ensayo, en `sti-ensayo` (127.0.0.1:5434), con los roles `sti_migrator` y `sti_runtime` y Flyway V1–V5.
- **Backend:** JDK 21, `./mvnw.cmd`, los tres JAR reales.
- **Correo:** GreenMail (D-155) como servidor SMTPS falso en `localhost:3465`, con certificado propio. Los correos quedan como archivos en `output/ensayo/correo/`.
  - Con `-Correo`, `ensayo.ps1` entrega los seis valores de correo **como archivos** en un directorio de credenciales, como lo hará `LoadCredential` (D-163).
- **Interfaz:** imagen `sti-ensayo-frontend:local` desde `node:24.22.1-bookworm-slim`.
- **Navegador:** Chrome de escritorio sobre `http://127.0.0.1:3000`.
- **Datos:** falsos.
  - Cuentas en `@example.invalid` (dominio reservado) y en `@correo-ensayo.lan` (no reservado; lo atrapa el servidor falso).
  - Las contraseñas se sortean en cada corrida y no quedan en el repositorio.
- **Carga y servidor:** comparten la PC (12 CPU lógicas, 15,7 GB). Los milisegundos son de esta máquina, no del VPS.

Para repetir:

```powershell
./backend/scripts/ensayo.ps1 -Accion Suite
./backend/scripts/ensayo.ps1 -Accion Interfaz
./backend/scripts/ensayo.ps1 -Accion Levantar -Compilar -Correo -Frontend ninguno
node backend/scripts/ensayo/matriz-api.mjs output/ensayo
node backend/scripts/ensayo/recuperacion-e2e.mjs output/ensayo
node backend/scripts/ensayo/tiempos-corte2b.mjs output/ensayo 300 correo-ensayo.lan
# calibración: $env:STI_AUTH_MAX_CONCURRENT_CHECKS='2' (o '4'), Bajar, Levantar -Frontend ninguno, y:
node backend/scripts/ensayo/calibracion-tope.mjs output/ensayo 60 30
# vuelta atrás: Levantar -Frontend ninguno -JarWeb <JAR web de v0.2.0-candidato.1>, y la matriz de esa etiqueta
./backend/scripts/ensayo.ps1 -Accion Bajar
```

## Commits del corte

| Commit | Qué |
|---|---|
| `8eae463` | E-010, recepción; línea de base de tiempos de ingreso |
| `08ebab3` | Backend: recuperación, bloqueo, tope de comprobaciones, cola de correo, V5, JSON de errores, commit en el JAR |
| `ecd91a5` | Interfaz: recuperar, nueva contraseña, mensajes de ingreso, error de firma (QA-002), texto tras restablecer (N-32) |
| `bf36e59` | Recorrido completo con GreenMail, script de calibración, correo como archivos de credenciales |
| `dde7656` | **DEV-05**; capturas de CA-35; evidencia de D-164 |
| `8d7d051` | Tiempos de CA-38 antes y después de DEV-05; matriz y recorrido sobre `dde7656` |
| `5df857e` | E-012 (DEV-05) |

El código del backend y de la interfaz no cambió después de `dde7656`. Lo que sigue son documentos y evidencia.

## Detalle por criterio

Las pruebas de suite citadas están en `backend/src/test/java/com/stisistemas/os/`. Leen el estado guardado en la base, no solo la respuesta.

### CA-28 — Enlace y misma respuesta · OK

- **Suite:** `theAnswerIsTheSameWhateverTheEmailIs`.
- **Matriz §10:** "Misma respuesta (estado, tipo y tamaño) con cuenta, inactiva, sin cuenta y vacío": 202, sin cuerpo. Lo mismo con un correo de 400 caracteres.
- **Tiempos:** 300 respuestas por caso, todas con el mismo estado y el mismo cuerpo byte a byte.
- **Capturas:** `ca35-*-1-ingreso`, `-2-recuperar-formulario` y `-3-revisa-tu-correo`.

### CA-29 — Recuperación completa · OK

- **Recorrido completo §1:** pedir, recibir el correo en el servidor falso, abrir el enlace y guardar.
  - La contraseña anterior deja de servir y la nueva entra.
  - Se cierran las sesiones abiertas.
  - No inicia sesión sola.
- **Suite:** `choosingTheNewPasswordWithTheLink`.
- **Capturas:** 4 (formulario) y 5 ("Listo. Ya podés ingresar con tu contraseña nueva.").

### CA-30 — Enlace que ya no sirve · OK

- **Recorrido completo §2:** usado, alterado, cortado y vencido (con `expires_at` movido en la base de ensayo). Los cuatro dan el mismo `400 ENLACE_INVALIDO`, "Este enlace ya no sirve. Pedí uno nuevo.", y la contraseña no cambia.
- **Recorrido completo §3:** un pedido nuevo anula el anterior. El primer enlace queda revocado en la base.
- **Suite:**
  - `aLinkThatNoLongerWorks`, `confirmingDropsWhatWasStillWaiting`;
  - `aNewRequestCancelsTheOneStillWaiting`, que desde DEV-05 espera el reemplazo al procesar la cola;
  - `anOlderRequestWaitingForARetryDoesNotGoOutAfterTheNewerOne`, nueva.
- **Vida del enlace:** 30 minutos desde que sale el correo, no desde el pedido.
- **Capturas:** 6.

### CA-31 — Bloqueo · OK

- **Matriz §10:**
  - cuenta existente: 4 fallos dan 401 y el 5.º da 429;
  - correo inexistente: lo mismo;
  - bloqueada, la contraseña correcta también recibe 429 `DEMASIADOS_INTENTOS`;
  - mismo mensaje exista o no la cuenta;
  - una entrada en la bitácora, sin contraseñas.
- **Recorrido completo §7** y `recoveringByEmailWorksWhileBlockedAndLiftsTheBlock`: pedir el enlace funciona durante el bloqueo, y recuperar lo levanta.
- **Suite:** `fiveFailedSignInsBlockTheEmailEvenWithTheRightPassword` y `aRightSignInResetsTheCountAndOldFailuresAgeOut`.
- **El contador vive en memoria (D-159):** un reinicio o un pase lo borra.
- **Capturas:** 7 ("Demasiados intentos. Esperá 15 minutos o usá ¿Olvidaste tu contraseña?").

### CA-32 — Error de firma junto al botón · OK

- **Cómo se provocó:** una tarea falsa finalizada abierta en la pantalla, con la firma dibujada; mientras tanto se firmó por la API. Al apretar "Firmar" llega 409 y el texto "La tarea ya tiene una firma vigente." aparece debajo de los botones.
- **Capturas:** `ca35-*-10-error-de-firma-qa002` en los cuatro modos.
- **Observación:** el mismo texto aparece también en la franja roja de arriba de la página, detrás del panel.

### CA-33 — JSON propio · OK

- **Matriz §10:** `GET /api/no-existe` y `DELETE /api/auth/csrf`, con los 4 roles y sin sesión: JSON propio, sin HTML. `GET /api/auth/password-recovery` da `405` con JSON propio.
- **Suite:** las cuatro pruebas de `ErrorsAndNoMailTest`, incluida la dirección de error del contenedor.

### CA-34 — Texto tras restablecer (N-32) · OK

El panel ahora dice:

- "Nueva contraseña inicial para <nombre>";
- "La anterior ya no sirve y se cerraron sus sesiones.";
- "Se muestra una sola vez".

Capturas 9 en los cuatro modos. La contraseña se tapó en la página antes de cada captura.

### CA-35 — Pantallas · OK, con 390 emulado

- **40 capturas**, las diez pantallas pedidas en escritorio día, escritorio noche, 390 día y 390 noche:
  1. ingreso con el enlace;
  2. formulario de recuperar;
  3. "Revisá tu correo";
  4. formulario de contraseña nueva;
  5. "Listo";
  6. enlace que ya no sirve;
  7. ingreso bloqueado;
  8. ingreso ocupado;
  9. panel tras restablecer (N-32);
  10. error de firma (QA-002).
- **El ancho de 390:** la aplicación se cargó en un `iframe` de la misma pestaña, ajustado hasta tener 390 px útiles (`clientWidth` = `scrollWidth` = 390). No hay desplazamiento horizontal en ninguna.
- **"Ocupado":** se provocó con 30 ingresos simultáneos desde la misma página. 26 recibieron 429 y 4 se comprobaron, que es justo el tope de 4.
- **Contraseñas y enlaces:** ninguna captura muestra una contraseña ni un enlace entero. Las capturas son del contenido, sin barra de direcciones; los campos de contraseña muestran puntos y la contraseña inicial se tapó.
- **Backend de las capturas:** el JAR de `ecd91a5`, antes de DEV-05. DEV-05 no cambia ninguna pantalla ni ningún texto.

### CA-36 — Correo (D-38) · OK, sin un proveedor real

- **Configuración y credencial:** los seis valores llegan como archivos (D-163). La aplicación arranca sin ellos (`withoutTheMailConfiguredTheApplicationStartsTheScreenAnswersTheSameAndTheQueueSaysSo`).
  - En el ensayo sin `-Correo`, una cuenta activa de `correo-ensayo.lan` recibió `202` con cuerpo vacío.
  - La fila quedó OMITIDO `CORREO_NO_CONFIGURADO`, no salió ningún correo y el log dice "correo no configurado".
- **Certificado (D-155):** `MailTransportTest`.
  - Sin confianza en el certificado, el correo no sale.
  - Con confianza y el nombre correcto, sale.
  - Con un nombre que no está en el certificado, se rechaza aunque el certificado sea de confianza.
- **Cola:**
  - `aFailingMailServerBreaksNothingAndTheQueueRetriesWithGrowingWaits`;
  - `afterTheMaximumOfTriesTheMailIsDropped` (6 intentos);
  - `aMailThatCouldNotGoOutInSixtyMinutesIsDroppedAndSaysSo`;
  - `theQueueSurvivesARestart`.
- **Topes:** `theOwnCeilingOfThirtyAnHourAndTwoHundredADay`. En el ensayo también se vio: con el tope de 30 por hora alcanzado, las filas esperan.
- **Log sin el enlace:** recorrido completo §8 (ningún token en el log ni en claro en la base).
- **D-164:** la limpieza de 30 días borró las 2 filas viejas que no enviaron nada y dejó la enviada y la de 29 días (`d164-limpieza-2026-11-20.md`).

### CA-37 — Token seguro · OK

- **Suite:** `theLinkIsSafe`.
  - 32 bytes al azar en base64url (43 caracteres), después del `#`.
  - En la base solo queda su SHA-256.
- **Recorrido completo §6:** `Host` y `X-Forwarded-Host` falsos no cambian el enlace, porque sale de `STI_PUBLIC_URL`.
- **Recorrido completo §8:** ningún token en claro en la base ni en los logs.

### CA-38 — Tiempos · OK, cerrado con dos mediciones (D-167)

**Método:**

- 300 muestras por caso, después de 30 de calentamiento.
- Los casos se intercalan al azar en cada vuelta.
- Cada pedido usa conexión y sesión nuevas.
- Se calcula el intervalo bootstrap de 95 % de la diferencia de medianas.

| Familia | Comparación | 1.ª medición, `ecd91a5` | 2.ª medición, `dde7656` |
|---|---|---|---|
| Ingreso con contraseña errónea | inexistente contra activa | +13,3 (−13,1 a +44,3) | +1,1 (−15,6 a +18,1) |
| | inactiva contra activa | +9,9 (−20,0 a +40,2) | −5,4 (−20,1 a +12,3) |
| Pedido del enlace | activa con dominio reservado contra inexistente | −0,8 (−2,9 a +1,9) | +0,6 (−0,3 a +1,3) |
| | inactiva contra inexistente | +0,6 (−1,7 a +3,5) | +0,4 (−0,4 a +1,5) |
| | **activa que envía contra inexistente** | **+2,9 (+0,7 a +5,8)** | **+0,9 (−0,1 a +1,5)** |
| Mensaje de bloqueo | inexistente contra cuenta | +0,4 (−0,9 a +1,3) | −0,1 (−0,6 a +0,4) |
| Enlace que no sirve | ya usado contra inventado | −0,5 (−5,4 a +4,7) | 0,0 (−1,5 a +1,2) |

- **Primera medición:** encontró DEV-05 (E-012). En la segunda, todos los intervalos pasan por cero.
- **El caso que envía:** **+0,9 ms, con intervalo de −0,1 a +1,5.** Queda cerca del borde. Se informa tal cual (D-167); no hubo tercera medición.
- **Detalle:** las tablas completas y el desglose por número de pedido están en `ca38-tiempos-1-ecd91a5.md` y `ca38-tiempos-2-dde7656.md`.

### CA-39 — Frenos y dominios reservados · OK

- **Tres pedidos por hora por correo:** `threeRequestsAnHourPerEmail` y recorrido completo §4. El 4.º recibe la misma respuesta y queda OMITIDO `LIMITE_POR_CORREO`. Sin cuenta no se anota nada del texto (D-160).
- **Dominios reservados:** `reservedDomainsGetNothingAndAreRecordedAsSkipped`, `reservedDomainsNeverGetAMail` y recorrido completo §5.
- **Tope de comprobaciones simultáneas:** `atMostAsManyPasswordChecksAtTheSameTimeAndTheServerKeepsAnswering` y `theThreeChecksShareTheCeilingAndOtherRequestsAreNotTouched`.

**Calibración (D-161, D-166).** 60 clientes durante 30 s, ingresando con contraseña errónea y correos únicos, mientras `/api/health` se consulta cada 100 ms. Una corrida por valor.

| Tope | Health en reposo, p50 | Health con carga: p50 / p95 / máx. | Errores de health | Comprobados | Por segundo | "Ocupado" (429) | Espera de un comprobado: p50 / p95 |
|---|---|---|---|---|---|---|---|
| 2 | 10,5 ms | 211 / 739 / 967 ms | 0 | 44 | 1,5 | 2954 | 1,7 / 3,4 s |
| 4 | 25,4 ms | 394 / 1637 / 2563 ms | 0 | 32 | 1,1 | 1259 | 4,3 / 9,9 s |

- Con los dos valores, `/api/health` siguió respondiendo, sin errores.
- **Recomendación: 2.** En esta PC, con 2 la salud respondió más rápido y además pasaron más comprobaciones por segundo que con 4. Con 4, una comprobación admitida esperó hasta 10 s.
- **Límites de la recomendación:**
  - una sola corrida por valor;
  - el reposo de la corrida de 4 ya estaba más cargado (p50 25 contra 10 ms), lo que sugiere ruido de la máquina;
  - el VPS tiene otros núcleos.
- **El valor final se fija en el pase (D-161).** Para usar 2: `Environment=STI_AUTH_MAX_CONCURRENT_CHECKS=2` en la unidad. No es un secreto.
- **Con 8:** no se corrió (D-166).

### CA-40 — Permisos y bitácora · OK

- **Matriz §10:** las cuatro operaciones nuevas, con los 4 roles y sin sesión, responden igual (`theNewAddressesAreTheSameForEveryRoleAndWithoutASession`).
- **Bitácora:**
  - una entrada `RECUPERACION_CORREO` por recuperación;
  - una `BLOQUEO_INGRESO` por bloqueo;
  - el actor es la propia cuenta (D-158);
  - sin contraseñas ni tokens.

### CA-41 — Commit en el JAR y credenciales del migrador · OK

- **Manifiesto** de los tres JAR compilados desde `5df857e` (`unzip -p <jar> META-INF/MANIFEST.MF`):

  ```
  Git-Commit: 5df857e1462ad89a1ac24e2a4ea829ada462e55c
  Git-Commit-Time: 2026-11-20T11:46:04-03:00
  Git-Dirty: false
  ```

- **Al arrancar:** el log dice `Commit del JAR: 5df857e1462ad89a1ac24e2a4ea829ada462e55c dirty=false`.
- **Nada más se filtra:** `theJarSaysWhichCommitItCameFromAndNothingElseDoesNotLeak` verifica tres cosas:
  - el log de arranque trae el commit;
  - `git.properties` guarda solo `git.commit.id`, `git.commit.id.abbrev`, `git.commit.time` y `git.dirty`, sin autor, correos, máquina, usuario, repositorio ni rama (D-156);
  - ni `/api/health`, ni `/api/auth/csrf`, ni un error devuelven el commit, ni en el cuerpo ni en los encabezados.
- **Compilar sin `.git`:** que la compilación falle (D-156) no se volvió a probar en esta entrega.
- **Credenciales del migrador y del bootstrap (N-35):** las cinco pruebas de `CredentialsTest`.
  - Lee primero el archivo del directorio de credenciales.
  - El salto de línea final no es parte de la contraseña.
  - Si no hay nada, se detiene y nombra la credencial, sin mostrar el valor.

### CA-42 — V5 y vuelta atrás · OK

- **Instalación limpia:** cada `Levantar` migra de cero a 5.
- **Actualización con datos:** `schema5OverSchema4WithDataKeepsEverythingAndAddsOnly`. Una base migrada a 4 y cargada se migra a 5 y conserva todo. V5 solo agrega: `mail_outbox`, `mail_attempt`, `password_reset_token` y dos tipos nuevos en la bitácora.
- **JAR web de `v0.2.0-candidato.1` sobre el esquema 5:**
  - compilado en un worktree de esa etiqueta (`7232b9d`), sha256 `71e7e222…9a34`;
  - corrió la matriz de esa misma etiqueta, sin cambios;
  - **194 OK, 0 FALLA, 6 observaciones**, lo mismo que en el corte 2 (`ca42-matriz-v020-esquema5.md`).
- **Límites de una vuelta atrás a v0.2.0:**
  - no hay recuperación por correo ni bloqueo;
  - las filas de la cola quedan como estaban;
  - al volver a v0.2.1, un enlace que hubiera salido antes de la vuelta atrás y siga dentro de sus 30 minutos todavía sirve.
- **Migrador:** el de v0.2.0 no se probó contra el esquema 5. Flyway de v0.2.0 conoce hasta V4.

### CA-43 — Todo junto · OK

- **Suite** sobre el commit final `5df857e`: `Tests run: 78, Failures: 0, Errors: 0`, contra PostgreSQL 18.6.
  - FoundationTest 25, AccountsTest 16, RecoveryTest 21, MailTransportTest 6, CredentialsTest 5, ErrorsAndNoMailTest 4, UpgradeFromSchema4Test 1.
- **Matriz** con el JAR de `5df857e`: **256 OK, 0 FALLA, 6 observaciones**. Las secciones 0 a 9 son las reglas de los cortes 1 y 2; la sección 10 es la nueva.
- **Recorrido completo:** **54 OK, 0 FALLA**.
- **Interfaz** (`-Accion Interfaz`), corrida sobre `ecd91a5`; la interfaz no cambió después:
  - build con Node v24.22.1;
  - reescrituras presentes en el manifiesto;
  - lint OK, tipos OK;
  - `test:ui` 20/20;
  - `npm audit`: 0 avisos.

## Lo que el servidor tiene que saber

**Hay migración nueva: V5.** Solo agrega.

### a. Credenciales nuevas del proceso web (D-163)

Van en `sti-backend.service`, junto a las cuatro `STI_DB_*` / `STI_UPLOADS_DIR` que ya existen:

```ini
LoadCredential=STI_MAIL_HOST:/etc/sti-os/credentials/STI_MAIL_HOST
LoadCredential=STI_MAIL_PORT:/etc/sti-os/credentials/STI_MAIL_PORT
LoadCredential=STI_MAIL_USERNAME:/etc/sti-os/credentials/STI_MAIL_USERNAME
LoadCredential=STI_MAIL_FROM:/etc/sti-os/credentials/STI_MAIL_FROM
LoadCredential=STI_MAIL_PASSWORD:/etc/sti-os/credentials/STI_MAIL_PASSWORD
LoadCredential=STI_PUBLIC_URL:/etc/sti-os/credentials/STI_PUBLIC_URL
```

- Los lee el `SPRING_CONFIG_IMPORT=configtree:/run/credentials/sti-backend.service/` que ya está en la unidad. Los archivos los escribe el dueño; el valor de ninguno va por chat ni al repositorio.
- `STI_PUBLIC_URL` es la dirección pública con `https://`, sin barra final. El enlace del correo sale de ahí, nunca del `Host` del pedido.
- `STI_MAIL_FROM` admite la forma `Nombre <correo>`.
- El envío es SMTPS (SSL desde el inicio) y comprueba el nombre del servidor contra el certificado.
- **Sin estos archivos** la aplicación arranca igual: la recuperación responde lo mismo y anota OMITIDO `CORREO_NO_CONFIGURADO`.
- **`STI_AUTH_MAX_CONCURRENT_CHECKS` no es necesaria.** Vale 4 por defecto. Si el pase elige 2, va `Environment=STI_AUTH_MAX_CONCURRENT_CHECKS=2`; no es un secreto.

### b. Migrador y bootstrap con `systemd-run` (D-162, N-35)

`systemd-run` con `LoadCredential` pone `CREDENTIALS_DIRECTORY`. El proceso lee la contraseña de ahí, nunca de un argumento. Las partes entre `<…>` no constan desde esta PC: las completa el servidor.

**Migrador**, en cada pase que trae migración:

```bash
sudo systemd-run --pipe --wait --collect --unit=sti-migrate-<release> \
  -p User=<usuario del servicio> \
  -p LoadCredential=STI_MIGRATION_PASSWORD:/etc/sti-os/credentials/db-migrator \
  -E STI_DB_URL=jdbc:postgresql://127.0.0.1:5432/sti_os \
  -E STI_MIGRATION_USER=sti_migrator \
  /usr/bin/java -jar /srv/sti-os/releases/backend/<release>/<…>-migrator.jar
```

- El salto de línea final del archivo `db-migrator` no es parte de la contraseña.
- Termina con código 0 si migró, o si no había nada que migrar.

**Bootstrap.** Crea el primer ADMIN y **solo sirve con una base vacía**: falla si ya hay más de una cuenta. **No se corre en producción**, que ya tiene datos reales.

```bash
sudo systemd-run --pipe --wait --collect --unit=sti-bootstrap \
  -p User=<usuario del servicio> \
  -p LoadCredential=STI_MIGRATION_PASSWORD:/etc/sti-os/credentials/db-migrator \
  -p LoadCredential=STI_INITIAL_ADMIN_PASSWORD:<archivo que escribe el dueño> \
  -E STI_DB_URL=jdbc:postgresql://127.0.0.1:5432/sti_os \
  -E STI_MIGRATION_USER=sti_migrator \
  -E STI_INITIAL_ADMIN_NAME='<nombre>' \
  -E STI_INITIAL_ADMIN_EMAIL=<correo> \
  /usr/bin/java -jar /srv/sti-os/releases/backend/<release>/<…>-bootstrap.jar
```

### c. Cómo leer de qué commit salió un JAR

```bash
unzip -p <jar> META-INF/MANIFEST.MF | grep '^Git-'
```

- `Git-Commit` tiene que ser el commit completo de la etiqueta.
- `Git-Dirty` tiene que decir `false`; si dice `true`, el JAR no se publica.
- Al arrancar, el log del proceso web dice `Commit del JAR: <commit> dirty=false`.

### d. Sumas sha256

Los tres JAR, compilados desde `5df857e` (árbol limpio, `Git-Dirty: false`):

| JAR | sha256 |
|---|---|
| `sti-os-backend-0.1.0-SNAPSHOT.jar` (web) | `febb2236501e7f9b6b8e6397f05fc71b733624b5897b1f9e198ae97737e75d5b` |
| `sti-os-backend-0.1.0-SNAPSHOT-migrator.jar` | `e939a27a57065f8c53ac3b959f183f3926d4fb8bcdacc5ea95fab007f0e49dba` |
| `sti-os-backend-0.1.0-SNAPSHOT-bootstrap.jar` | `34053fb2e0a9fb98e58e5a1c4a362c9162b4f2caa3999ecd8db63a3b8203acb3` |

- El servidor compila desde el commit de la etiqueta, así que su `Git-Commit` será ese, y las sumas cambian con el commit.
- Las sumas de los JAR compilados desde el commit de la etiqueta van en E-013.

### Lo demás

- **Reescrituras:** ninguna nueva. Las direcciones nuevas están bajo `/api/auth/`, que ya se reescribe. `/recuperar` y `/nueva-contrasena` son páginas de la interfaz.
- **Contadores en memoria:** el bloqueo y el límite de 3 pedidos por hora viven en memoria (D-159, D-160). Un pase los borra.
- **Cerrar el corte no autoriza publicar.** El pase lo decide el PO.

## Qué no ejecuté y por qué

- **Calibración con tope 8:** no se corrió, por D-166.
- **Tercera medición de tiempos:** no se repitió, por D-167. El +0,9 ms del caso que envía queda informado tal cual.
- **Un proveedor de correo real:** no hay credenciales y no se usan. El transporte se probó con GreenMail y un certificado propio.
- **El migrador de v0.2.0 contra el esquema 5:** no se corrió. Ver CA-42.
- **`-Accion Interfaz` sobre el commit final:** corrió sobre `ecd91a5`. La interfaz no cambió después; DEV-05 es solo backend.
- **Capturas con el JAR de `dde7656`:** se tomaron con `ecd91a5`. DEV-05 no cambia ninguna pantalla.
- **Un teléfono real:** el 390 se emuló con un `iframe`.
- **Compilar sin `.git`:** no se repitió en esta entrega (CA-41).
- **Los comandos de `systemd-run`:** no se ejecutaron. No hay un Linux con systemd en esta PC. Los lee el servidor.
- **La matriz, el recorrido y los tiempos corren con el Node de la PC (22.19.0).** Es solo el cliente de prueba.
- **Producción:** no se miró ni se tocó.
- **Revisión independiente:** es de QA.

## Observaciones sin defecto asignado

- **Error de firma repetido:** también aparece arriba de la página, detrás del panel (CA-32).
- **El log se llena con el tope de envío alcanzado:** "Tope de envío alcanzado: el correo espera" se escribe una vez por fila en espera y por minuto. En el ensayo, con 101 filas esperando, fueron 176 líneas en una hora. No pierde datos, pero ensucia el log.
- **Duración de la segunda medición de tiempos:** la corrida tardó 56 minutos contra 16 de la primera. No se investigó.

## Defectos propios

- **DEV-05** (media, cerrado en `dde7656`): ver E-012.
- **DEV-02 y DEV-03:** siguen como estaban.

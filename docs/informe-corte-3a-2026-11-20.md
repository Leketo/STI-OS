# Corte 3A — "Cerrar el círculo" · informe de entrega

ENCARGO-DEV-004, 20/11/2026.

- **Base:** `a60cdc2`.
- **Rama:** `feat/cerrar-circulo`.
- **Etiqueta de entrega:** `v0.3.0-candidato.1` (D-208).
- **Eventos:**
  - E-015 (recepción) y E-016 (respuestas del PO, D-217 a D-221);
  - E-017 (DEV-06), E-018 (DEV-07) y E-019 (rectificación de E-018);
  - E-020 (entrega).
- **Decisiones aplicadas:** D-199, D-208, D-215 y D-217 a D-221.

Esto es **validación propia del desarrollo**. La revisión independiente la hace QA. Producción no se miró ni se tocó.

## Resumen

| Criterio | Resultado | Evidencia principal |
|---|---|---|
| CA-44 "No facturable": roles, motivo obligatorio, etiqueta, columna "Cerradas", historial | **OK** | Matriz §11, `ClosingTest`, capturas 03–08 |
| CA-45 Facturar con firma, "Volver a Finalizadas", filtro, técnico y cliente no ven las cerradas | **OK** | Matriz §11, capturas 22–25 leídas contra la base |
| CA-46 Firma a pantalla completa, vertical y girada, aclaración, "Listo", la X y "Firmar" | **OK**, después de DEV-07 | Capturas 13–21; la X y Escape probados en el navegador |
| CA-47 "Descargar constancia (PDF)"; contenido; recuadro en blanco sin firma | **OK** | Capturas 05, 07, 08; dos PDF de ejemplo; `ConstanciaRenderTest` |
| CA-48 Error de firma junto al botón; aviso de 5 fotos; freno del servidor web; ubicación opcional | **PARCIAL** | Aviso de 5 fotos visto (captura 26). Lo demás no lo vi en el navegador (ver "Qué no ejecuté") |
| CA-49 Pantallas con el logo: escritorio, 390 y 844×390; día y noche | **OK**, con el ancho emulado | 26 capturas en `docs/evidencia-corte-3a/capturas/` |
| CA-50 Permisos por API con cuatro roles y sin sesión | **OK** | Matriz §11 y §12, `ConstanciaTest` |
| CA-51 Reglas en el backend y cierres simultáneos | **OK** | `ClosingTest`: 0 de 10 vueltas con falla en las dos carreras |
| CA-52 Constancia: fechas, hora de Paraguay, otra empresa, nombre, sin caché, tildes, logo | **OK** | `ConstanciaTest` (fechas contra la base), matriz §12, PDF de ejemplo |
| CA-53 N-42 a lo sumo una línea por minuto; N-24 medido | **OK** | `RecoveryTest`; N-24: 443 ms con la ubicación rechazada |
| CA-54 V6 limpia y desde 5; v0.2.1 sobre el esquema 6, con y sin NO_FACTURABLE | **OK** | `UpgradeFromSchema4Test`; 256 OK en las dos corridas; sonda |
| CA-55 Suite, matrices anteriores, lint, tipos, `test:ui`, build Node 24.22.1, audit | **OK** | Ver detalle |

**11/12 = 92 % verificado por el desarrollo.** CA-48 queda PARCIAL. Los límites están en "Qué no ejecuté y por qué".

**Defectos propios nuevos:**

- **DEV-06 (E-017):** `npx` bajó un paquete del registro de npm. Es un defecto de forma de trabajo, no del código.
- **DEV-07 (E-018 y E-019):** la firma a pantalla completa quedaba tapada por el panel, y después Escape cerraba también el panel. Apareció al tomar las capturas y quedó corregido en `a214de6` y `9f7cdad` antes de la entrega. E-018 dio por probado lo de Escape sin haberlo probado; E-019 lo rectifica.

## Entorno

- **Base:** PostgreSQL 18.6 en contenedor.
  - La suite corre en `sti-suite`.
  - El ensayo corre en `sti-ensayo` (127.0.0.1:5434), con los roles `sti_migrator` y `sti_runtime` y Flyway V1 a V6.
- **Backend:** JDK 21, `./mvnw.cmd`, los tres JAR reales.
- **Interfaz:** imagen `sti-ensayo-frontend:local` desde `node:24.22.1-bookworm-slim`.
- **Navegador:** Chrome de escritorio sobre `http://127.0.0.1:3000`.
  - 390 y 844×390 se emularon con un iframe, sin un teléfono real.
- **Datos:** falsos, en `@example.invalid`.
  - Las contraseñas se sortean en cada corrida y no quedan en el repositorio.
  - Durante las capturas guardé la del ADMIN de ensayo en dos archivos sueltos de la carpeta temporal del trabajo. Los borré a pedido del PO.
  - Después busqué esa contraseña y la de la corrida anterior en `output/`, `docs/`, `coordinacion/`, `backend/scripts`, `frontend/src` y la carpeta temporal. Fuera de `output/ensayo/secretos.json` no quedó ninguna copia.
  - En las capturas no se ve ninguna contraseña, porque el ingreso se hizo con una llamada a la API.
- **Carga y servidor:** comparten la PC. Los milisegundos son de esta máquina, no del VPS.

Para repetir:

```powershell
./backend/scripts/ensayo.ps1 -Accion Suite
./backend/scripts/ensayo.ps1 -Accion Interfaz
./backend/scripts/ensayo.ps1 -Accion Levantar -Compilar -Frontend ninguno
node backend/scripts/ensayo/matriz-api.mjs output/ensayo
# vuelta atrás: Levantar -Frontend ninguno -JarWeb <JAR web de v0.2.1-candidato.1>, la matriz de esa etiqueta, y:
node backend/scripts/ensayo/ca54-sonda.mjs output/ensayo 7
# recuperación del 2B: Levantar -Correo -Frontend ninguno, y:
node backend/scripts/ensayo/recuperacion-e2e.mjs output/ensayo
./backend/scripts/ensayo.ps1 -Accion Bajar
```

## Commits del corte

| Commit | Qué |
|---|---|
| `b4c401b` | E-015, recepción, con las respuestas a las cuatro preguntas |
| `66af06f` | E-016, D-217 a D-221 |
| `a4a4ab1` | Backend de la parte A: no facturable (R-23), V6, y N-42 |
| `18c5e4e` | E-017, DEV-06 |
| `79e997f` | Interfaz de las partes A, B, D y E |
| `5ab80f4` | Parte C: constancia en PDF (R-21), PDFBox 3.0.5, Inter 4.1 y el logo en vectores |
| `7c76ede` | Las secciones 11 y 12 de la matriz leen los errores por su código HTTP; evidencia sobre `5ab80f4` |
| `e6dff65` | CA-54, la vuelta atrás, y la sonda |
| `a214de6` | DEV-07: la firma es su propio diálogo modal; E-018; capturas de CA-49 |
| `9f7cdad` | DEV-07: Escape ya no cierra el panel; E-019; capturas de CA-45 |
| (este) | Informe, recorrido de recuperación, captura 26 y un caso nuevo en `ConstanciaTest` (tarea reabierta de verdad) |

**El código del backend no cambió desde `5ab80f4`:** `git diff 5ab80f4..HEAD -- backend/src/main backend/pom.xml` sale vacío.

- **Lo que sí cambió del backend:** una prueba, `ConstanciaTest`, a la que le agregué el caso de la tarea reabierta (ver CA-52). Esa clase se volvió a correr sola.
- **Lo demás que cambió:** la interfaz, scripts de ensayo y documentos.
- **Por eso:** la suite completa de `5ab80f4` vale para la etiqueta.

## Detalle por criterio

### CA-44 — No facturable · OK

- **Backend:**
  - solo ADMIN y SUPERVISOR, y solo desde FINALIZADO;
  - el motivo es obligatorio y de la lista (USO_INTERNO, GARANTIA);
  - queda en `sti.task.closing_reason` y en el evento (V6).
- **Restricciones de la base:** `task_closing_reason_status_check` (estado y motivo van juntos) y `task_event_closing_reason_kind_check`.
- **Navegador (06 y 07):** "Confirmar" queda inactivo hasta elegir un motivo. Al confirmar aparecen la etiqueta "No facturable · Uso interno", la tarea en "Cerradas" y la línea "Cerró como no facturable · Uso interno" con quién y cuándo.
- **Roles en la interfaz:** que el técnico y el cliente no vean el botón está cubierto por `test:ui` (`canMove`). En el navegador entré solo como ADMIN.

### CA-45 — Facturar, volver, filtro · OK

- **Facturar:** "Marcar facturada" con la firma vigente dejó la tarea "Facturada · Firmada" (captura 23). En la base el evento es `FINALIZADO>FACTURADO`.
- **Volver a Finalizadas:** desde Facturada (24 y 25), la base queda así:
  - estado `FINALIZADO`;
  - una firma vigente;
  - una confirmación conservada;
  - el evento `FACTURADO>FINALIZADO`.
- **Volver desde No facturable:** está en la matriz §11 y en `ClosingTest`.
- **Filtro "No facturable":** 7 de 69 tareas, las mismas 7 que cuenta la base (captura 22).
- **Técnico y cliente no ven las cerradas:** por API, matriz §11 (lista y detalle).

### CA-46 — Firma a pantalla completa · OK, después de DEV-07

- **Vertical:** a 390 (15 y 16), con la aclaración debajo. "Listo" queda inactivo mientras falte el trazo o la aclaración.
- **Giro a 844×390 y vuelta (17 a 19):** se conservan el trazo y la aclaración.
- **"Listo":** vuelve al panel con la firma y "Aclaración: …" a la vista (20).
- **"Firmar":** guarda (21). En la base, `sti.task_signature` quedó vigente con 59 257 bytes.
- **La X:** con un trazo hecho, cierra sin guardar. El panel queda con "Tocá para firmar" y la base tiene 0 firmas en esa tarea.
- **Escape:** cierra solo la firma, y un segundo Escape cierra el panel (E-019).
- **De noche:** el área de firma sigue blanca a propósito. La imagen se guarda oscura sobre blanco, como sale en la constancia.

### CA-47 — Descargar constancia · OK

- **Dónde está el botón:** en Finalizadas, Facturadas y No facturables, para ADMIN, SUPERVISOR y CLIENTE de la empresa. En el navegador se vio como ADMIN (05, 07 y 08).
- **PDF de ejemplo, con datos falsos:**
  - `constancia-ejemplo-firmada.pdf`;
  - `constancia-ejemplo-sin-firma.pdf`, con el recuadro en blanco y las líneas "Firma" y "Aclaración".
- **Contenido:**
  - logo, número, cliente, proyecto, tarea y responsables;
  - fechas de pedido, atención y finalización, en hora de Paraguay;
  - conformidad y pie de página.
- **Revisión:** los PDF se revisaron a ojo; `ConstanciaRenderTest` revisa el texto y el corte de los nombres largos.

### CA-48 — Mensajes · PARCIAL

- **Visto en el navegador:** "Llegaste al máximo de 5 fotos." con 5/5 (captura 26).
- **No visto en el navegador:**
  - **el error de firma junto al botón**, con el cambio de este corte (`dismissNotice` al fallar);
  - **el mensaje del freno del servidor web** (429 en el ingreso, `signInRefusal`). Está cubierto por `test:ui`, pero en el ensayo no hay un servidor web que devuelva 429;
  - **el texto de D-199** ("Al confirmar se pide tu ubicación…"). Aparece en la pantalla del técnico asignado, y en el navegador entré solo como ADMIN.

### CA-49 — Pantallas · OK, con el ancho emulado

- **Capturas:** 26 en `docs/evidencia-corte-3a/capturas/`, con un `LEEME.md` que dice qué muestra cada una y cómo se emuló el ancho.
- **Logo:** de día y de noche en el ingreso, la barra lateral y el menú del teléfono.
- **Favicons y manifiesto:** se sirven desde el contenedor con 200 y el tipo correcto, y las cuatro etiquetas `<link>` están en la página.

### CA-50 — Permisos · OK

- **Cómo se probó:** matriz §11 (cierre) y §12 (constancia), con los cuatro roles y sin sesión. Leída sobre `5ab80f4`: 310 OK, 0 FALLA y 6 observaciones (`matriz-api-5ab80f4.md`).
- **Constancia por rol:**
  - el técnico recibe 403;
  - el cliente de otra empresa, 404;
  - sin sesión, 401;
  - el cliente no la ve una vez cerrada (404).
- **Repetición:** la misma matriz dio 310 OK otras tres veces esta tarde, al cargar los datos de las capturas.

### CA-51 — Reglas y concurrencia · OK

- **Pruebas:** `ClosingTest`, 5 pruebas que leen la base:
  - motivo obligatorio y de la lista;
  - solo desde FINALIZADO;
  - no facturable sin firma;
  - facturar con firma;
  - volver conserva las confirmaciones y la firma.
- **Carreras:** conexiones independientes, una barrera y 10 vueltas.
  - Cierres simultáneos: 0 de 10 vueltas con falla. Por vuelta, un 200 y un `409 YA_CERRADA`.
  - Vueltas simultáneas: 0 de 10 con falla.

### CA-52 — Constancia · OK

- **Fechas:** `ConstanciaTest` compara las fechas del PDF con `sti.task_event`.
  - Atención es el primer paso a EN_PROCESO.
  - Finalizada es el último paso a FINALIZADO **que no venga de FACTURADO ni de NO_FACTURABLE** (ver pregunta 1).
- **"Volver a Finalizadas" desde un cierre:** no mueve la fecha de Finalizada.
- **Una reapertura de verdad** (FINALIZADO → EN_PROCESO → FINALIZADO):
  - Finalizada pasa a la nueva fecha y Atención sigue siendo la primera;
  - la firma, reemplazada por la reapertura, sale en blanco.
- **De dónde sale el caso de la reapertura:** **lo agregué al escribir este informe.** Antes el informe daba por cubierta la tarea reabierta sin que la prueba la tuviera. Corrió sola con `-Accion Suite -Pruebas ConstanciaTest`.
  - **Resultado:** 2/2 OK, sobre `9f7cdad` con este cambio sin confirmar todavía (Git-Dirty true).
  - **Duración:** Maven informa 2 h 18 min, pero la PC estuvo en espera moderna de 18:32:36 a 20:50:03 (Kernel-Power 506 y 507). Las pruebas corrieron al despertar, en unos 2 minutos.
- **Otras comprobaciones:**
  - hora de `America/Asuncion`;
  - `Cache-Control: no-store`;
  - nombre `constancia-TAR-NNNN.pdf`;
  - descargar no guarda nada (matriz §12);
  - nada de otra empresa: 404.
- **Tipografía:** Inter 4.1 incrustada como subconjunto (tildes y ñ).
- **Logo:** en vectores, desde el SVG (D-218).

### CA-53 — N-42 y N-24 · OK

- **N-42:** `RecoveryTest.theCeilingIsLoggedOnceAMinuteHoweverManyMailsWait`. Con 25 correos en espera a lo largo de dos vueltas queda una sola línea "Tope de envío alcanzado…" por minuto.
- **N-24:** en el navegador, con el permiso de ubicación en `denied`, crear una tarea desde el panel tardó **443 ms** del clic al cierre del panel:
  - 218 ms hasta que sale el pedido;
  - 124 ms de pedido.
- **N-24 en la base:** el evento CREADA quedó sin coordenadas, con `Sin ubicación del dispositivo: User denied Geolocation`. No pasa de 2 s, así que no hizo falta arreglo.

### CA-54 — V6 y vuelta atrás · OK

- **Instalación limpia y actualización:** cubiertas por la suite. `UpgradeFromSchema4Test` va de 4 a 5 y a 6 con datos.
- **v0.2.1 sobre el esquema 6:** detalle en `docs/evidencia-corte-3a/ca54-vuelta-atras.md`.
  - JAR web de `608d85b` (Git-Dirty false, sha256 `d15f65e6…`).
  - Corrió la matriz del 2B sin cambios: **256 OK, 0 FALLA, 6 observaciones**, sin NO_FACTURABLE y con una tarea NO_FACTURABLE cargada antes. Es lo mismo que la matriz final del 2B.
- **Sonda (D-220):** con v0.2.1, una tarea NO_FACTURABLE:
  - **la ven el técnico asignado y el cliente**: detalle 200 y aparece en la lista;
  - el filtro por ese estado da 400;
  - todo cambio, foto o firma da 400 y la tarea no cambia.
- **Hallazgo lateral:** compilado desde un `git worktree`, el manifiesto anotó el commit del repositorio principal en lugar del de la etiqueta. Por eso se compiló desde un clon. Está anotado en la evidencia.

### CA-55 — Todo junto · OK

- **Suite:** **89/89** en `5ab80f4`. El backend no cambió después.

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
  | UpgradeFromSchema4Test | 1 | OK |

  - Las carreras de cortes anteriores dieron 0 de 10 vueltas con falla: CA-02, CA-03 y CA-17.
  - La suite tardó 9 min 12 s, dentro del límite de 15 de D-168.
- **Matrices:**
  - la de API actual, que incluye las secciones del 2B: **310 OK, 0 FALLA**;
  - el recorrido de recuperación del 2B (`recuperacion-e2e.mjs`), con GreenMail y el backend de este corte: **54 OK, 0 FALLA**, igual que en el 2B (`recuperacion-e2e-corte3a.md`).
- **Interfaz en Node 24.22.1 sobre `9f7cdad`** (`-Accion Interfaz`):
  - build OK y las reescrituras de `/api` en el manifiesto;
  - lint OK, typecheck OK y `test:ui` OK (28 pruebas del modelo de tareas, más las anteriores);
  - `npm audit`: 0 avisos.

## Lo que el servidor tiene que saber

**Hay migración nueva: V6.**

- **Qué hace:**
  - reemplaza `task_status_check` por uno que admite `NO_FACTURABLE`;
  - agrega `closing_reason` a `sti.task` y a `sti.task_event`, cada una con su restricción.
- **No borra ni modifica datos:** las filas existentes cumplen las restricciones nuevas sin tocarlas.
- **Cómo se corre:** con el migrador de esta etiqueta, de la misma forma que en el pase anterior (`systemd-run` y `LoadCredential`, ver el informe del 2B, sección b).

**No hay variables ni credenciales nuevas.** La unidad `sti-backend.service` no cambia.

**El JAR crece, por PDFBox (D-218):**

- **El agregado:** PDFBox 3.0.5, Apache 2.0, y con ella fontbox, pdfbox-io y commons-logging.
- **El JAR web** pesa 32 967 670 bytes en `5ab80f4`. El de v0.2.1 pesaba 28 799 715.
- **Lo que suma cada JAR:** 4 657 071 bytes.
  - Las bibliotecas son 3 818 937.
  - Las dos tipografías Inter, el logo y la licencia OFL son 838 134.
- **El migrador y el bootstrap** suman lo mismo.

**Recursos nuevos dentro del JAR**, en `constancia/`:

| Archivo | sha256 |
|---|---|
| `Inter-Regular.ttf` | `40d692fce188e4471e2b3cba937be967878f631ad3ebbbdcd587687c7ebe0c82` |
| `Inter-Bold.ttf` | `288316099b1e0a47a4716d159098005eef7c0066921f34e3200393dbdb01947f` |
| `OFL.txt` | `262481e844521b326f5ecd053e59b98c8b2da78c8ee1bdbb6e8174305e54935a` |
| `logo-azul-transparente.svg` | `d6e1f9dd2367d8216c79f177122ebc45dd0c6fd103ec78fece31c9b881b420f6` |

- Inter es la v4.1, bajada de github.com/rsms/inter. El archivo `Inter-4.1.zip` tiene sha256 `9883fdd4a49d4fb66bd8177ba6625ef9a64aa45899767dde3d36aa425756b11e` (D-219).
- La constancia no llama a ningún servicio externo.

**Frontend:** hay archivos nuevos en `frontend/public/`:

- `favicon.ico`, `favicon.svg` y `apple-touch-icon.png`;
- `site.webmanifest` e `icono-sti.svg`;
- `marca/logo-azul-transparente.svg` y `marca/logo-plata-transparente.svg`.

Next los sirve en la raíz. Si el servidor web delante de Next limita rutas, tiene que dejar pasar `/favicon.ico`, `/favicon.svg`, `/apple-touch-icon.png`, `/site.webmanifest`, `/icono-sti.svg` y `/marca/*`. Las reescrituras de `/api` no cambian.

**Límite aceptado en D-220: la vuelta atrás con NO_FACTURABLE.**

- **El efecto:** si después de este pase hay que volver a v0.2.1 y ya existe alguna tarea `NO_FACTURABLE`, v0.2.1 se la muestra al técnico asignado y al cliente de la empresa.
- **Qué hace v0.2.1 con ella:**
  - el detalle responde 200 y la tarea aparece en la lista;
  - no la puede modificar (400);
  - el tablero de v0.2.1 no la pone en ninguna columna, y la lista muestra el código `NO_FACTURABLE` en crudo.
- **Lo que no cambia:** la vuelta atrás funciona. Pasa la matriz del 2B completa con el esquema 6, y el esquema 6 no se deshace.
- **Medida posible, que decide el PO:** si hay que volver atrás, contar antes las tareas en ese estado con `SELECT count(*) FROM sti.task WHERE status = 'NO_FACTURABLE'`.

**sha256 de los JAR:** se compilan en el servidor desde el commit de la etiqueta, así que no coinciden con los de esta PC. La compilación no es reproducible byte a byte (CA-54 lo midió con v0.2.1). El commit se lee del manifiesto (`Git-Commit`, `Git-Dirty`).

## Qué no ejecuté y por qué

- **CA-48:** el error de firma junto al botón, el 429 del servidor web y el texto de D-199 en la pantalla del técnico no los vi en el navegador. Ver CA-48.
- **Teléfono real y Safari en iOS:** no los usé. 390 y 844×390 son emulados, y el giro es un cambio de tamaño, no una rotación real. `<dialog>` existe en Safari desde la 15.4.
- **La interfaz de v0.2.1 frente a NO_FACTURABLE:** no la levanté. Lo que digo del tablero y de la lista sale de leer el código de `608d85b`.
- **El migrador de v0.2.1 contra el esquema 6:** no lo corrí. Su Flyway conoce hasta V5.
- **La suite después de `5ab80f4`:** no la volví a correr, porque el backend no cambió (ver Commits). Las pruebas de interfaz sí se corrieron sobre `9f7cdad`.
- **N-24:** lo medí con el permiso ya rechazado en el navegador (`denied`), en una sola vuelta. No medí el caso en que el usuario deja abierto el aviso de permiso sin contestar.
- **Roles distintos de ADMIN en el navegador:** en el navegador entré solo como ADMIN. Los demás roles se cubren por API (matriz) y por `test:ui`.

## Observaciones sin defecto asignado

- **El manifiesto en un worktree:** al compilar desde un `git worktree`, el manifiesto toma el commit del repositorio principal. La CA-42 del 2B dice "compilado en un worktree", pero ese dato del manifiesto no se usó entonces.
- **El código ya no usado:** `.sti-mark` y `WorkspaceMark` quedaron sin uso en el CSS al pasar a `BrandLogo` (D-215). No los borré para no ampliar el corte.

## Defectos propios

| ID | Severidad | Estado | Evento |
|---|---|---|---|
| DEV-06 | baja en lo ocurrido; media por la regla | cerrado: las revisiones de la interfaz se corren desde `frontend/` o en el contenedor | E-017 |
| DEV-07 | alta | cerrado en `a214de6` y `9f7cdad`, con verificación en el navegador | E-018 y E-019 |

## Preguntas al PO

1. **Fecha "Finalizada" de la constancia:** hoy es el último paso a FINALIZADO **que no venga de un cierre**. Así, "Volver a Finalizadas" desde Facturada o No facturable no cambia la fecha del trabajo, y una reapertura real (EN_PROCESO → FINALIZADO) sí la cambia. ¿Es lo que querés, o la fecha tiene que tomar también la vuelta desde un cierre?

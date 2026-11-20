| Sección | Regla | Rol | Esperado | Obtenido | Resultado |
|---|---|---|---|---|---|
| 0 Salud y autenticación | GET /api/health sin sesión | anónimo | 200 | 200 | OK |
| 0 Salud y autenticación | GET /api/auth/me sin sesión | anónimo | 401 | 401 | OK |
| 0 Salud y autenticación | GET /api/tasks sin sesión | anónimo | 401 | 401 | OK |
| 0 Salud y autenticación | Ruta fuera de /api — denyAll | anónimo | 401 | 401 | OK |
| 0 Salud y autenticación | Login con contraseña errónea | anónimo | 401 | 401 | OK |
| 0 Salud y autenticación | Login sin token CSRF | anónimo | 403 | 403 | OK |
| 0 Salud y autenticación | Login admin bootstrap — correo en mayúsculas | ADMIN | 204 | 204 | OK |
| 0 Salud y autenticación | GET /api/auth/me | ADMIN | ADMIN | ADMIN | OK |
| 0 Salud y autenticación | Admin existente sin cambio obligatorio — D-78, mismo criterio para el bootstrap | ADMIN | false | false | OK |
| 1 Datos falsos (carga) | Alta y primer ingreso con la contraseña inicial | SUPERVISOR | 204 204 | 204 204 | OK |
| 1 Datos falsos (carga) | Alta y primer ingreso con la contraseña inicial | USUARIO | 204 204 | 204 204 | OK |
| 1 Datos falsos (carga) | Alta y primer ingreso con la contraseña inicial | USUARIO | 204 204 | 204 204 | OK |
| 1 Datos falsos (carga) | Alta y primer ingreso con la contraseña inicial | CLIENTE | 204 204 | 204 204 | OK |
| 1 Datos falsos (carga) | Alta y primer ingreso con la contraseña inicial | CLIENTE | 204 204 | 204 204 | OK |
| 1 Datos falsos (carga) | Carga: 2 clientes, 3 proyectos, 5 cuentas | ADMIN | (observación) | creado | obs. |
| 1b Validaciones de alta | Alta con contraseña escrita por el ADMIN — D-23: la contraseña enviada se ignora | ADMIN | 201 | 201 | OK |
| 1b Validaciones de alta | La contraseña escrita por el ADMIN no abre la cuenta | anónimo | 401 | 401 | OK |
| 1b Validaciones de alta | Cuenta CLIENTE sin empresa | ADMIN | 400 | 400 | OK |
| 1b Validaciones de alta | Cuenta USUARIO con empresa | ADMIN | 400 | 400 | OK |
| 1b Validaciones de alta | Correo duplicado (distinto caso) | ADMIN | 409 | 409 | OK |
| 1b Validaciones de alta | Proyecto con empresa inexistente | ADMIN | 400 | 400 | OK |
| 1b Validaciones de alta | Cliente con nombre vacío | ADMIN | 400 | 400 | OK |
| 1b Validaciones de alta | Cliente con nombre repetido — se permite duplicar empresas con el mismo nombre | ADMIN | (observación) | 201 | obs. |
| 1b Validaciones de alta | Login por formulario | SUPERVISOR | 204 | 204 | OK |
| 1b Validaciones de alta | Login por formulario | USUARIO | 204 | 204 | OK |
| 1b Validaciones de alta | Login por formulario | USUARIO | 204 | 204 | OK |
| 1b Validaciones de alta | Login por formulario | CLIENTE | 204 | 204 | OK |
| 1b Validaciones de alta | Login por formulario | CLIENTE | 204 | 204 | OK |
| 1c Permisos de alta | SUPERVISOR crea cliente | SUPERVISOR | 403 | 403 | OK |
| 1c Permisos de alta | SUPERVISOR crea proyecto | SUPERVISOR | 403 | 403 | OK |
| 1c Permisos de alta | SUPERVISOR crea cuenta | SUPERVISOR | 403 | 403 | OK |
| 1c Permisos de alta | USUARIO lista operadores | USUARIO | 403 | 403 | OK |
| 1c Permisos de alta | CLIENTE lista operadores | CLIENTE | 403 | 403 | OK |
| 1c Permisos de alta | CLIENTE ve solo su empresa | CLIENTE | 1 | 1 | OK |
| 1c Permisos de alta | CLIENTE ve solo sus proyectos | CLIENTE | 2 | 2 | OK |
| 1c Permisos de alta | CLIENTE pide proyecto ajeno | CLIENTE | 404 | 404 | OK |
| 1c Permisos de alta | SUPERVISOR ve operadores (sin CLIENTE) — admin+sup+2 técnicos+x1 de 1b; ninguno CLIENTE. Hasta el corte 1 eran 4: x1 daba 400 y desde D-23 se crea | SUPERVISOR | 5 0 | 5 0 | OK |
| 2 Ciclo completo | SUPERVISOR crea tarea | SUPERVISOR | 201 | 201 | OK |
| 2 Ciclo completo | Estado inicial | SUPERVISOR | POR_HACER | POR_HACER | OK |
| 2 Ciclo completo | Código asignado | SUPERVISOR | (observación) | TAR-0001 | obs. |
| 2 Ciclo completo | Asignar técnico 1 | SUPERVISOR | 200 | 200 | OK |
| 2 Ciclo completo | Asignar técnico 2 | SUPERVISOR | 200 | 200 | OK |
| 2 Ciclo completo | Asignar dos veces al mismo (idempotente) | SUPERVISOR | 200 | 200 | OK |
| 2 Ciclo completo | Asignar a un CLIENTE | SUPERVISOR | 400 | 400 | OK |
| 2 Ciclo completo | USUARIO asigna | USUARIO | 403 | 403 | OK |
| 2 Ciclo completo | Técnico asignado ve la tarea | USUARIO | 200 | 200 | OK |
| 2 Ciclo completo | CLIENTE de la empresa ve la tarea | CLIENTE | 200 | 200 | OK |
| 2 Ciclo completo | CLIENTE de otra empresa | CLIENTE | 404 | 404 | OK |
| 2 Ciclo completo | Pedir FINALIZADO directo | ADMIN | 400 | 400 | OK |
| 2 Ciclo completo | Cambio de estado sin ubicación | USUARIO | 400 | 400 | OK |
| 2 Ciclo completo | Ubicación con coordenadas Y motivo | USUARIO | 400 | 400 | OK |
| 2 Ciclo completo | Latitud fuera de rango | USUARIO | 400 | 400 | OK |
| 2 Ciclo completo | CLIENTE inicia la tarea | CLIENTE | 403 | 403 | OK |
| 2 Ciclo completo | Técnico asignado inicia | USUARIO | EN_PROCESO | EN_PROCESO | OK |
| 2 Ciclo completo | Técnico vuelve a POR_HACER | USUARIO | 403 | 403 | OK |
| 2 Ciclo completo | Confirmar sin ubicación | USUARIO | 400 | 400 | OK |
| 2 Ciclo completo | SUPERVISOR no asignado confirma | SUPERVISOR | 403 | 403 | OK |
| 2b Fotos | Foto PNG 1 | USUARIO | 201 | 201 | OK |
| 2b Fotos | Foto PNG 2 | USUARIO | 201 | 201 | OK |
| 2b Fotos | Foto PNG 3 | USUARIO | 201 | 201 | OK |
| 2b Fotos | Foto PNG 4 | USUARIO | 201 | 201 | OK |
| 2b Fotos | Foto JPEG (bytes mágicos) del CLIENTE | CLIENTE | 201 | 201 | OK |
| 2b Fotos | 6.ª foto | USUARIO | 409 | 409 | OK |
| 2b Fotos | Texto con extensión .png | SUPERVISOR | 415 | 415 | OK |
| 2b Fotos | Archivo de 10,5 MB | SUPERVISOR | 413 | 413 | OK |
| 2b Fotos | Archivo de 12 MB (supera límite multipart) | SUPERVISOR | 413 | 413 | OK |
| 2b Fotos | Técnico no asignado sube foto — tarea invisible = 404 | USUARIO | 404 | 404 | OK |
| 2b Fotos | CLIENTE descarga foto | CLIENTE | 200 image/png | 200 image/png | OK |
| 2b Fotos | CLIENTE de otra empresa descarga foto | CLIENTE | 404 | 404 | OK |
| 2c Confirmaciones y cierre | Técnico 1 confirma → sigue EN_PROCESO — confirmed/pending | USUARIO | EN_PROCESO 1/1 | EN_PROCESO 1/1 | OK |
| 2c Confirmaciones y cierre | Técnico 1 confirma de nuevo (idempotente) | USUARIO | 200 | 200 | OK |
| 2c Confirmaciones y cierre | Técnico 2 confirma sin GPS → FINALIZADO | USUARIO | FINALIZADO | FINALIZADO | OK |
| 2c Confirmaciones y cierre | Foto en tarea FINALIZADO | USUARIO | 400 | 400 | OK |
| 2c Confirmaciones y cierre | Facturar sin firma | ADMIN | 400 | 400 | OK |
| 2c Confirmaciones y cierre | Firma con imagen que no es PNG | CLIENTE | 400 | 400 | OK |
| 2c Confirmaciones y cierre | Firma con fecha inválida | CLIENTE | 400 | 400 | OK |
| 2c Confirmaciones y cierre | CLIENTE de otra empresa firma | CLIENTE | 404 | 404 | OK |
| 2c Confirmaciones y cierre | CLIENTE firma en remoto | CLIENTE | 201 remote=true | 201 remote=true | OK |
| 2c Confirmaciones y cierre | Segunda firma | SUPERVISOR | 409 | 409 | OK |
| 2c Confirmaciones y cierre | Descargar firma vigente | USUARIO | 200 image/png | 200 image/png | OK |
| 2c Confirmaciones y cierre | SUPERVISOR factura | SUPERVISOR | 403 | 403 | OK |
| 2c Confirmaciones y cierre | ADMIN factura | ADMIN | FACTURADO | FACTURADO | OK |
| 2c Confirmaciones y cierre | FACTURADO es terminal (reabrir) | ADMIN | 400 | 400 | OK |
| 2c Confirmaciones y cierre | FACTURADO es terminal (anular) | ADMIN | 400 | 400 | OK |
| 2c Confirmaciones y cierre | Técnico ya no ve la facturada | USUARIO | 404 | 404 | OK |
| 2c Confirmaciones y cierre | CLIENTE ya no ve la facturada | CLIENTE | 404 | 404 | OK |
| 2c Confirmaciones y cierre | SUPERVISOR sí ve la facturada | SUPERVISOR | 200 | 200 | OK |
| 2c Confirmaciones y cierre | Bitácora: secuencia de eventos | ADMIN | (observación) | CREADA→POR_HACER, ASIGNADA, ASIGNADA, ESTADO→EN_PROCESO, CONFIRMACION, CONFIRMACION, ESTADO→FINALIZADO, FIRMA, ESTADO→FACTURADO | obs. |
| 2c Confirmaciones y cierre | Evento sin GPS guarda el motivo | ADMIN | Permiso de ubicación denegado (prueba) | Permiso de ubicación denegado (prueba) | OK |
| 2c Confirmaciones y cierre | Asignación no registra ubicación | ADMIN | null | null | OK |
| 3 Reapertura y firma reemplazada | Única confirmación → FINALIZADO | USUARIO | FINALIZADO | FINALIZADO | OK |
| 3 Reapertura y firma reemplazada | Firma presencial del técnico asignado | USUARIO | 201 remote=false | 201 remote=false | OK |
| 3 Reapertura y firma reemplazada | Técnico reabre | USUARIO | 403 | 403 | OK |
| 3 Reapertura y firma reemplazada | SUPERVISOR reabre → confirmaciones limpias y sin firma | SUPERVISOR | EN_PROCESO c=0 p=1 signed=false | EN_PROCESO c=0 p=1 signed=false | OK |
| 3 Reapertura y firma reemplazada | La firma anterior queda como evidencia | ADMIN | 1 current=false | 1 current=false | OK |
| 3 Reapertura y firma reemplazada | Sin firma vigente, GET firma | ADMIN | 404 | 404 | OK |
| 3 Reapertura y firma reemplazada | Firma histórica por id | ADMIN | 200 | 200 | OK |
| 3 Reapertura y firma reemplazada | Reconfirmar → FINALIZADO otra vez | USUARIO | FINALIZADO | FINALIZADO | OK |
| 3 Reapertura y firma reemplazada | Nueva firma tras reapertura | CLIENTE | 201 | 201 | OK |
| 3 Reapertura y firma reemplazada | Volver a POR_HACER desde FINALIZADO | ADMIN | POR_HACER signed=false | POR_HACER signed=false | OK |
| 4 Anulación | CLIENTE crea tarea en su proyecto | CLIENTE | 201 asignados=0 | 201 asignados=0 | OK |
| 4 Anulación | CLIENTE crea en proyecto ajeno | CLIENTE | 400 | 400 | OK |
| 4 Anulación | SUPERVISOR anula | SUPERVISOR | 403 | 403 | OK |
| 4 Anulación | ADMIN anula | ADMIN | ANULADA | ANULADA | OK |
| 4 Anulación | Lista normal oculta la anulada (ADMIN) | ADMIN | false | false | OK |
| 4 Anulación | ADMIN lista ?status=ANULADA | ADMIN | true | true | OK |
| 4 Anulación | SUPERVISOR lista ?status=ANULADA | SUPERVISOR | 403 | 403 | OK |
| 4 Anulación | CLIENTE ve su tarea anulada | CLIENTE | 404 | 404 | OK |
| 4 Anulación | Estado inexistente en filtro | ADMIN | 400 | 400 | OK |
| 5 Tarea creada por técnico | USUARIO crea y queda autoasignado | USUARIO | 201 asignado=Teresa Técnica | 201 asignado=Teresa Técnica | OK |
| 5 Tarea creada por técnico | Técnico 1 no ve la tarea de técnico 2 | USUARIO | 404 | 404 | OK |
| 5 Tarea creada por técnico | Técnico 1 en su lista no la ve | USUARIO | false | false | OK |
| 5 Tarea creada por técnico | Título de 201 caracteres | USUARIO | 400 | 400 | OK |
| 5 Tarea creada por técnico | Título vacío | USUARIO | 400 | 400 | OK |
| 6 Casos borde (posibles tareas trabadas) | ADMIN inicia una tarea sin asignados — D-26 regla 1; el 18/11 era una observación (200 EN_PROCESO) | ADMIN | 409 SIN_ASIGNADOS | 409 SIN_ASIGNADOS | OK |
| 6 Casos borde (posibles tareas trabadas) | La tarea sigue en POR_HACER | ADMIN | POR_HACER | POR_HACER | OK |
| 6 Casos borde (posibles tareas trabadas) | ADMIN confirma sin estar asignado | ADMIN | 403 | 403 | OK |
| 6 Casos borde (posibles tareas trabadas) | Desasignar al técnico pendiente (el otro ya confirmó) → FINALIZADO — D-26 regla 2; el 18/11 quedaba EN_PROCESO con todo confirmado (N-14) | SUPERVISOR | 200 FINALIZADO | 200 FINALIZADO | OK |
| 6 Casos borde (posibles tareas trabadas) | La bitácora dice quién la finalizó y a quién quitó | SUPERVISOR | supervisora@example.invalid|tecnico2@example.invalid | supervisora@example.invalid|tecnico2@example.invalid | OK |
| 6 Casos borde (posibles tareas trabadas) | El que queda ya no tiene nada que confirmar — la tarea ya no está EN_PROCESO | USUARIO | 400 | 400 | OK |
| 6 Casos borde (posibles tareas trabadas) | Desasignar al único técnico de una tarea EN_PROCESO — D-26 regla 3; el 18/11 era una observación | ADMIN | 409 ULTIMO_ASIGNADO | 409 ULTIMO_ASIGNADO | OK |
| 6 Casos borde (posibles tareas trabadas) | Nada cambió | ADMIN | EN_PROCESO|1 | EN_PROCESO|1 | OK |
| 7 Sesión | Logout | USUARIO | 204 | 204 | OK |
| 7 Sesión | Cookie vieja tras logout | USUARIO | 401 | 401 | OK |
| 7 Sesión | Sesión válida antes de expirar | USUARIO | 200 | 200 | OK |
| 7 Sesión | Sesiones borradas en la base para simular expiración | sistema | (observación) | 3 | obs. |
| 7 Sesión | Sesión expirada: GET /api/auth/me | USUARIO | 401 | 401 | OK |
| 7 Sesión | Sesión expirada: escritura con CSRF nuevo | USUARIO | 401 | 401 | OK |
| 7 Sesión | Las otras sesiones siguen vivas | USUARIO | 200 | 200 | OK |
| 7b Concurrencia (10 vueltas, sesiones independientes) | Dos técnicos confirman a la vez → FINALIZADO — trabadas (todo confirmado, EN_PROCESO): 0; doble evento FINALIZADO: 0 | USUARIO | 10/10 | 10/10 | OK |
| 7b Concurrencia (10 vueltas, sesiones independientes) | 4 subidas simultáneas sobre 4 fotos → máximo 5 — máximo visto en base: 5; códigos: {"201":10,"409":30} | varios | 0/10 con más de 5 | 0/10 con más de 5 | OK |
| 7b Concurrencia (10 vueltas, sesiones independientes) | Dos firmas simultáneas → una vigente, la otra 409 — tareas con ≠1 firma vigente: 0 | varios | {"201":10,"409":10} | {"201":10,"409":10} | OK |
| 8 Tablero para la UI | Estados del tablero sembrado | ADMIN | (observación) | POR_HACER: Relevar cobertura de cámaras en estacionamiento | POR_HACER: Pedido: punto de red extra en oficina técnica | EN_PROCESO: Cambiar amplificador del salón principal | EN_PROCESO: Peinado de rack piso 2 | FINALIZADO: Tendido de fibra entre obrador y portería | FINALIZADO: Prueba de sonido en habitaciones 101-110 | FACTURADO: Configurar NVR y grabación 30 días | POR_HACER: Montaje de soporte de TV en sala de reuniones | obs. |
| 9 Cuentas | GET /api/accounts | ADMIN | 200 | 200 | OK |
| 9 Cuentas | GET /api/accounts/{id} | ADMIN | 200 | 200 | OK |
| 9 Cuentas | POST /api/accounts | ADMIN | 201 | 201 | OK |
| 9 Cuentas | PUT /api/accounts/{id} | ADMIN | 200 | 200 | OK |
| 9 Cuentas | POST /api/accounts/{id}/password-reset | ADMIN | 200 | 200 | OK |
| 9 Cuentas | GET /api/operators?includeInactive=true — D-86 | ADMIN | 200 | 200 | OK |
| 9 Cuentas | GET /api/accounts | SUPERVISOR | 403 | 403 | OK |
| 9 Cuentas | GET /api/accounts/{id} | SUPERVISOR | 403 | 403 | OK |
| 9 Cuentas | POST /api/accounts | SUPERVISOR | 403 | 403 | OK |
| 9 Cuentas | PUT /api/accounts/{id} | SUPERVISOR | 403 | 403 | OK |
| 9 Cuentas | POST /api/accounts/{id}/password-reset | SUPERVISOR | 403 | 403 | OK |
| 9 Cuentas | GET /api/operators?includeInactive=true — D-86 | SUPERVISOR | 403 | 403 | OK |
| 9 Cuentas | GET /api/accounts | USUARIO | 403 | 403 | OK |
| 9 Cuentas | GET /api/accounts/{id} | USUARIO | 403 | 403 | OK |
| 9 Cuentas | POST /api/accounts | USUARIO | 403 | 403 | OK |
| 9 Cuentas | PUT /api/accounts/{id} | USUARIO | 403 | 403 | OK |
| 9 Cuentas | POST /api/accounts/{id}/password-reset | USUARIO | 403 | 403 | OK |
| 9 Cuentas | GET /api/operators?includeInactive=true — D-86 | USUARIO | 403 | 403 | OK |
| 9 Cuentas | GET /api/accounts | CLIENTE | 403 | 403 | OK |
| 9 Cuentas | GET /api/accounts/{id} | CLIENTE | 403 | 403 | OK |
| 9 Cuentas | POST /api/accounts | CLIENTE | 403 | 403 | OK |
| 9 Cuentas | PUT /api/accounts/{id} | CLIENTE | 403 | 403 | OK |
| 9 Cuentas | POST /api/accounts/{id}/password-reset | CLIENTE | 403 | 403 | OK |
| 9 Cuentas | GET /api/operators?includeInactive=true — D-86 | CLIENTE | 403 | 403 | OK |
| 9 Cuentas | GET /api/accounts | anónimo | 401 | 401 | OK |
| 9 Cuentas | GET /api/accounts/{id} | anónimo | 401 | 401 | OK |
| 9 Cuentas | POST /api/accounts | anónimo | 401 | 401 | OK |
| 9 Cuentas | PUT /api/accounts/{id} | anónimo | 401 | 401 | OK |
| 9 Cuentas | POST /api/accounts/{id}/password-reset | anónimo | 401 | 401 | OK |
| 9 Cuentas | GET /api/operators?includeInactive=true — D-86 | anónimo | 401 | 401 | OK |
| 9 Cuentas | POST /api/auth/password (ida y vuelta) | SUPERVISOR | 204 204 | 204 204 | OK |
| 9 Cuentas | POST /api/auth/password (ida y vuelta) | USUARIO | 204 204 | 204 204 | OK |
| 9 Cuentas | POST /api/auth/password (ida y vuelta) | CLIENTE | 204 204 | 204 204 | OK |
| 9 Cuentas | POST /api/auth/password | anónimo | 401 | 401 | OK |
| 9 Cuentas | Cambio con la contraseña actual equivocada | USUARIO | 400 CONTRASENA_ACTUAL | 400 CONTRASENA_ACTUAL | OK |
| 9 Cuentas | Cambio con 11 caracteres | USUARIO | 400 CONTRASENA_CORTA | 400 CONTRASENA_CORTA | OK |
| 9 Cuentas | Cambio a la misma contraseña | USUARIO | 400 CONTRASENA_IGUAL | 400 CONTRASENA_IGUAL | OK |
| 9 Cuentas | Respuesta del alta sin caché | ADMIN | true | true | OK |
| 9 Cuentas | Ingreso con la contraseña inicial | SUPERVISOR | 204 | 204 | OK |
| 9 Cuentas | Con contraseña inicial: GET /api/auth/csrf | SUPERVISOR | 200 | 200 | OK |
| 9 Cuentas | Con contraseña inicial: GET /api/auth/me | SUPERVISOR | true | true | OK |
| 9 Cuentas | Con contraseña inicial: GET /api/tasks | SUPERVISOR | 403 CAMBIO_DE_CONTRASENA | 403 CAMBIO_DE_CONTRASENA | OK |
| 9 Cuentas | Con contraseña inicial: GET /api/projects | SUPERVISOR | 403 CAMBIO_DE_CONTRASENA | 403 CAMBIO_DE_CONTRASENA | OK |
| 9 Cuentas | Con contraseña inicial: GET /api/clients | SUPERVISOR | 403 CAMBIO_DE_CONTRASENA | 403 CAMBIO_DE_CONTRASENA | OK |
| 9 Cuentas | Con contraseña inicial: GET /api/operators | SUPERVISOR | 403 CAMBIO_DE_CONTRASENA | 403 CAMBIO_DE_CONTRASENA | OK |
| 9 Cuentas | Con contraseña inicial: GET /api/accounts | SUPERVISOR | 403 CAMBIO_DE_CONTRASENA | 403 CAMBIO_DE_CONTRASENA | OK |
| 9 Cuentas | Con contraseña inicial: POST /api/tasks | SUPERVISOR | 403 CAMBIO_DE_CONTRASENA | 403 CAMBIO_DE_CONTRASENA | OK |
| 9 Cuentas | No se creó la tarea | sistema | 0 | 0 | OK |
| 9 Cuentas | Con contraseña inicial: logout | SUPERVISOR | 204 | 204 | OK |
| 9 Cuentas | Restablecer | ADMIN | 200 | 200 | OK |
| 9 Cuentas | Sesión abierta tras restablecer | USUARIO | 401 | 401 | OK |
| 9 Cuentas | Contraseña anterior tras restablecer | USUARIO | 401 | 401 | OK |
| 9 Cuentas | Desactivar | ADMIN | 200 | 200 | OK |
| 9 Cuentas | Sesión abierta de la persona desactivada | USUARIO | 401 | 401 | OK |
| 9 Cuentas | Ingreso de la persona desactivada | USUARIO | 401 | 401 | OK |
| 9 Cuentas | No se ofrece para asignar | SUPERVISOR | false | false | OK |
| 9 Cuentas | ADMIN la ve entre los inactivos | ADMIN | false | false | OK |
| 9 Cuentas | Reactivar | ADMIN | 200 | 200 | OK |
| 9 Cuentas | Ingreso tras reactivar | USUARIO | 204 | 204 | OK |
| 9 Cuentas | ADMIN cambia su propio rol | ADMIN | 409 PROPIO_ROL | 409 PROPIO_ROL | OK |
| 9 Cuentas | ADMIN se desactiva a sí mismo | ADMIN | 409 PROPIA_CUENTA | 409 PROPIA_CUENTA | OK |
| 9 Cuentas | ADMIN restablece su propia contraseña — D-83 | ADMIN | 409 PROPIA_CONTRASENA | 409 PROPIA_CONTRASENA | OK |
| 9 Cuentas | Pasar a CLIENTE con tareas abiertas | ADMIN | 409 TAREAS_ABIERTAS | 409 TAREAS_ABIERTAS | OK |
| 9 Cuentas | Correo en uso | ADMIN | 409 CORREO_EN_USO | 409 CORREO_EN_USO | OK |
| 9 Cuentas | Teléfono inválido | ADMIN | 400 TELEFONO | 400 TELEFONO | OK |
| 9 Cuentas | Bitácora sin contraseñas ni hashes | sistema | 0 | 0 | OK |
| 9 Cuentas | Bitácora de la cuenta objetivo (qué y quién) — los intentos de los otros roles no dejaron registro | sistema | ALTA:ADMIN,EDICION:ADMIN,RESTABLECIMIENTO:ADMIN,RESTABLECIMIENTO:ADMIN,CAMBIO_CONTRASENA:propia,RESTABLECIMIENTO:ADMIN,CAMBIO_CONTRASENA:propia,DESACTIVACION:ADMIN,ACTIVACION:ADMIN | ALTA:ADMIN,EDICION:ADMIN,RESTABLECIMIENTO:ADMIN,RESTABLECIMIENTO:ADMIN,CAMBIO_CONTRASENA:propia,RESTABLECIMIENTO:ADMIN,CAMBIO_CONTRASENA:propia,DESACTIVACION:ADMIN,ACTIVACION:ADMIN | OK |

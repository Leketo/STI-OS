| Sección | Regla | Esperado | Obtenido | Resultado |
|---|---|---|---|---|
| 1 Pedir, recibir y usar el enlace | Pedir el enlace — escrito en mayúsculas | 202 | 202 | OK |
| 1 Pedir, recibir y usar el enlace | Llega un correo al servidor falso (SMTPS) | 1 | 1 | OK |
| 1 Pedir, recibir y usar el enlace | Asunto | Recuperar tu contraseña de STI-OS | Recuperar tu contraseña de STI-OS | OK |
| 1 Pedir, recibir y usar el enlace | Remitente | STI-OS <notificaciones@stisistemas.com> | STI-OS <notificaciones@stisistemas.com> | OK |
| 1 Pedir, recibir y usar el enlace | El texto dice que vence a los 30 minutos y que sirve una vez | true | true | OK |
| 1 Pedir, recibir y usar el enlace | El enlace va a STI_PUBLIC_URL/nueva-contrasena | http://127.0.0.1:3000/nueva-contrasena | http://127.0.0.1:3000/nueva-contrasena | OK |
| 1 Pedir, recibir y usar el enlace | El token va después del # (no llega a ningún servidor en la URL) | true | true | OK |
| 1 Pedir, recibir y usar el enlace | Forma del token: 43 caracteres base64url (256 bits) | true | true | OK |
| 1 Pedir, recibir y usar el enlace | Fila de la cola | ENVIADO - | ENVIADO - | OK |
| 1 Pedir, recibir y usar el enlace | La base guarda solo el hash del token | 1 | 1 | OK |
| 1 Pedir, recibir y usar el enlace | El token en claro no está en ninguna tabla | 0 | 0 | OK |
| 1 Pedir, recibir y usar el enlace | Vence a los 30 minutos de enviado | true | true | OK |
| 1 Pedir, recibir y usar el enlace | Enlace vigente: check | 204 | 204 | OK |
| 1 Pedir, recibir y usar el enlace | Guardar la contraseña nueva | 204 | 204 | OK |
| 1 Pedir, recibir y usar el enlace | Ingresa con la nueva | 204 | 204 | OK |
| 1 Pedir, recibir y usar el enlace | La anterior ya no sirve | 401 | 401 | OK |
| 2 Enlaces que no sirven | Enlace usado: check | 400 ENLACE_INVALIDO | 400 ENLACE_INVALIDO | OK |
| 2 Enlaces que no sirven | Enlace usado: confirm | 400 ENLACE_INVALIDO | 400 ENLACE_INVALIDO | OK |
| 2 Enlaces que no sirven | Enlace alterado (último carácter) | 400 ENLACE_INVALIDO | 400 ENLACE_INVALIDO | OK |
| 2 Enlaces que no sirven | Enlace alterado (primer carácter) | 400 ENLACE_INVALIDO | 400 ENLACE_INVALIDO | OK |
| 2 Enlaces que no sirven | Enlace recortado | 400 ENLACE_INVALIDO | 400 ENLACE_INVALIDO | OK |
| 2 Enlaces que no sirven | Enlace alterado: confirm no cambia nada | 400 ENLACE_INVALIDO | 400 ENLACE_INVALIDO | OK |
| 2 Enlaces que no sirven | El original sigue vivo tras los intentos alterados | 204 | 204 | OK |
| 2 Enlaces que no sirven | Enlace vencido (expires_at movido 30 min atrás en el ensayo): confirm | 400 ENLACE_INVALIDO | 400 ENLACE_INVALIDO | OK |
| 2 Enlaces que no sirven | Mismo texto para usado, alterado y vencido | Este enlace ya no sirve. Pedí uno nuevo. | Este enlace ya no sirve. Pedí uno nuevo. | OK |
| 2 Enlaces que no sirven | Con el enlace vencido la contraseña no cambió | 204 | 204 | OK |
| 3 Un pedido nuevo anula el anterior | Llegan dos correos | 2 | 2 | OK |
| 3 Un pedido nuevo anula el anterior | El primer enlace ya no sirve | 400 ENLACE_INVALIDO | 400 ENLACE_INVALIDO | OK |
| 3 Un pedido nuevo anula el anterior | El segundo sí | 204 | 204 | OK |
| 3 Un pedido nuevo anula el anterior | El primero quedó revocado en la base | true | true | OK |
| 4 Tres pedidos por hora por correo | Los cuatro pedidos reciben la misma respuesta | 202 202 202 202 | 202 202 202 202 | OK |
| 4 Tres pedidos por hora por correo | Llegan 3 correos, no 4 (12 s después del cuarto) | 3 | 3 | OK |
| 4 Tres pedidos por hora por correo | El cuarto queda omitido por el límite | OMITIDO LIMITE_POR_CORREO | OMITIDO LIMITE_POR_CORREO | OK |
| 4 Tres pedidos por hora por correo | Sin cuenta: 4 filas nuevas, sin cuenta y sin texto (también la 4.ª: el límite no se anota sin cuenta) | 4 | 4 | OK |
| 4 Tres pedidos por hora por correo | Sin cuenta: ningún correo | 0 | 0 | OK |
| 5 Dominios reservados, cuenta inactiva y sin cuenta | Dominio example.invalid: fila omitida y ningún correo | OMITIDO DOMINIO_RESERVADO 0 | OMITIDO DOMINIO_RESERVADO 0 | OK |
| 5 Dominios reservados, cuenta inactiva y sin cuenta | Dominio example.com: fila omitida y ningún correo | OMITIDO DOMINIO_RESERVADO 0 | OMITIDO DOMINIO_RESERVADO 0 | OK |
| 5 Dominios reservados, cuenta inactiva y sin cuenta | Dominio sub.example.org: fila omitida y ningún correo | OMITIDO DOMINIO_RESERVADO 0 | OMITIDO DOMINIO_RESERVADO 0 | OK |
| 5 Dominios reservados, cuenta inactiva y sin cuenta | Dominio algo.test: fila omitida y ningún correo | OMITIDO DOMINIO_RESERVADO 0 | OMITIDO DOMINIO_RESERVADO 0 | OK |
| 5 Dominios reservados, cuenta inactiva y sin cuenta | Dominio algo.example: fila omitida y ningún correo | OMITIDO DOMINIO_RESERVADO 0 | OMITIDO DOMINIO_RESERVADO 0 | OK |
| 5 Dominios reservados, cuenta inactiva y sin cuenta | Cuenta inactiva: fila omitida y ningún correo | OMITIDO CUENTA_INACTIVA 0 | OMITIDO CUENTA_INACTIVA 0 | OK |
| 6 Host falso | Pedido con Host y X-Forwarded-Host falsos | 202 | 202 | OK |
| 6 Host falso | El enlace sigue apuntando a STI_PUBLIC_URL | http://127.0.0.1:3000/nueva-contrasena | http://127.0.0.1:3000/nueva-contrasena | OK |
| 7 Bloqueo y recuperación | 5 fallos seguidos: 4 dan 401 y el 5.º 429 | 401 401 401 401 429 | 401 401 401 401 429 | OK |
| 7 Bloqueo y recuperación | Con la contraseña correcta también se rechaza | 429 DEMASIADOS_INTENTOS | 429 DEMASIADOS_INTENTOS | OK |
| 7 Bloqueo y recuperación | Mismo estado y cuerpo exista o no la cuenta — Demasiados intentos. Esperá 15 minutos o usá ¿Olvidaste tu contraseña? | {"status":429,"code":"DEMASIADOS_INTENTOS","message":"Demasiados intentos. Esperá 15 minutos o usá ¿Olvidaste tu contraseña?"} | {"status":429,"code":"DEMASIADOS_INTENTOS","message":"Demasiados intentos. Esperá 15 minutos o usá ¿Olvidaste tu contraseña?"} | OK |
| 7 Bloqueo y recuperación | Pedir el enlace estando bloqueada | 202 | 202 | OK |
| 7 Bloqueo y recuperación | Guardar la nueva con el enlace del correo | 204 | 204 | OK |
| 7 Bloqueo y recuperación | El bloqueo se levantó: ingresa con la nueva | 204 | 204 | OK |
| 7 Bloqueo y recuperación | Bitácora: BLOQUEO_INGRESO y RECUPERACION_CORREO, con la propia cuenta como actor (D-158) | 1 1 0 | 1 1 0 | OK |
| 8 Registro sin enlaces | Ninguno de los 18 tokens enviados aparece en el log del backend | 0 | 0 | OK |
| 8 Registro sin enlaces | El log no contiene "nueva-contrasena#" | 0 | 0 | OK |
| 8 Registro sin enlaces | Los intentos guardan solo la clase del resultado | ENVIADO | ENVIADO | OK |
| 8 Registro sin enlaces | Ningún token en claro en la base | 0 | 0 | OK |

# STI-OS — definiciones funcionales vigentes

Actualizado: 24/10/2026. Este documento registra las decisiones expresas del cliente transmitidas en la conversación y las dudas pendientes. El relevamiento original sigue en [`APP Servicio STI 2026.txt`](../APP%20Servicio%20STI%202026.txt); las decisiones posteriores de este documento prevalecen cuando hay contradicciones.

## Producto y estructura

- STI-OS será una aplicación web utilizable en teléfono y escritorio, con interfaces adaptadas a cada tamaño de pantalla.
- Gestionará tareas de instalación y servicio que hoy STI registra manualmente: cámaras, cableado, montaje, sonido y otros trabajos.
- La jerarquía obligatoria es **cliente → proyecto → tarea**: toda tarea debe pertenecer a un proyecto, que debe existir antes de crearla. Para el cliente Sallustro, Hering y Casa Central son proyectos. Un proyecto también puede representar una obra u otro tipo de trabajo. La posible distinción futura entre proyecto y sucursal queda pendiente de análisis; no se modela una entidad sucursal por ahora.
- Solo ADMIN puede crear proyectos. USUARIO, SUPERVISOR y CLIENTE crean tareas únicamente en proyectos ya existentes.
- El flujo operativo principal tiene cuatro estados: `POR_HACER`, `EN_PROCESO`, `FINALIZADO`, `FACTURADO`. `ANULADA` es un quinto estado para bajas, visible en una pestaña separada de ADMIN.

## Roles y visibilidad

| Rol | Reglas confirmadas |
| --- | --- |
| ADMIN | Acceso a todo el sistema. Puede asignar, retroceder tareas y, tras la firma del cliente, marcar manualmente una tarea finalizada como facturada. Puede dar de baja una tarea y consultar las anuladas. Milton es el ejemplo de usuario ADMIN indicado por el cliente. |
| SUPERVISOR | Puede crear tareas, asignarse o asignar a otros usuarios, desasignar, reasignar, ver las asignaciones de todos y retroceder tareas. |
| USUARIO | Operador. Solo ve y trabaja sus tareas asignadas; no ve tareas ajenas ni `FACTURADO`. Puede crear tareas para cualquier cliente y proyecto y queda automáticamente asignado a las que crea. Puede avanzar por los estados permitidos, sin retroceder. |
| CLIENTE | Pertenece a una sola empresa. Ve todos los proyectos y todas las tareas de esa empresa, sin importar quién creó cada tarea. Puede crear tareas sin asignar y no puede mover estados ni asignar usuarios. No ve `FACTURADO` ni la pestaña administrativa de anuladas según la regla de visibilidad expresada. |

Una tarea puede tener varios usuarios asignados. Cada cuenta CLIENTE está vinculada a una sola empresa; una persona no trabajará para dos empresas bajo este rol.

## Creación y asignación

- **Todos los roles crean tareas únicamente en `POR_HACER`**, sin excepción.
- El USUARIO puede elegir cualquier cliente y proyecto; ADMIN revisa la viabilidad y puede anular la tarea, conservándola en el historial.
- SUPERVISOR puede crear y asignarse la tarea o asignarla a otros. CLIENTE crea sin asignar; después ADMIN o SUPERVISOR se encarga de asignarla.
- El número `TAR-1473` fue un ejemplo del cliente; el formato y la generación de identificadores no están definidos.
- Una tarea permite hasta **cinco fotos**. No se admiten videos ni otros tipos de archivo en el alcance actual.
- Por ahora el CLIENTE comunica fuera de la app que creó una tarea, por llamada o WhatsApp. La notificación automática queda para una etapa futura.
- Los datos mencionados en el relevamiento original para solicitar asistencia son empresa, fecha por defecto, solicitante, local/proyecto y detalle. Deben armonizarse con el nuevo modelo cliente → proyecto → tarea.

## Transiciones y confirmaciones

- `POR_HACER → EN_PROCESO → FINALIZADO` es el avance normal. USUARIO no puede retroceder.
- ADMIN y SUPERVISOR pueden hacer `EN_PROCESO → POR_HACER`, `FINALIZADO → EN_PROCESO` y `FINALIZADO → POR_HACER`.
- Si hay varios usuarios asignados, **todos deben confirmar** antes de finalizar. La interfaz muestra el avance `1 de 2`, `2 de 2`, `1 de 3`, etc. Con un solo asignado no se muestra contador y su confirmación finaliza la tarea.
- Al retroceder una tarea se reinicia el progreso de confirmaciones y todos deben confirmar nuevamente.
- Una tarea `FACTURADO` no puede volver a otro estado ni recibir trabajo adicional; cualquier trabajo posterior se registra en una tarea nueva.
- ADMIN puede marcar manualmente `FINALIZADO → FACTURADO` **solo si existe firma del cliente válida para esa finalización**.
- La anulación conserva la tarea en el historial; las tareas anuladas se consultan en una pestaña exclusiva de ADMIN.
- En cada paso del proceso se debe conservar un registro con el usuario que realizó la acción, fecha y hora, y ubicación GPS obtenida del dispositivo. Esto incluye los cambios de estado, las confirmaciones individuales de finalización y la firma del cliente. **El GPS es obligatorio desde la primera entrega**; el cliente indicó que se habilitarán los permisos correspondientes. En esta entrega, la ubicación es un dato de trazabilidad, sin validación automática de presencia en el sitio. Queda por definir el comportamiento excepcional cuando el dispositivo no pueda proporcionar coordenadas pese a los permisos previstos.

## Firma del cliente

- Se implementará un espacio en blanco para dibujar la firma con dedo o lápiz táctil, con nombre del firmante y fecha propuesta por defecto. La firma expresa conformidad con el trabajo finalizado y habilita la facturación manual de ADMIN.
- Firma presencial: el operador muestra la tarea en su teléfono u otro dispositivo; la persona que recibe el trabajo, por ejemplo el jefe de tienda, indica su nombre, dibuja la firma y acepta **sin iniciar sesión en ese dispositivo**.
- Firma a distancia: el CLIENTE entra con su cuenta desde su propio dispositivo y firma allí para validar el resultado. En ambos casos se registran el usuario de la sesión desde la que se presenta la firma, fecha y hora, y la ubicación GPS de ese dispositivo, además del nombre y el trazo del firmante.
- Si una empresa tiene varias cuentas CLIENTE, **cualquiera de ellas puede firmar** sus tareas. El cliente indicó que solo tendrán acceso a la aplicación quienes pueden solicitar y validar el servicio.
- Si una tarea firmada retrocede, debe solicitarse **una nueva firma** cuando vuelva a finalizarse. La conservación de firmas anteriores como evidencia debe definirse en el diseño del historial.

## Fases, horas y referencias

La fase 1 es el sistema web independiente de Libertya y de facturación electrónica. La integración con ERP y la facturación electrónica fueron concebidas inicialmente como dos etapas funcionales posteriores; la pieza comercial más reciente las presenta juntas como **fase 2**. Confirmar esa correspondencia al planificar el cronograma y las historias.

Las etapas **técnicas T1/T2/T3** del [plan de stack e infraestructura](stack-y-plan-tecnico.md) organizan piloto, protección adicional y operación/escala. Son una clasificación independiente de estas fases comerciales y no modifican sus horas ni importes. La prioridad actual es el piloto para hasta diez empresas clientes; los detalles funcionales menores se resolverán al desarrollar y probar cada entrega.

El cliente agregó una **segunda etapa funcional de control horario**: cuando un empleado se dirige directamente a una obra, podrá marcar entrada y salida desde la aplicación; cada marcación deberá guardar usuario, fecha, hora y coordenadas GPS del dispositivo. El objetivo declarado es controlar la presencia y las horas extra, con la posibilidad de agregar una observación que indique la obra o el cliente. Esta función **no desplaza el GPS obligatorio de la primera entrega**. Está pendiente decidir si entra en la fase comercial de 250 h o requiere una estimación adicional; esas horas no se modifican sin revisar el alcance. [Transcripción y fuente del audio](transcripciones/audio-cliente-2026-10-24-control-horario.md).

| Entrega comercial comunicada | Horas cerradas | Tarifa oferta | Importe |
| --- | ---: | ---: | ---: |
| Fase 1 — sistema independiente | 320 h | 40.000 Gs/h | 12.800.000 Gs |
| Fase 2 — ERP y factura electrónica, presentados juntos | 250 h | 40.000 Gs/h | 10.000.000 Gs |
| **Total** | **570 h** | | **22.800.000 Gs** |

La tarifa anterior presentada en la imagen fue 120.000 Gs/h, tachada. Las cifras antiguas de 260 h para el segundo bloque y 580 h de total fueron reemplazadas por la corrección expresa del usuario. No se suma previsión ni contingencia. Las funcionalidades de múltiples asignados y cinco fotos se definieron después del desglose inicial de 320 h; su distribución dentro de esas horas aún no se revisó.

| Trabajo incluido en el desglose de fase 1 | Horas |
| --- | ---: |
| Definición funcional | 16 |
| Diseño de pantallas | 20 |
| Base técnica | 16 |
| Usuarios y permisos | 40 |
| Clientes y locales | 24 |
| Solicitudes de asistencia | 16 |
| Gestión de órdenes | 24 |
| Servicios y materiales | 20 |
| Estados e historial | 24 |
| Firma en pantalla | 20 |
| Tableros | 24 |
| Pruebas y aceptación | 40 |
| Producción y capacitación | 36 |
| **Total fase 1** | **320** |

Imagen comercial vigente: [`sti-os-propuesta-horas-v2.png`](../output/imagegen/sti-os-propuesta-horas-v2.png). Imagen de tareas y horas: [`sti-os-fase-1-detalle-horas.png`](../output/imagegen/sti-os-fase-1-detalle-horas.png). Las versiones sin `v2` son históricas.

Resumen visual funcional al 24/10/2026: [`sti-os-mapa-funcional-2026-10-24.png`](../output/imagegen/sti-os-mapa-funcional-2026-10-24.png), con roles, jerarquía, estados y asignaciones. **La lámina es anterior a la respuesta del cliente:** su nota sobre firmantes pendientes ya quedó resuelta y aún no refleja el registro de ubicación GPS en cada paso.

## Tecnología e infraestructura: base acordada y estado

- La base técnica acordada se encuentra en [stack-y-plan-tecnico.md](stack-y-plan-tecnico.md): Next.js 16.x + TypeScript sobre Node.js 24 LTS; Java 21 LTS + Spring Boot 4.1.x; PostgreSQL 18; Nginx/HTTPS y servicios systemd sin root. Reemplaza la propuesta inicial Java 17/PostgreSQL 16. La [entrega del 25/10/2026](../server/entrega-vps-2026-10-25.md) reporta runtimes y base instalados con versiones exactas; la compatibilidad de Next.js/Spring Boot y sus dependencias se comprobará en el primer build. El [checklist](../server/checklist-instalacion-fase-1.md) distingue A reportado listo de B público pendiente.
- Se mantiene el dominio nuevo. El destino de referencia para el piloto es el VPS OVH documentado en [`server/ovh-vps-development.md`](../server/ovh-vps-development.md). La entrega del 25/10 reporta Ubuntu 26.04.1, 4 CPU, 7,6 GiB de RAM, 68 GiB libres en raíz, SSH por claves, solo TCP/22 público según comprobaciones locales y PostgreSQL en loopback. Son resultados transmitidos por el usuario del agente VPS, **no una nueva comprobación en vivo**; no se publicó la aplicación ni se realizó prueba externa independiente.
- El alojamiento junto a SIFEN y su informe del 14/10/2026 quedan como antecedente histórico, no como inventario actual del VPS. La base de datos y los puertos internos serán privados desde T1; VPN/Zero Trust y Cloudflare se evalúan en T2. Antes de datos reales se comprobarán permisos, HTTPS y recuperación consistente de PostgreSQL y archivos privados. La recuperación de un archivo desde un respaldo OVH ya ensayada no acredita recuperación completa ni de la base.
- El archivo original menciona `ad_user`, `ad_role`, `c_bpartner`, `C_order`, `C_order_line` y códigos SV001–SV015 para la futura integración. Su esquema y operaciones reales no han sido inspeccionados. Completar un documento ERP no debe suponerse equivalente a escribir directamente `CO`.
- El desarrollo se propone por entregas completas de interfaz, API y base de datos, con contrato OpenAPI y comprobaciones en CI; despliegues versionados al VPS y revisión de la evidencia del agente remoto. El plan técnico registra para después balanceo, métricas, alertas y lecciones del IDP de Cocha, sin incorporarlos automáticamente al presupuesto comercial.

## Dudas pendientes para las próximas historias

1. Qué hacer excepcionalmente si, pese a los permisos previstos y al requisito de GPS obligatorio, el dispositivo no obtiene coordenadas: impedir el paso o habilitar alguna alternativa controlada.
2. Si la captura de ubicación también aplica a la creación de la tarea, asignaciones, reasignaciones y anulación, además de los cambios de estado, confirmaciones individuales y firma ya definidos.
3. Cómo se selecciona el proyecto existente al crear una tarea cuando la empresa tiene varios proyectos.
4. Reglas de edición, anulación, reasignación y cambios de integrantes una vez que haya confirmaciones parciales o una firma.
5. Tamaño, formatos admitidos y tratamiento de las cinco fotos.
6. Visibilidad de una tarea anulada para quien la creó y necesidad de registrar motivo.
7. Origen, administración y jerarquía de clientes y proyectos; campos obligatorios del formulario de tarea.
8. Identificadores de tarea, catálogo de servicios y materiales, controles de concurrencia, y representación de historial y firmas anteriores.
9. Si el control horario con entrada/salida y GPS de la segunda etapa funcional se incluye en la fase comercial de 250 h o se presupuestará por separado; reglas de horas extra, vinculación obligatoria con cliente/proyecto y tratamiento de marcaciones fuera del lugar quedan por definir.
10. Para el cronograma: fecha de inicio, equipo y disponibilidad real, calendario de validaciones del cliente, dependencias de infraestructura y criterio de aceptación por entrega.

Las historias de usuario y el cronograma se redactarán después de cerrar las reglas que afecten a cada uno; este documento no los da por completados.

# STI-OS: rediseño del frontend autenticado

## Contexto y objetivos

La pantalla `/app` organiza el trabajo real con un Kanban y conserva los contratos del backend actual. La referencia Adobe Podcast aporta superficies neutras, botones redondeados y acentos pastel; la estructura operativa sigue el flujo Cliente → Proyecto → Tareas. La demo pública permanece separada.

Alcance: interfaz, navegación, presentación y operaciones existentes. Sin cambios de backend, migraciones, autenticación, permisos ni despliegue de producción.

## Tokens y fundamentos

`frontend/src/app/app/workspace.css` define tokens semánticos para fondo, superficie, columna, texto principal y secundario, bordes, controles, foco, acción principal y estados. Los bloques día y noche se prueban por separado. Se conserva Inter, ya utilizada por el proyecto.

El selector Día / Noche / Sistema must conservar la preferencia en el navegador. Sistema must seguir los cambios del sistema operativo. Una inicialización anterior a la hidratación aplica el tema guardado. Si el almacenamiento falla, la selección must seguir funcionando durante la visita.

Los acentos violeta, verde, rosa y ámbar should ayudar a reconocer estados. El estado must conservar su etiqueta textual en ambos temas.

## Componentes y comportamiento

- **Navegación:** Tareas, Clientes y Proyectos. Usuarios solo para ADMIN. En móvil, menú con cierre, Escape, foco contenido y fondo inerte.
- **Kanban:** tarjetas compactas con identificador, título, proyecto, cliente, responsables, fotos y confirmaciones. Asas de arrastre para mouse, teclado y tacto mediante la dependencia existente. No se inventa persistencia para el orden dentro de una columna.
- **Cambios de estado:** la interfaz must permitir solo acciones disponibles para ese rol. Finalizar must utilizar la confirmación personal; nunca escribir directamente `FINALIZADO`. Facturar must requerir ADMIN y firma vigente. Reabrir must explicar el reinicio de confirmaciones y firma.
- **Móvil:** una columna seleccionable por estado y alternativa Lista. Los formularios usan campos de 16 px para evitar zoom inesperado. Las tarjetas admiten títulos largos y el detalle conserva saltos de línea.
- **Detalle:** panel lateral nativo modal con responsables, acciones, fotos, firmas e historial traducido a lenguaje natural. Modal de confirmación para anular o reabrir. Escape y restauración de foco; cierre bloqueado mientras se guarda.
- **Creación:** formulario en panel; cliente filtra proyectos, y abrir desde un proyecto precarga ese contexto. Se conserva el borrador al cerrar y volver a abrir mientras el tablero sigue montado.
- **Clientes y proyectos:** catálogos con búsqueda, recuentos dentro del alcance de la cuenta y accesos a las tareas. Crear proyecto desde un cliente precarga ese cliente.
- **Usuarios:** alta de cuentas con los roles actuales. El listado muestra el equipo operativo disponible en `/api/operators`; no se presenta como listado exhaustivo de cuentas de clientes, porque no existe ese endpoint.
- **Red:** una sola escritura simultánea; el bloqueo empieza antes de GPS y CSRF. Los rechazos muestran el error en el panel. Un resultado de red desconocido exige actualizar antes de repetir una escritura. Un guardado confirmado no se presenta como fallido solo porque falle la recarga posterior.

## Accesibilidad y aceptación

- Texto normal must alcanzar 4.5:1 con su fondo, incluidos textos secundarios y etiquetas pastel.
- Bordes necesarios para identificar controles y anillos de foco must alcanzar 3:1 con las superficies relevantes.
- Foco visible must permanecer perceptible en ambos temas. Controles y campos must tener nombres accesibles.
- El usuario must poder operar cambios de estado por botones aunque no utilice arrastre.
- Los paneles must contener el foco y permitir Escape cuando no haya una escritura pendiente.
- Carga, éxito y errores must anunciarse mediante `status` o `alert`.
- Movimiento reducido must desactivar transiciones y animaciones prescindibles.

Estas comprobaciones de contraste no equivalen a una certificación completa WCAG. Quedan pendientes pruebas táctiles reales y lector de pantalla.

## Contenido y tono

Etiquetas directas: «Nueva tarea», «Agregar responsable», «Confirmar mi parte», «Firmar conformidad». El historial muestra «Cambió a en proceso» en lugar de códigos internos. Los errores must describir el resultado conocido y conservar lo escrito cuando corresponda.

## Anti-patrones

No mezclar datos de la demo con `/app`. No añadir prioridades, vencimientos o endpoints inexistentes. No conceder permisos desde el cliente. No dar por guardado un cambio antes de la respuesta. No trasladar ilustraciones de marketing ni tamaños de títulos promocionales al tablero operativo.

## Validación y revisión

- `npm run lint`
- `npm run typecheck`
- `npm run test:ui`: restricciones de transición por rol y contraste de ambos temas.
- `npm run build`: bundle standalone del frontend.
- Revisión en navegador con el servidor de prueba aislado descrito en el README. Este servidor no sustituye al backend ni valida su integración real.

Antes de integrar a producción: revisar ambos temas, recorridos con los roles reales, fotos y firma, red lenta/rechazos, móvil táctil, retorno de foco y la conexión contra el backend en un entorno de pruebas.

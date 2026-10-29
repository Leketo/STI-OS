# Revisión del rediseño: Kanban y temas día/noche

Revisión de `feat/frontend-kanban-dia-noche` contra el backend real, no contra el doble de API.
Complementa [el rediseño](frontend-redesign.md): aquel declara la intención, este registra lo que
se midió sobre la interfaz renderizada.

## Cómo se midió

Entorno local completo: PostgreSQL en `127.0.0.1:55432`, backend en `127.0.0.1:8081` con el JAR ya
compilado, y el frontend servido desde su bundle de producción con `STI_API_ORIGIN` apuntando a ese
backend. Datos reales de la base de desarrollo: 5 tareas, 2 clientes, 2 proyectos, 1 operario.
Sin cambios en el backend.

El recorrido se condujo con Chrome mediante Playwright, sesión iniciada por el formulario real.
Las mediciones de contraste se calculan sobre el DOM renderizado, componiendo el fondo efectivo a
través de los ancestros: es una comprobación distinta de la de `npm run test:ui`, que valida los
tokens del CSS.

Las comprobaciones de la rama pasan: `lint`, `typecheck`, `test:ui` (8/8) y `build`.

## Lo que se verificó y cumple

- **Contraste sobre DOM renderizado.** 92 textos en el tablero y 32 dentro del panel de detalle,
  por tema. Ninguno por debajo del mínimo. El par más ajustado da 5.19:1 en día y 7.58:1 en noche,
  contra un piso exigido de 4.5:1.
- **Foco visible en los 27 puntos de tabulación**, en ambos temas. El buscador resuelve su anillo
  en el contenedor mediante `.sti-search:focus-within`, no en el `input`.
- **Nombres accesibles.** Ningún control interactivo quedó sin nombre.
- **Operación por teclado.** Las tarjetas se alcanzan con Tab y se abren con Enter; las asas de
  arrastre son elementos separados y anunciados («Mover TAR-0003»), de modo que el tablero se
  opera sin arrastrar.
- **Diálogo nativo.** El foco queda contenido dentro del panel, y Escape no cierra mientras hay
  una escritura en curso.
- **Movimiento reducido.** Con la preferencia activa no queda ningún elemento animando.
- **Campos de formulario a 16 px**, con 46–48 px de alto, en el panel «Nueva tarea».
- Historial traducido a lenguaje natural, texto alternativo en las fotos, enlace de salto al
  contenido, y ningún desborde horizontal a 375 px.

## Hallazgos

### 1. El servidor de desarrollo no hidrata

Con `npm run dev`, React no engancha: el envío del formulario de login cae en el camino nativo del
navegador, la URL queda en `/login?` y no se emite ninguna llamada a `/api/`. Como los campos no
tienen atributo `name`, no viaja nada y la página recarga en silencio, sin mensaje de error. Con el
bundle de producción el mismo recorrido responde 204 y carga los datos.

Todos los chunks se descargan en ambos casos. El `build` usa `--webpack` mientras que `next dev`
emplea Turbopack, lo que señala hacia ahí. Importa porque `npm run dev` es la forma de trabajo que
documenta el README.

### 2. El panel no devuelve el foco a la tarjeta que lo abrió

Reproducible por los dos caminos de cierre, Escape y el botón «Cerrar panel»: el foco queda en
`body` y obliga a tabular desde el principio del documento.

La causa es precisa: el botón disparador sigue en el documento y es el mismo nodo, pero el
`<dialog>` se retira del DOM al desmontarse y el `close()` de la limpieza corre sobre un nodo ya
desconectado, con lo cual la restauración nativa nunca ocurre. Conviene capturar el elemento
enfocado al abrir y devolverle el foco explícitamente.

Contradice el criterio de aceptación del propio rediseño: «Escape y restauración de foco».

### 3. En móvil el tablero abre en la única columna vacía

El selector de estado arranca en «Por hacer (0)» y el resto de las columnas queda en
`display: none`. La pantalla muestra «5 resultados» arriba y «Nada por aquí todavía» abajo. Quien
abre la aplicación en el teléfono con el trabajo ya empezado ve un tablero vacío.

### 4. La escala tipográfica favorece el título por sobre la herramienta

Solo el encabezado escala: `clamp(24px, 2.2vw, 32px)` con peso 800. Lo operativo está fijo y es
pequeño: título de tarjeta 14 px, cuerpo 12 px, navegación 12 px, etiqueta del botón primario
11 px, «Cerrar sesión» 10 px. Cincuenta elementos renderizan a 11 px.

Es el anti-patrón que enuncia el rediseño: no trasladar tamaños de títulos promocionales al tablero
operativo. Pesa más en escritorio que en móvil, donde el mismo tamaño ocupa proporcionalmente más
pantalla.

### 5. Relleno que promete lo que no existe

`task-board.tsx:437` muestra «Abrí la tarea para ver sus detalles.» cuando la tarea no tiene
descripción, en 4 de las 5 tarjetas. Al abrirla, el panel (`task-board.tsx:1058`) responde «Esta
tarea todavía no tiene una descripción». Son dos líneas del espacio más valioso de la tarjeta
dedicadas a derivar a un lugar vacío.

### 6. Los filtros de la barra no respetan el piso de 16 px

Buscador a 12 px y selectores a 11–12 px. El piso de 16 px se cumple en los formularios, como
afirma el rediseño, pero no en la barra del tablero, donde iOS igual provocará zoom.

### 7. La tarjeta no distingue proyecto de cliente

Presenta «Casa Central» con punto de color y «Cliente de prueba tablero» debajo, sin etiquetas. El
panel sí lo resuelve («Cliente de prueba tablero → Casa Central») y la vista Lista rotula la
columna «Proyecto». Queda ambiguo solo en la superficie más usada. La vista Lista, a su vez, pierde
la columna Cliente aunque el filtro la ofrezca.

### 8. Tres contadores distintos conviven en pantalla

El distintivo de navegación dice «1», la cabecera «5 tareas en tu alcance» y la barra «5
resultados». El distintivo cuenta `POR_HACER` más `EN_PROCESO` (`workspace.tsx:189`), pero nada en
la interfaz lo explica.

### 9. Objetivos táctiles por debajo de lo recomendado

En móvil, 11 de los 14 controles visibles quedan bajo 44×44. Los más ajustados son «Nueva tarea en
Por hacer», de 30×30, y «Ver demo pública», con 17 px de alto.

## Qué no cubre esta revisión

Arrastrar y soltar con mouse o tacto reales, lector de pantalla, red lenta y rechazos del backend,
y la carga de fotos y firma con archivos reales. Tampoco se recorrieron las vistas de Clientes,
Proyectos ni Usuarios.

Las fotos que aparecen en el panel durante esta revisión son imágenes de prueba de 1×1 píxel de una
sesión anterior; se verificó que no son imágenes rotas, pero no permiten juzgar el recorte ni la
proporción con fotografías reales.

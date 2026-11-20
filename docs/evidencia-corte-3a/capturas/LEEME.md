# Capturas del corte 3A (CA-49)

- **Cuándo y dónde:** 2026-11-20, en el ensayo:
  - backend y frontend de `feat/cerrar-circulo` con el arreglo de DEV-07;
  - interfaz compilada en el contenedor con Node 24.22.1;
  - datos falsos cargados por la matriz.
- **Navegador:** Chrome en la PC del dueño.
- **Escritorio:** la ventana tal cual.
- **390 de ancho:** emulado con un iframe de 410 px dentro de la misma página. Windows le resta 20 px a la barra de desplazamiento, así que quedan 390 útiles. **No se usó un teléfono real.**
- **844×390, teléfono girado:** el mismo iframe a 844×390. La pantalla de firma bloquea el desplazamiento, así que no hay barra y los 844 son útiles. El giro se emuló cambiando el tamaño del iframe con la firma abierta.
- **Lo que no se ve:** ninguna contraseña ni ningún enlace entero. Se ingresó con una llamada a la API desde la consola, sin escribir la contraseña en ningún campo.

| # | Qué muestra |
|---|---|
| 01, 02 | Ingreso con el logo, de día y de noche (R-24) |
| 03, 04 | Tablero en escritorio con la columna "Cerradas" y el chip "No facturable · Garantía", de día y de noche |
| 05 | Panel de una tarea finalizada: "Descargar constancia (PDF)", "No facturable" y, en el historial, "Volvió a Finalizadas" |
| 06 | Diálogo de motivo: "Confirmar" queda inactivo hasta elegir uno |
| 07 | Después de confirmar: "No facturable · Uso interno", "Volver a Finalizadas" y la línea en el historial |
| 08 | Una no facturable en escritorio, de noche |
| 09, 10 | Tablero a 390, de día y de noche |
| 11, 12 | Menú a 390 con el logo, de día y de noche |
| 13 | Panel de firma a 390: la fecha y "Tocá para firmar" |
| 14 | DEV-07, antes del arreglo: se tocó "Tocá para firmar" y la pantalla no aparece (E-018) |
| 15, 16 | Firma a pantalla completa a 390, vacía y con el trazo y la aclaración |
| 17, 18 | La misma firma girada a 844×390, de día y de noche: se conservan el trazo y la aclaración |
| 19 | De vuelta a 390, de noche: el trazo sigue |
| 20, 21 | La firma lista en el panel y, después de "Firmar", registrada con "Ubicación no disponible" |
| 22 | Filtro "No facturable": 7 de 69 tareas, las mismas 7 que hay en la base |
| 23 | "Marcar facturada" con la firma vigente: "Facturada · Firmada" |
| 24, 25 | "Volver a Finalizadas" desde Facturada: el diálogo y el resultado. En la base se conservan la firma vigente y la confirmación |

**De noche el área de firma sigue blanca, a propósito:** la imagen se guarda con trazo oscuro sobre blanco y así se ve igual que en la constancia.
| 26 | Aviso "Llegaste al máximo de 5 fotos." con 5/5, tras subir cinco PNG falsos |

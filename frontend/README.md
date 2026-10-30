# STI-OS frontend

El frontend tiene dos superficies independientes:

- **`/app`**: aplicación autenticada. Kanban real, tareas, asignaciones, confirmaciones, fotos, firma y administración mediante las operaciones existentes del backend.
- **`/demo` y `/projects/...`**: demostración pública de solo lectura con datos ficticios. No es una fuente de datos para `/app`.

La aplicación autenticada incluye navegación por Tareas, Clientes, Proyectos y Usuarios (ADMIN), vistas Tablero/Lista, filtros, paneles de creación y detalle, y temas Día/Noche/Sistema guardados en el navegador. El backend sigue autorizando cada operación. Las limitaciones y reglas de transición se documentan en [el rediseño](../docs/frontend-redesign.md).

## Desarrollo con el backend existente

Node.js 24:

```sh
npm ci
STI_API_ORIGIN=http://127.0.0.1:8080 npm run dev
```

`STI_API_ORIGIN` must apuntar al listener HTTP local del backend. No apuntar a un backend de producción para probar escrituras. Los endpoints conservan CSRF, sesión same-origin y los datos de ubicación ya previstos por la aplicación.

## Comprobaciones

```sh
npm run lint
npm run typecheck
npm run test:ui
npm run build
```

El build usa Webpack y prepara el bundle standalone con sus archivos estáticos. Los tests de contraste revisan los tokens de ambos temas; no reemplazan una auditoría de accesibilidad del DOM renderizado.

## Revisión visual sin datos reales

`node scripts/ui-fixture-server.mjs` inicia un **doble de API de desarrollo**, exclusivamente en `127.0.0.1:4187`, con datos ficticios en memoria. Se usa únicamente para revisar el frontend. No tiene base de datos, no utiliza credenciales de producción y no debe desplegarse como backend.

En otra terminal:

```sh
STI_API_ORIGIN=http://127.0.0.1:4187 npm run dev
```

En ese frontend local, abrir `/api/auth/csrf` inicia la sesión ficticia del doble; luego abrir `/app`. Las creaciones y cambios se pierden al detener el doble. `/api/tasks?fixtureFail=1` prepara un rechazo de la siguiente escritura, exclusivamente en ese proceso ficticio, para revisar los errores y la vuelta de una tarjeta a su estado anterior.

La revisión con este doble no demuestra una integración end-to-end con el backend real. Fotos y firma deben verificarse también con el backend en un entorno de pruebas.

## Atribución

Componentes de la demo y el tema Vercel se adaptaron de [Kiranism/next-shadcn-dashboard-starter](https://github.com/Kiranism/next-shadcn-dashboard-starter), commit `9084ffd954d24591d9b1d279c4b18e119b02b34e`. Licencia MIT en [LICENSE](LICENSE).

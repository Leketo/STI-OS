# Adopción del starter para STI-OS

**Decisión (25/10/2026):** usar [Kiranism/next-shadcn-dashboard-starter](https://github.com/Kiranism/next-shadcn-dashboard-starter) como punto de partida del frontend de STI-OS, seleccionando las piezas que aporten valor. El repositorio publica una [licencia MIT](https://github.com/Kiranism/next-shadcn-dashboard-starter/blob/main/LICENSE); se conservará su aviso de copyright y licencia en el código incorporado.

## Qué se incorpora

| Pieza | Uso previsto en STI-OS |
| --- | --- |
| Next.js 16, TypeScript y diseño adaptable | Base de la aplicación web para teléfono y escritorio |
| Layout, navegación y componentes visuales | Interfaz de cada rol, ajustada a las pantallas necesarias |
| Tablero Kanban | Presentación de tareas; cada transición se validará en Spring Boot |
| Tablas y formularios | Clientes, proyectos, tareas y administración, según permisos |

La selección exacta de archivos se hará después de revisar el código del starter. No se incorpora la aplicación de ejemplo completa por defecto.

## Límites de integración

- Spring Boot conserva la autenticación, las sesiones y la autoridad sobre roles, empresas, proyectos, tareas y transiciones. La visibilidad de menús del starter no sustituye la autorización de la API.
- PostgreSQL solo es accesible desde el backend. El frontend consumirá `/api` bajo el mismo origen HTTPS.
- Clerk, Clerk Organizations y Clerk Billing no forman parte del diseño aprobado. Sus pantallas y dependencias se retirarán o reemplazarán al adaptar la base. Sentry y otras integraciones externas quedan para una decisión posterior.
- Los datos de demostración del tablero no representan las reglas de STI-OS. El modelo y la lógica funcional siguen en [definiciones-funcionales.md](definiciones-funcionales.md).
- Esta elección no cambia automáticamente el presupuesto de 320 horas de la fase 1. El ahorro real solo podrá estimarse después de importar, compilar y adaptar un primer flujo vertical.

## Primer corte verificable

1. Incorporar en `frontend/` una versión identificada del starter y conservar la licencia.
2. Retirar las integraciones de ejemplo que impidan un arranque local sin cuentas externas ni secretos.
3. Ejecutar instalación, comprobación de tipos, lint y build; registrar versiones y resultados reales.
4. Presentar con datos sintéticos una navegación móvil/escritorio y un tablero inicial con `POR_HACER`, `EN_PROCESO`, `FINALIZADO` y la vista administrativa de `FACTURADO`/`ANULADA`.
5. Conectar después el primer flujo a la API Spring Boot; ninguna acción de UI se considerará autorizada hasta que el backend la valide.

La publicación en `app.stisistemas.com` se hará solo después de completar las comprobaciones del [checklist de habilitación B](../server/checklist-instalacion-fase-1.md).

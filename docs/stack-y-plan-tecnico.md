# STI-OS — stack acordado y evolución técnica

Actualizado: 26/10/2026. Prioridad acordada: desarrollar un piloto web para un máximo de **10 empresas clientes**, aprovechando el VPS preparado. Esa cifra no equivale a diez usuarios ni demuestra capacidad concurrente. Los detalles funcionales pendientes se resolverán al construir y probar cada flujo.

**Base de trabajo acordada para el aprovisionamiento:** una aplicación con frontend Next.js, backend Spring Boot y PostgreSQL en un VPS, con acceso web HTTPS y base de datos privada desde la primera entrega. El usuario pidió conservar este plan y preparar su ejecución por el agente del servidor. Esto confirma la dirección de trabajo; no acredita instalación, compatibilidad de parches ni decisiones opcionales de interfaz/CI aún propuestas.

## 1. Tres etapas técnicas, separadas del presupuesto

| Etapa técnica | Objetivo | Prioridad |
| --- | --- | --- |
| T1 — piloto | Base de datos, backend, frontend, controles básicos de seguridad y despliegue recuperable | Desarrollar ahora |
| T2 — protección y administración | Evaluar acceso privado de administración, Cloudflare y controles avanzados | Registrar para después |
| T3 — operación y escala | Métricas, alertas, seguridad continua y balanceo si existe necesidad comprobada | Registrar para después |

Estas etapas **no reemplazan las fases comerciales** de 320 h y 250 h ni asignan nuevas horas. El ERP, la factura electrónica y el control horario conservan su alcance y pendientes en las [definiciones funcionales](definiciones-funcionales.md). No se presupone que toda la evolución técnica esté incluida en las 250 h.

## 2. Punto de partida: VPS actual

El antecedente de aprovisionamiento A es la [entrega del VPS del 25/10/2026](../server/entrega-vps-2026-10-25.md), transmitida por el usuario y enlazada desde el [registro operativo OVH](../server/ovh-vps-development.md). El informe remoto protegido con evidencia detallada no fue inspeccionado aquí. El informe SIFEN del 14/10 es histórico y no describe este destino.

- El agente reporta Ubuntu 26.04.1 x86_64, 4 CPU, 7,6 GiB de RAM y 68 GiB libres en raíz. Instaló Java 21.0.12.1, Node.js 24.22.1 LTS, npm 11.19.1, PostgreSQL 18.6 y Nginx 1.28.3. Esas versiones corresponden al reporte A. La demo Next.js ya está desplegada; el backend y su compatibilidad concreta siguen pendientes del primer build.
- En A se reportaron SSH mediante claves, acceso root/password deshabilitado, firewall IPv4/IPv6 y Fail2ban activo, PostgreSQL en loopback y Nginx/aplicaciones inactivos. Ese estado de Nginx y puertos es histórico: D ya sirve HTTPS con frontend en loopback según el agente VPS. Desde el escritorio se comprobaron rutas HTTPS 200/404; las pruebas externas de los demás puertos siguen pendientes.
- La decisión autorizada de `codexdev` con sudo completo se conserva. Las aplicaciones se ejecutarán con cuentas de servicio sin privilegios, distintas de la cuenta administrativa.
- Además del antecedente OVH, se reporta respaldo local de PostgreSQL, roles y archivos privados, diario 03:15 UTC con hasta 10 minutos de retraso y hasta siete conjuntos. Se probaron restauraciones sintéticas de base/archivo y de roles/base en un clúster aislado sin TCP. La restauración completa del VPS y la recuperación desde un destino externo siguen pendientes.

El resultado A se reporta listo para recibir artefactos de prueba. D, demo pública de solo lectura con datos simulados, está publicada en `https://app.stisistemas.com`, commit `bef587fbebcf921d39eb5ec2b2572606ec418c7a`; informe remoto `/srv/sti-os/deployments/20261026T132539Z-bef587fb/REPORT.md`, no inspeccionado aquí. B continúa pendiente. Se prepararon usuarios de servicio sin privilegios, base `sti_os`/esquema `sti` y credenciales separadas de ejecución, migración y respaldo. La próxima integración concretará unidades, rutas, entrega de secretos y privilegios de migraciones futuras; los límites de recursos aún son provisionales.

## 3. Stack de T1

| Capa | Base de trabajo | Razón y límite |
| --- | --- | --- |
| Frontend | Next.js 16.x + TypeScript, Node.js 24 LTS | Interfaz web adaptable a móvil y escritorio; despliegue independiente del backend |
| Interfaz | Tailwind CSS y componentes shadcn/ui, opcionales | Acelerar formularios y consistencia visual; comprobar accesibilidad, firma y uso táctil |
| Backend | Java 21 LTS + Spring Boot 4.1.x | Un monolito modular; módulos por función sin servicios distribuidos en el piloto |
| Seguridad y datos | Spring Security, Spring Data JPA y Flyway | Permisos centralizados y migraciones de esquema versionadas |
| Sesiones | Spring Session JDBC sobre PostgreSQL | Sesiones del lado servidor sin incorporar Redis |
| Base de datos | PostgreSQL 18, base exclusiva de STI-OS | Cuenta de aplicación con permisos mínimos y cuenta separada para migraciones |
| Entrada web | Nginx + HTTPS en `app.stisistemas.com` | Un origen: `/` al frontend y `/api` al backend, con servicios internos en loopback |
| Ejecución | Servicios systemd sin root | Operación sencilla en un VPS, reinicio controlado y registros locales |
| Fotos y firmas | Archivos privados en el VPS; metadatos en PostgreSQL | Descarga autorizada por backend y respaldo conjunto de datos y archivos |

Las familias de versiones son la base acordada actualizada respecto de Java 17/PostgreSQL 16 mencionados inicialmente. En el arranque se verificará su disponibilidad para el sistema operativo real y se fijarán parches compatibles y con correcciones de seguridad, versiones de herramientas y dependencias reproducibles; no se instalará simplemente una etiqueta `latest`. Una incompatibilidad se documentará antes de cambiar la familia elegida.

La documentación consultada de Spring Boot 4.1.2 admite Java 17 a 27; Java 21 es la elección LTS de esta base de trabajo. Se verificará además la compatibilidad real de Spring Session, JPA, Flyway y su módulo PostgreSQL en el proyecto generado. Para D, el VPS reportó `npm ci` y `npm run check` correctos en Linux; esta evidencia no acredita compatibilidad del futuro backend. Las fuentes oficiales figuran al final.

```text
Teléfono / escritorio
        │ HTTPS
        ▼
      Nginx
      ├── /     → Next.js       (loopback)
      └── /api  → Spring Boot   (loopback)
                       ├── PostgreSQL (loopback)
                       └── fotos y firmas privadas
```

El backend es la autoridad de reglas, permisos y acceso a datos. El frontend nunca accede directamente a PostgreSQL. Las consultas y descargas deben verificar empresa, tarea, asignación y rol; ocultar botones no constituye autorización.

La misma aplicación web tendrá navegación y componentes adaptados al ancho de pantalla y a la interacción táctil. El navegador de teléfono y escritorio consume el mismo backend; no se desarrolla una aplicación nativa separada.

Se propone autenticación con sesiones del servidor y cookies `HttpOnly`, `Secure`, `SameSite` apropiado al flujo y protección CSRF para acciones con cambio de estado. La validación de empresa y rol se realiza en cada operación; las contraseñas se almacenan mediante un algoritmo de hash de contraseñas soportado por Spring Security.

Se elige systemd por simplicidad de operación en un único VPS. El costo es mantener configuraciones, versiones y procedimientos de instalación reproducibles en el repositorio. Docker puede evaluarse posteriormente; Kubernetes, Redis, microservicios y un portal IDP no forman parte de T1. Incorporar contenedores después no exige cambiar las reglas de negocio.

## 4. Seguridad necesaria desde T1

La base de datos queda privada **desde el primer día**. La VPN o Zero Trust de T2 servirá para administrar con mayor control, no para corregir una exposición inicial deliberada.

| Control | Resultado verificable antes del piloto |
| --- | --- |
| Red | PostgreSQL solo en loopback; TCP/5432 sin exposición pública; puertos Java/Node internos; firewall IPv4 e IPv6 revisado y prueba externa |
| Entrada | Mantener la política SSH vigente; habilitar 80/443 cuando la aplicación esté preparada; HTTP redirige a HTTPS y renovación del certificado comprobada |
| Cuentas | Servicios sin root; aplicación sin superusuario PostgreSQL; credenciales de migración fuera del proceso normal de aplicación |
| Secretos | Fuera de Git, archivos o credenciales de servicio con permisos restringidos, valores redactados en logs; arranque falla si falta una configuración obligatoria |
| Acceso | Roles y aislamiento de clientes probados en backend; cookies y CSRF configurados; limitación básica de intentos de login en Nginx y tratamiento seguro de errores |
| Archivos | Fotos y firmas fuera de rutas públicas; validación de tipo y tamaño en backend, nombres internos seguros y máximo de cinco fotos por tarea |
| Respaldo | Copias consistentes de PostgreSQL y archivos privados, copia fuera del VPS y restauración ensayada antes de cargar datos reales |
| Operación | Health interno, logs con rotación e identificadores de petición, sin secretos ni trazos de firma en logs; verificación posterior a cada despliegue |

HTTPS debe estar listo antes de validar autenticación y captura de GPS en dispositivos reales. Los permisos de ubicación y el comportamiento excepcional sin coordenadas se cerrarán al implementar ese flujo, sin reabrir ahora toda la definición funcional.

Los respaldos de PostgreSQL y archivos deben tener una estrategia coordinada de recuperación para evitar referencias a fotos o firmas inexistentes. El respaldo de OVH complementa esta estrategia; la recuperación de un archivo no demuestra recuperación de la aplicación. Frecuencia, retención, destino externo y objetivos de recuperación se concretarán antes de usar datos reales.

## 5. Cómo desarrollar y entregar

El repositorio Git privado [Leketo/STI-OS](https://github.com/Leketo/STI-OS) contiene la demo publicada para D y el nuevo commit `91e76d8503fe87f857f0db64ba1ada9d8155ac14` en `origin/main`. La base local `backend/` incluye contrato OpenAPI, migraciones separadas, autenticación y sesiones JDBC, catálogo aislado por empresa, alta de cuentas reservada a ADMIN y creación inicial del administrador fuera de HTTP. Pasaron 12 pruebas de integración HTTP/PostgreSQL 15.3 para ese commit; PostgreSQL 18 del VPS sigue pendiente. El frontend local incorpora `/login` y `/app` con sesión real cuando se configura el backend; los tableros públicos aún usan datos simulados. Después del commit se agregó localmente el alta de clientes por ADMIN y formularios de clientes/cuentas en `/app`; todavía no están publicados ni desplegados. La demo pública sigue en `bef587fbebcf921d39eb5ec2b2572606ec418c7a`. `ops/` y GitHub Actions siguen como propuestas.

Cada entrega atraviesa interfaz, API y base de datos para permitir probar un flujo completo. Antes de implementar la API de cada entrega, se versionará su contrato OpenAPI: autenticación, entradas, respuestas y errores. No se inventan ahora endpoints ni se configura un workspace Postman; los contratos y las pruebas se incorporarán junto con cada función.

| Orden | Entrega funcional verificable |
| --- | --- |
| 1 | Base técnica segura, migraciones, login, sesiones, roles y primer despliegue HTTPS |
| 2 | Clientes y proyectos, administración y aislamiento por empresa |
| 3 | Tareas, asignaciones, tablero y transiciones permitidas; servicios/materiales según el relevamiento |
| 4 | Fotos y confirmaciones de todos los asignados, con reinicio al retroceder |
| 5 | Firma presencial/remota, GPS e historial de acciones; facturación manual condicionada a firma válida |
| 6 | Pruebas en teléfonos y escritorio, aceptación del piloto, recuperación y operación documentadas |

Los detalles pendientes se resuelven cuando afectan a la entrega correspondiente. Se conserva el límite comercial acordado; cualquier ampliación de alcance se identifica antes de incorporarla.

El desarrollo y la compilación se ejecutan localmente o en CI. La CI comprobará tipos, lint y compilación, pruebas unitarias de reglas, integración de permisos/transiciones con PostgreSQL y pruebas breves de navegador de los recorridos críticos. Las versiones de runtime y base usadas para comprobar compatibilidad coincidirán con las desplegadas.

Cada release tendrá versión/commit, artefactos identificables y migraciones. Se despliega al VPS un artefacto construido y comprobado, sin usar cambios directos al servicio activo como flujo de desarrollo. Las primeras pruebas utilizarán datos sintéticos; los datos del piloto se incorporan después de validar acceso y recuperación.

Se mantiene el trabajo con el agente del VPS por objetivos: se le entrega una tarea con resultado y evidencia esperados; devuelve cambios, comprobaciones y riesgos; este agente revisa el informe. El usuario transporta actualmente esos mensajes. No existe una conexión automática entre ambos agentes.

Antes de cada pase se revisan configuración y respaldo aplicable; después se verifican salud, login y un flujo representativo. Se ensayará el retorno a la versión anterior. Las migraciones deben ser compatibles con ese retorno; restaurar toda la base puede perder operaciones posteriores y requiere un procedimiento explícito. Un solo VPS no ofrece garantía de cero interrupciones ni alta disponibilidad.

## 6. T2: controles adicionales, registrados para después

- Evaluar VPN o Zero Trust para administración; elegir producto y permisos cuando exista la necesidad. PostgreSQL continúa sin puerto público.
- Evaluar Cloudflare según plan, costo y funciones: TLS `Full (strict)` con certificado válido en origen, restricción de acceso directo al origen al activar proxy, confianza correcta en IP del proxy y exclusión de caché para sesiones, API y contenido privado.
- Ajustar WAF y rate limiting por patrones reales de abuso y uso. La protección básica del login ya pertenece a T1.
- Ampliar gestión y rotación de secretos, controles de acceso por ambiente y ejercicios periódicos de restauración.

## 7. T3: operación, visibilidad y crecimiento

| Elemento | Criterio para incorporarlo |
| --- | --- |
| Métricas y errores | Medir latencia, errores, recursos y salud; distinguir métricas agregadas de logs y trazas necesarios para investigar un caso |
| Bot posterior al despliegue | Revisar salud y cambios, enviar resumen con enlace a evidencia; deduplicar avisos y definir umbrales, responsable y aprobación humana para acciones correctivas |
| Seguridad continua / Upwind | Evaluar compatibilidad y costo; escanear dependencias y artefactos actuales, o imágenes si se adoptan contenedores; distinguir escaneo no ejecutado de vulnerabilidades detectadas |
| Balanceador | Incorporarlo por evidencia de carga o requisito de disponibilidad; requiere al menos dos réplicas y diseño de sesiones/archivos compartidos |
| Alta disponibilidad | Réplicas en dominios de fallo distintos si se busca resistir caída del servidor; PostgreSQL y almacenamiento necesitan una estrategia propia de continuidad |

Dos procesos detrás de Nginx en el mismo VPS no eliminan la caída del host. Redis, almacenamiento de objetos o más servidores se evaluarán cuando el requisito los justifique; no se adoptan automáticamente por el número de clientes.

## 8. Lecciones del IDP de Cocha para futuras etapas

El [documento compartido sobre Cocha](C:/tools/conocimiento-cocha/_borradores/idp-explicado-para-otro-proyecto.md) describe comportamiento observado y declarado, no su código ni una arquitectura interna comprobada. Se usa como referencia para registrar controles útiles; no se propone reconstruir su portal, GKE o servidor MCP para el piloto.

- **Configuración aprobada por contenido:** futuro ciclo borrador → aprobado → desplegado; cualquier edición invalida la aprobación. Permisos por ambiente y tipo de recurso, secretos redactados y revisión por otra persona cuando exista un segundo responsable; no simular cuatro ojos con una sola persona.
- **Despliegues trazables:** conservar versión, diff, aprobaciones y resultados de comprobaciones. El acceso a esos detalles debe respetar permisos, porque los diffs también pueden revelar información sensible.
- **Cambios de configuración explícitos:** si se migra de un mecanismo anterior, usar un indicador explícito, comparar cobertura de claves y validar valores obligatorios antes del corte. La presencia de una clave no debe desactivar silenciosamente el mecanismo anterior.
- **Telemetría que no detiene el trabajo:** exportación desacoplada del flujo de usuario, con cola acotada, muestreo y límites de recursos; investigar errores requiere logs/trazas además de métricas.
- **Alertas útiles y control humano:** resumen y enlace al detalle; propuestas automáticas de corrección con revisión antes de aplicarse. MCP y autoservicio de plataforma quedan como posibilidades futuras.

Ya se incorporan en T1 secretos fuera de Git, validación de configuración y evidencia de releases. Los flujos avanzados de aprobación y el portal de operación son backlog; el documento de Cocha no prueba que disponga de rollback ni que se hayan rotado credenciales previamente expuestas.

## 9. Próximo paso concreto

El [checklist de instalación de T1](../server/checklist-instalacion-fase-1.md) distingue **A, infraestructura reportada lista**, **D, demo publicada**, y **B, piloto con datos reales pendiente**. Las casillas no sustituyen evidencia remota ni una auditoría en vivo.

1. Según el último reporte administrativo transmitido por el usuario, el agente VPS verificó red, HBA/SCRAM, permisos actuales/futuros y restauración sintética, y corrigió el respaldo de permisos y ajustes por rol. Esta evidencia no fue inspeccionada directamente desde el escritorio. Conservar D y mantener el backend inactivo hasta recibir su artefacto; completar las pruebas externas pendientes.
2. Continuar desde [CONTINUAR.md](../CONTINUAR.md) y [backend/README.md](../backend/README.md): verificar PostgreSQL 18 y desarrollar el dominio de tareas, asignaciones y transiciones. El login local y el aprovisionamiento de cuentas ya están implementados y publicados en GitHub como `91e76d8503fe87f857f0db64ba1ada9d8155ac14`; falta validarlos en el VPS. Las migraciones tienen identidad separada; el runtime no inicializa esquema ni sesiones.
3. Tomar ese commit como revisión identificable para la entrega al agente VPS, después de comprobar compatibilidad PostgreSQL 18 y alinear la configuración con el informe del servidor. Desplegar primero con datos sintéticos, comprobar salud, autenticación y recursos; la demo pública permanece en el commit anterior hasta ese pase.
4. Completar B: aislamiento, permisos, dispositivos, puertos desde origen externo, recuperación externa y reversión antes de datos reales. HTTPS/DNS ya existen para D; preservar y verificar su continuidad.

El destino externo autorizado sigue pendiente antes de datos reales; no bloquea el desarrollo local ni las pruebas sintéticas. T2/T3 y SMTP permanecen fuera del trabajo actual. El [mensaje de instalación](../server/mensaje-codex-instalacion-fase-1.md) se conserva como antecedente histórico.

## Referencias técnicas

Fuentes oficiales consultadas para esta propuesta; revalidar versiones exactas durante el aprovisionamiento:

- [Spring Boot: requisitos del sistema](https://docs.spring.io/spring-boot/system-requirements.html).
- [Spring Session: sesiones HTTP persistidas mediante JDBC](https://docs.spring.io/spring-session/reference/guides/boot-jdbc.html).
- [Next.js 16: actualización y requisitos](https://nextjs.org/docs/app/guides/upgrading/version-16) y [política de soporte](https://nextjs.org/support-policy).
- [Node.js: versiones y ciclo de soporte](https://nodejs.org/en/about/previous-releases).
- [PostgreSQL: política de versiones](https://www.postgresql.org/support/versioning/) y [configuración de escucha](https://www.postgresql.org/docs/current/runtime-config-connection.html).
- [Nginx: limitación de peticiones](https://nginx.org/en/docs/http/ngx_http_limit_req_module.html).
- [Cloudflare: TLS Full (strict)](https://developers.cloudflare.com/ssl/origin-configuration/ssl-modes/full-strict/).

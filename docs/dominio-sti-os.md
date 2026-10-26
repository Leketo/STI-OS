# Dominio de STI-OS

Actualizado: 25/10/2026 (America/Asuncion).

La aplicación usará **`app.stisistemas.com`**. Se creó en el panel [Toledo Hosting — registros DNS](https://us.cloudlogin.co/dns/records/) un registro **A** para `app.stisistemas.com` con destino `54.39.110.0` y TTL **3600 segundos**. El panel mostró el registro creado y [Google Public DNS](https://dns.google/resolve?name=app.stisistemas.com&type=A) respondió con la misma dirección.

La dirección del VPS también se contrastó con [la respuesta pública de su nombre OVH](https://dns.google/resolve?name=vps-ffc655c1.vps.ovh.ca&type=A). El dominio principal `stisistemas.com` y `www.stisistemas.com` siguen apuntando al hosting Toledo (`162.210.97.116`); no se editaron sus registros A, MX, NS ni los de correo. Esto deja libre el dominio principal para una futura web institucional.

El registro DNS **no publica todavía la aplicación**: según la [entrega del VPS](../server/entrega-vps-2026-10-25.md), Nginx está detenido, no hay aplicación desplegada y 80/443 permanecen cerrados. Para habilitar el piloto faltan el release real, HTTPS en este subdominio, prueba externa de los puertos y los demás controles B del [checklist](../server/checklist-instalacion-fase-1.md). No se añadió AAAA para la aplicación; IPv6 se configurará de forma deliberada cuando el servicio esté listo.

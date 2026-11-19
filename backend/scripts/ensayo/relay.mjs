// Puente solo de ensayo. La interfaz exige que STI_API_ORIGIN apunte a 127.0.0.1 (next.config.ts), pero en el
// contenedor 127.0.0.1 es el propio contenedor. Este puente escucha ahí y reenvía al backend que corre en el host.
//   node relay.mjs [puerto] [host]
import net from "node:net";

const port = Number(process.argv[2] ?? 8099);
const host = process.argv[3] ?? "host.docker.internal";

net
  .createServer((client) => {
    const upstream = net.connect(port, host);
    client.pipe(upstream).pipe(client);
    upstream.on("error", () => client.destroy());
    client.on("error", () => upstream.destroy());
  })
  .listen(port, "127.0.0.1", () => console.log(`relay 127.0.0.1:${port} -> ${host}:${port}`));

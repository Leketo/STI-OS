/**
 * Developer-only API double for frontend review. No database, production credentials or real data.
 * Run with `node scripts/ui-fixture-server.mjs`, then set the LOCAL frontend's
 * STI_API_ORIGIN=http://127.0.0.1:4187. Never use this process as a deployed backend.
 */
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";

const account = {
  id: "fixture-admin",
  name: "Equipo de prueba",
  email: "equipo@example.test",
  role: "ADMIN",
  clientId: null,
};
const clients = [
  { id: "client-a", name: "Sallustro · Ejemplo" },
  { id: "client-b", name: "Comercial del Sur · Ejemplo" },
];
const projects = [
  { id: "project-a", clientId: "client-a", name: "Casa central" },
  { id: "project-b", clientId: "client-a", name: "Depósito logístico" },
  { id: "project-c", clientId: "client-b", name: "Sucursal del centro" },
];
const operators = [
  account,
  { id: "person-a", name: "Diego Ramos", role: "USUARIO" },
  { id: "person-b", name: "Lucía Benítez", role: "USUARIO" },
];
const seeds = [
  [
    "Instalar cámaras en el acceso principal",
    "Revisar los puntos definidos y preparar la instalación del nuevo circuito.",
    "POR_HACER",
    "project-a",
    ["person-a", "person-b"],
  ],
  [
    "Revisar iluminación del depósito",
    "El equipo del local reportó dos luminarias intermitentes.",
    "POR_HACER",
    "project-b",
    [],
  ],
  [
    "Configurar red de la nueva sucursal",
    "Preparar el router y comprobar cobertura en los puestos de trabajo.",
    "POR_HACER",
    "project-c",
    ["person-a"],
  ],
  [
    "Mantenimiento del rack de comunicaciones",
    "Ordenar las conexiones, identificar puertos y comprobar el respaldo.",
    "EN_PROCESO",
    "project-a",
    ["fixture-admin"],
  ],
  [
    "Ajustar el sistema de sonido",
    "Comprobar parlantes y niveles de audio del salón principal.",
    "EN_PROCESO",
    "project-c",
    ["person-a", "person-b"],
  ],
  [
    "Certificar los puntos de red",
    "Las pruebas están completas. Falta la conformidad del cliente.",
    "FINALIZADO",
    "project-b",
    ["person-a"],
  ],
  [
    "Actualizar el control de acceso",
    "Actualización y prueba del ingreso del personal completadas.",
    "FINALIZADO",
    "project-a",
    ["person-b"],
  ],
  [
    "Mantenimiento preventivo de CCTV",
    "Servicio completado y documentación entregada al cliente.",
    "FACTURADO",
    "project-c",
    ["person-a"],
  ],
];
let number = 108;
const tasks = seeds.map(([title, detail, status, projectId, ids], index) => ({
  id: `task-${index}`,
  code: `TAR-${String(101 + index).padStart(4, "0")}`,
  projectId,
  clientId: projects.find((p) => p.id === projectId).clientId,
  title,
  detail,
  status,
  createdAt: new Date(Date.UTC(2026, 9, 29 - index, 12)).toISOString(),
  assignees: ids.map((id) => ({
    id,
    name: operators.find((p) => p.id === id).name,
    confirmed: ["FINALIZADO", "FACTURADO"].includes(status),
  })),
  photoCount: 0,
  signed: index === 6 || status === "FACTURADO",
}));
const events = new Map(
  tasks.map((t) => [
    t.id,
    [
      {
        id: randomUUID(),
        kind: "CREADA",
        fromStatus: null,
        toStatus: "POR_HACER",
        actorName: account.name,
        occurredAt: t.createdAt,
        locationAbsentReason: null,
      },
    ],
  ]),
);
const photos = new Map();
const signatures = new Map();
let failNext = false;
function withCounts(task) {
  return {
    ...task,
    confirmed: task.assignees.filter((a) => a.confirmed).length,
    pending: task.assignees.filter((a) => !a.confirmed).length,
  };
}
function event(task, kind, toStatus = null) {
  events.get(task.id).push({
    id: randomUUID(),
    kind,
    fromStatus: task.status,
    toStatus,
    actorName: account.name,
    occurredAt: new Date().toISOString(),
    locationAbsentReason: "Entorno de prueba",
  });
}
const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://127.0.0.1:4187");
  const path = url.pathname;
  const method = req.method;
  function answer(data, status = 200, headers = {}) {
    res.writeHead(status, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...headers,
    });
    res.end(JSON.stringify(data));
  }
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  let input = {};
  try {
    input = JSON.parse(Buffer.concat(chunks).toString() || "{}");
  } catch {
    /* File uploads are handled separately. */
  }
  if (path === "/__fixture/fail-next" && method === "POST") {
    failNext = true;
    return answer({ ready: true });
  }
  if (path === "/api/auth/csrf")
    return answer({ token: "fixture-csrf", headerName: "X-CSRF-TOKEN" }, 200, {
      "Set-Cookie": "STI_SESSION=fixture-only; Path=/; HttpOnly; SameSite=Lax",
    });
  if (path === "/api/auth/me") return answer(account);
  if (path === "/api/auth/logout")
    return answer({}, 200, { "Set-Cookie": "STI_SESSION=; Path=/; Max-Age=0" });
  if (method !== "GET" && req.headers["x-csrf-token"] !== "fixture-csrf")
    return answer({}, 403);
  if (failNext && method !== "GET") {
    failNext = false;
    return answer({}, 503);
  }
  if (path === "/api/operators") return answer(operators);
  if (path === "/api/clients") {
    if (method === "GET") return answer(clients);
    const item = { id: randomUUID(), name: input.name };
    clients.push(item);
    return answer(item, 201);
  }
  if (path === "/api/projects") {
    if (method === "GET") return answer(projects);
    const item = {
      id: randomUUID(),
      name: input.name,
      clientId: input.clientId,
    };
    projects.push(item);
    return answer(item, 201);
  }
  if (path === "/api/accounts" && method === "POST") {
    const item = {
      id: randomUUID(),
      name: input.name,
      email: input.email,
      role: input.role,
      clientId: input.clientId,
    };
    if (item.role !== "CLIENTE") operators.push(item);
    return answer(item, 201);
  }
  if (
    path === "/api/tasks" &&
    method === "GET" &&
    url.searchParams.get("fixtureFail") === "1"
  ) {
    failNext = true;
    return answer({ fixtureOnly: true, failNext: true });
  }
  if (path === "/api/tasks") {
    if (method === "GET")
      return answer(
        tasks.filter((t) => t.status !== "ANULADA").map(withCounts),
      );
    if (!input.title?.trim() || !projects.some((p) => p.id === input.projectId))
      return answer({}, 400);
    const task = {
      id: randomUUID(),
      code: `TAR-${++number}`,
      projectId: input.projectId,
      clientId: projects.find((p) => p.id === input.projectId).clientId,
      title: input.title,
      detail: input.detail,
      status: "POR_HACER",
      createdAt: new Date().toISOString(),
      assignees: [],
      photoCount: 0,
      signed: false,
    };
    tasks.unshift(task);
    events.set(task.id, []);
    event(task, "CREADA", "POR_HACER");
    return answer(withCounts(task), 201);
  }
  const match = path.match(/^\/api\/tasks\/([^/]+)(.*)$/);
  if (!match) return answer({}, 404);
  const task = tasks.find((t) => t.id === match[1]);
  if (!task) return answer({}, 404);
  const suffix = match[2];
  if (!suffix)
    return answer({
      ...withCounts(task),
      events: events.get(task.id),
      photos: photos.get(task.id) || [],
      signatures: signatures.get(task.id) || [],
    });
  if (suffix === "/status") {
    if (input.to === "FINALIZADO" || (input.to === "FACTURADO" && !task.signed))
      return answer({}, 400);
    event(task, "ESTADO", input.to);
    if (
      input.to === "POR_HACER" ||
      (task.status === "FINALIZADO" && input.to === "EN_PROCESO")
    ) {
      task.assignees.forEach((a) => (a.confirmed = false));
      task.signed = false;
    }
    task.status = input.to;
    return answer(withCounts(task));
  }
  if (suffix === "/confirmations") {
    const me = task.assignees.find((a) => a.id === account.id);
    if (task.status !== "EN_PROCESO" || !me) return answer({}, 403);
    me.confirmed = true;
    event(task, "CONFIRMACION");
    if (task.assignees.every((a) => a.confirmed)) {
      event(task, "ESTADO", "FINALIZADO");
      task.status = "FINALIZADO";
    }
    return answer(withCounts(task));
  }
  if (suffix === "/assignments" && method === "POST") {
    const person = operators.find((p) => p.id === input.userId);
    if (!person) return answer({}, 400);
    if (!task.assignees.some((a) => a.id === person.id))
      task.assignees.push({
        id: person.id,
        name: person.name,
        confirmed: false,
      });
    event(task, "ASIGNADA");
    return answer(withCounts(task));
  }
  if (suffix.startsWith("/assignments/") && method === "DELETE") {
    task.assignees = task.assignees.filter(
      (a) => a.id !== suffix.split("/")[2],
    );
    event(task, "DESASIGNADA");
    return answer(withCounts(task));
  }
  if (suffix === "/signature" && method === "POST") {
    if (task.status !== "FINALIZADO") return answer({}, 400);
    task.signed = true;
    event(task, "FIRMA");
    return answer({}, 201);
  }
  return answer({}, 404);
});
server.listen(4187, "127.0.0.1", () =>
  process.stdout.write(
    "Frontend fixture API: http://127.0.0.1:4187 (fictional in-memory data only)\n",
  ),
);

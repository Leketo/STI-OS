// CA-74 probe (corte 3B): v0.3.0 against schema 7 with the data of the 3B matrix: tasks with a day, a changed day
// (FECHA in the log), a renamed client and project. Built from the head of matriz-api.mjs; the probe is at the end.
//
// Usage, against the rehearsal environment and nothing else:
//   ./backend/scripts/ensayo.ps1 -Accion Levantar
//   node backend/scripts/ensayo/matriz-api.mjs output/ensayo
//   ./backend/scripts/ensayo.ps1 -Accion Bajar
//
// It reads the rehearsal ADMIN from <outDir>/secretos.json (written by Levantar, outside Git, deleted by Bajar),
// talks to the backend at STI_E2E_BASE (default http://127.0.0.1:8099), reads state with psql inside the
// rehearsal database container, and writes matriz-api.md, matriz-api.json and datos-falsos.json to <outDir>.
// The fake accounts get a password drawn at random on each run; nothing secret lives in this file.
//
// Changes against the 18/11 run, each one forced by a rule or by the script itself, never to make a row pass:
// - Section 6 follows D-26 (19/11): starting without assignees, removing the only pending assignee and removing
//   the last assignee in progress are now rules with an expected answer, no longer observations.
// - Corte 2 (ENCARGO-DEV-002, D-23): the ADMIN no longer sends a password. Each fake account takes the initial
//   password the system draws, signs in once and replaces it with the run's random one, as the first sign-in
//   screen does. The row "Cuenta con contraseña de 11 caracteres" (400) has no object now: a password sent on
//   creation is ignored. It is replaced by "Alta con contraseña escrita por el ADMIN" (201, and that password does
//   not open the account). Section 9 adds every account operation with the four roles and without a session.
//   Because x1 now exists, "SUPERVISOR ve operadores" expects 5 people (was 4), and also that none is a CLIENTE.
// - Concurrency runs 10 rounds, as the encargo asks of the suite (18/11: 8).
// - Technician 2 signs in again before the board seed: section 7 expires its sessions on purpose, and on 18/11
//   that left part of the board to a separate fix-up script.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';

const BASE = process.env.STI_E2E_BASE ?? 'http://127.0.0.1:8099';
const OUT = process.argv[2];
if (!OUT) throw new Error('outDir required');
const creds = JSON.parse(fs.readFileSync(path.join(OUT, 'secretos.json'), 'utf8'));
const sql = (q) => execFileSync('docker', ['exec', 'sti-ensayo', 'psql', '-U', 'postgres', '-d', 'sti_os', '-tAc', q]).toString().trim();
const FAKE_PASSWORD = 'Ensayo-' + crypto.randomBytes(12).toString('base64url');
const rows = [];
let section = '';
class Session {
  constructor(label) { this.label = label; this.cookies = new Map(); this.token = null; this.header = 'X-CSRF-TOKEN'; }
  cookieHeader() { return [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; '); }
  absorb(res) {
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [pair] = c.split(';');
      const i = pair.indexOf('=');
      const k = pair.slice(0, i), v = pair.slice(i + 1);
      if (/Max-Age=0/i.test(c) || v === '') this.cookies.delete(k); else this.cookies.set(k, v);
    }
  }
  async raw(method, url, { body, headers = {}, csrf = method !== 'GET' } = {}) {
    if (csrf) await this.refreshCsrf();
    const h = { ...headers };
    if (this.cookies.size) h.cookie = this.cookieHeader();
    if (csrf && this.token) h[this.header] = this.token;
    const res = await fetch(BASE + url, { method, headers: h, body, redirect: 'manual' });
    this.absorb(res);
    const buf = Buffer.from(await res.arrayBuffer());
    let json = null;
    if ((res.headers.get('content-type') ?? '').includes('json') && buf.length) { try { json = JSON.parse(buf.toString()); } catch {} }
    return { status: res.status, json, bytes: buf, type: res.headers.get('content-type'), cacheControl: res.headers.get('cache-control') };
  }
  async refreshCsrf() {
    const res = await fetch(BASE + '/api/auth/csrf', { headers: this.cookies.size ? { cookie: this.cookieHeader() } : {} });
    this.absorb(res);
    const j = await res.json();
    this.token = j.token; this.header = j.headerName ?? this.header;
  }
  async login(email, password) {
    const r = await this.raw('POST', '/api/auth/login', {
      body: new URLSearchParams({ username: email, password }).toString(),
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    });
    return r.status;
  }
  get(url) { return this.raw('GET', url); }
  post(url, data) { return this.raw('POST', url, { body: JSON.stringify(data), headers: { 'content-type': 'application/json' } }); }
  del(url) { return this.raw('DELETE', url); }
  upload(url, bytes, name, type) {
    const fd = new FormData();
    fd.append('file', new Blob([bytes], { type }), name);
    return this.raw('POST', url, { body: fd });
  }
}

function check(rule, role, expected, obtained, note = '') {
  const ok = String(expected) === String(obtained);
  rows.push({ section, rule, role, expected: String(expected), obtained: String(obtained), ok, note });
  console.log(`${ok ? 'OK  ' : 'FAIL'} [${section}] ${rule} (${role}) esperado=${expected} obtenido=${obtained} ${note}`);
  return ok;
}
function observe(rule, role, obtained, note = '') {
  rows.push({ section, rule, role, expected: '(observación)', obtained: String(obtained), ok: null, note });
  console.log(`OBS  [${section}] ${rule} (${role}) ${obtained} ${note}`);
}

// PNG generator: solid colour RGB image, valid enough for any browser.
// PNG generator: solid colour RGB image, valid enough for any browser.
function png(w, h, [r, g, b]) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const o = y * (w * 3 + 1) + 1 + x * 3; raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const PHOTO = png(320, 240, [40, 120, 200]);
const GPS = { latitude: -25.2637, longitude: -57.5759, accuracyM: 12 }; // Asunción

// ---------- CA-74 probe: what v0.3.0 does over schema 7 ----------
// Usage, with v0.3.0 running over schema 7 (Levantar -JarWeb with the v0.3.0 JAR) after the 3A matrix ran on it:
//   node backend/scripts/ensayo/ca74-sonda.mjs <ensayo output dir>
// v0.3.0 cannot write the 3B data, so the probe writes it by SQL first, as v0.3.1 does: a finished task with a day
// set and changed (two FECHA events, ASIGNADA with its day), an open task with a day, and a renamed client and
// project with their log. Only fake data of the rehearsal. It writes ca74-sonda.md to the output dir.
const one = (q) => sql(q).split(String.fromCharCode(10))[0] ?? '';
const changed = one(`SELECT id FROM sti.task WHERE status = 'FINALIZADO' ORDER BY number LIMIT 1`);
// An open task with people, so that v0.3.0 may start it (a task without assignees is refused with 409 by rule).
const dated = one(`SELECT t.id FROM sti.task t WHERE t.status = 'POR_HACER' AND EXISTS (SELECT 1 FROM sti.task_assignment a WHERE a.task_id = t.id) ORDER BY t.number LIMIT 1`);
const renamed = one(`SELECT c.id FROM sti.client c WHERE EXISTS (SELECT 1 FROM sti.project p WHERE p.client_id = c.id) ORDER BY c.name LIMIT 1`);
const renamedProject = one(`SELECT id FROM sti.project WHERE client_id = '${renamed}' ORDER BY name LIMIT 1`);
const actor = one(`SELECT id FROM sti.app_user WHERE email = '${creds.adminEmail}'`);
const absent = 'No aplica: cambio de fecha';
sql(`UPDATE sti.task SET scheduled_on = DATE '2026-11-26' WHERE id = '${changed}';
     INSERT INTO sti.task_event(id, task_id, kind, actor_id, location_absent_reason, scheduled_from, scheduled_to) VALUES
       (gen_random_uuid(), '${changed}', 'FECHA', '${actor}', '${absent}', NULL, DATE '2026-11-24'),
       (gen_random_uuid(), '${changed}', 'FECHA', '${actor}', '${absent}', DATE '2026-11-24', DATE '2026-11-26');
     UPDATE sti.task_event SET scheduled_to = DATE '2026-11-24' WHERE task_id = '${changed}' AND kind = 'ASIGNADA';
     UPDATE sti.task SET scheduled_on = DATE '2026-11-25' WHERE id = '${dated}';
     INSERT INTO sti.catalog_name_edit(id, client_id, old_name, new_name, actor_id)
       SELECT gen_random_uuid(), id, name, name || ' (renombrada)', '${actor}' FROM sti.client WHERE id = '${renamed}';
     UPDATE sti.client SET name = name || ' (renombrada)' WHERE id = '${renamed}';
     INSERT INTO sti.catalog_name_edit(id, project_id, old_name, new_name, actor_id)
       SELECT gen_random_uuid(), id, name, name || ' (renombrado)', '${actor}' FROM sti.project WHERE id = '${renamedProject}';
     UPDATE sti.project SET name = name || ' (renombrado)' WHERE id = '${renamedProject}';`);
const renamedName = one(`SELECT name FROM sti.client WHERE id = '${renamed}'`);
const admin = new Session('ADMIN');
check('Ingreso del ADMIN en v0.3.0', 'ADMIN', 204, await admin.login(creds.adminEmail, creds.adminPassword));
observe('Versión del backend', 'sistema', 'v0.3.0 (JAR del clon en c566b29)');
observe('Esquema', 'sistema', sql(`SELECT max(version::int) FROM sti.flyway_schema_history WHERE success`));
observe('Datos del 3B', 'sistema', `${sql(`SELECT count(*) FROM sti.task WHERE scheduled_on IS NOT NULL`)} con fecha, `
  + `${sql(`SELECT count(*) FROM sti.task_event WHERE kind = 'FECHA'`)} cambios, ${sql(`SELECT count(*) FROM sti.catalog_name_edit`)} nombres editados`);
const list = await admin.get('/api/tasks');
check('Tablero (lista de tareas)', 'ADMIN', 200, list.status);
check('Las tareas con fecha están en la lista', 'ADMIN', 'sí sí', [changed, dated].map((id) => (list.json ?? []).some((t) => t.id === id) ? 'sí' : 'no').join(' '));
const detail = await admin.get(`/api/tasks/${changed}`);
check('Panel de una tarea con cambios de fecha', 'ADMIN', 200, detail.status);
observe('Tipos del historial que devuelve', 'ADMIN', [...new Set((detail.json?.events ?? []).map((e) => e.kind))].join(','),
  'la interfaz de v0.3.0 muestra FECHA con su texto por defecto, "Actualizó la tarea"');
const pdf = await admin.get(`/api/tasks/${changed}/constancia`);
check('Constancia de la tarea con cambios de fecha', 'ADMIN', '200 %PDF-', `${pdf.status} ${pdf.bytes.subarray(0, 5).toString()}`);
check('Constancia, las fechas no cambian con FECHA', 'sistema', 'Atención y Finalizada salen de ESTADO',
  sql(`SELECT count(*) FROM sti.task_event WHERE task_id = '${changed}' AND kind = 'FECHA' AND to_status IS NOT NULL`) === '0' ? 'Atención y Finalizada salen de ESTADO' : 'FECHA con to_status');
check('Cliente renombrado en la lista', 'ADMIN', renamedName, ((await admin.get('/api/clients')).json ?? []).find((c) => c.id === renamed)?.name);
// What v0.3.0 writes over schema 7.
const fresh = await admin.post('/api/tasks', { projectId: one(`SELECT id FROM sti.project ORDER BY name LIMIT 1`), title: 'CA-74 alta en v0.3.0 (datos falsos)', location: GPS });
check('Alta en v0.3.0', 'ADMIN', 201, fresh.status);
observe('Fecha de la tarea creada por v0.3.0', 'sistema', sql(`SELECT coalesce(scheduled_on::text, 'sin fecha') FROM sti.task WHERE id = '${fresh.json?.id}'`));
const tech = one(`SELECT id FROM sti.app_user WHERE role = 'USUARIO' AND enabled ORDER BY email LIMIT 1`);
check('Asignar en v0.3.0 una tarea sin fecha', 'ADMIN', 200, (await admin.post(`/api/tasks/${fresh.json?.id}/assignments`, { userId: tech })).status);
observe('Queda asignada sin fecha', 'sistema', sql(`SELECT coalesce(t.scheduled_on::text, 'sin fecha') || ' ' || count(a.*) FROM sti.task t LEFT JOIN sti.task_assignment a ON a.task_id = t.id WHERE t.id = '${fresh.json?.id}' GROUP BY t.scheduled_on`),
  'igual que las tareas asignadas antes del 3B: v0.3.1 la muestra "Sin fecha" y pide la fecha al asignar a otra persona');
const dayBefore = sql(`SELECT scheduled_on FROM sti.task WHERE id = '${dated}'`);
check('Cambio de estado de una tarea con fecha', 'ADMIN', 200, (await admin.post(`/api/tasks/${dated}/status`, { to: 'EN_PROCESO', location: GPS })).status);
check('La fecha sigue igual después del cambio de estado', 'sistema', dayBefore, sql(`SELECT scheduled_on FROM sti.task WHERE id = '${dated}'`));
const md = ['| Regla | Rol | Esperado | Obtenido | Resultado |', '|---|---|---|---|---|',
  ...rows.map((x) => `| ${x.rule}${x.note ? ` — ${x.note}` : ''} | ${x.role} | ${x.expected} | ${x.obtained} | ${x.ok === null ? 'obs.' : x.ok ? 'OK' : '**FALLA**'} |`)];
fs.writeFileSync(path.join(OUT, 'ca74-sonda.md'), md.join('\n') + '\n');
console.log(`\nRESUMEN: ${rows.filter((x) => x.ok).length} OK, ${rows.filter((x) => x.ok === false).length} FALLA, ${rows.filter((x) => x.ok === null).length} observaciones`);

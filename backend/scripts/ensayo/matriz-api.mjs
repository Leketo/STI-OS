// STI-OS API matrix with fake data: every rule, per role, expected against obtained.
// First run on 18/11/2026 (docs/informe-e2e-2026-11-18.md); kept in the repository since corte 1 (ENCARGO-DEV-001).
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

// ---------- helpers ----------
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
const SIGN = png(300, 100, [255, 255, 255]);
const JPEG_HEADER = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(2000, 7)]); // magic bytes only
const FAKE_PNG = Buffer.from('esto no es una imagen, solo texto con extensión .png');
const BIG_10_5 = Buffer.concat([PHOTO.subarray(0, 8), Buffer.alloc(Math.floor(10.5 * 1024 * 1024))]);
const BIG_12 = Buffer.concat([PHOTO.subarray(0, 8), Buffer.alloc(12 * 1024 * 1024)]);
const SIGN_B64 = 'data:image/png;base64,' + SIGN.toString('base64');
fs.mkdirSync(path.join(OUT, 'assets'), { recursive: true });
fs.writeFileSync(path.join(OUT, 'assets', 'foto-prueba.png'), PHOTO);
fs.writeFileSync(path.join(OUT, 'assets', 'foto-falsa.png'), FAKE_PNG);

const GPS = { latitude: -25.2637, longitude: -57.5759, accuracyM: 12 }; // Asunción
const NOGPS = { absentReason: 'Permiso de ubicación denegado (prueba)' };

// ---------- 0. health + auth ----------
section = '0 Salud y autenticación';
{
  const s = new Session('anon');
  check('GET /api/health sin sesión', 'anónimo', 200, (await s.get('/api/health')).status);
  check('GET /api/auth/me sin sesión', 'anónimo', 401, (await s.get('/api/auth/me')).status);
  check('GET /api/tasks sin sesión', 'anónimo', 401, (await s.get('/api/tasks')).status);
  check('Ruta fuera de /api', 'anónimo', 401, (await s.get('/actuator')).status, 'denyAll');
  check('Login con contraseña errónea', 'anónimo', 401, await s.login(creds.adminEmail, 'incorrecta-123456'));
  const noCsrf = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: `username=${encodeURIComponent(creds.adminEmail)}&password=x`, redirect: 'manual' });
  check('Login sin token CSRF', 'anónimo', 403, noCsrf.status);
}
const admin = new Session('ADMIN');
check('Login admin bootstrap', 'ADMIN', 204, await admin.login(creds.adminEmail.toUpperCase(), creds.adminPassword), 'correo en mayúsculas');
check('GET /api/auth/me', 'ADMIN', 'ADMIN', (await admin.get('/api/auth/me')).json?.role);
check('Admin existente sin cambio obligatorio', 'ADMIN', false, (await admin.get('/api/auth/me')).json?.mustChangePassword, 'D-78, mismo criterio para el bootstrap');

// ---------- 1. seed ----------
section = '1 Datos falsos (carga)';
const mk = async (url, body) => { const r = await admin.post(url, body); if (r.status !== 201) throw new Error(`${url} -> ${r.status}`); return r.json; };
const cA = await mk('/api/clients', { name: 'Constructora Ficticia SA' });
const cB = await mk('/api/clients', { name: 'Hotel Demo SRL' });
const pA1 = await mk('/api/projects', { clientId: cA.id, name: 'Torre Norte — CCTV' });
const pA2 = await mk('/api/projects', { clientId: cA.id, name: 'Obrador — cableado estructurado' });
const pB1 = await mk('/api/projects', { clientId: cB.id, name: 'Lobby — sonido ambiental' });
// D-23: the system draws the initial password; the person replaces it on the first sign-in.
const firstSignIn = async (email, initial, chosen) => {
  const s = new Session(email);
  const login = await s.login(email, initial);
  const change = (await s.post('/api/auth/password', { newPassword: chosen })).status;
  await s.raw('POST', '/api/auth/logout');
  return `${login} ${change}`;
};
const acct = async (name, email, role, clientId = null) => {
  const created = await mk('/api/accounts', { name, email, role, clientId });
  check('Alta y primer ingreso con la contraseña inicial', role, '204 204', await firstSignIn(email, created.initialPassword, FAKE_PASSWORD));
  return { ...created.account, password: FAKE_PASSWORD };
};
const sup = await acct('Sofía Supervisora', 'supervisora@example.invalid', 'SUPERVISOR');
const t1 = await acct('Tomás Técnico', 'tecnico1@example.invalid', 'USUARIO');
const t2 = await acct('Teresa Técnica', 'tecnico2@example.invalid', 'USUARIO');
const clA = await acct('Carla Cliente (Constructora)', 'cliente.constructora@example.invalid', 'CLIENTE', cA.id);
const clB = await acct('Hugo Cliente (Hotel)', 'cliente.hotel@example.invalid', 'CLIENTE', cB.id);
observe('Carga: 2 clientes, 3 proyectos, 5 cuentas', 'ADMIN', 'creado');

section = '1b Validaciones de alta';
{
  const typed = 'Escrita-' + crypto.randomBytes(9).toString('base64url');
  const r1 = await admin.post('/api/accounts', { name: 'X', email: 'x1@example.invalid', password: typed, role: 'USUARIO' });
  check('Alta con contraseña escrita por el ADMIN', 'ADMIN', 201, r1.status, 'D-23: la contraseña enviada se ignora');
  check('La contraseña escrita por el ADMIN no abre la cuenta', 'anónimo', 401, await new Session('x1').login('x1@example.invalid', typed));
}
check('Cuenta CLIENTE sin empresa', 'ADMIN', 400, (await admin.post('/api/accounts', { name: 'X', email: 'x2@example.invalid', role: 'CLIENTE' })).status);
check('Cuenta USUARIO con empresa', 'ADMIN', 400, (await admin.post('/api/accounts', { name: 'X', email: 'x3@example.invalid', role: 'USUARIO', clientId: cA.id })).status);
check('Correo duplicado (distinto caso)', 'ADMIN', 409, (await admin.post('/api/accounts', { name: 'X', email: 'TECNICO1@example.invalid', role: 'USUARIO' })).status);
check('Proyecto con empresa inexistente', 'ADMIN', 400, (await admin.post('/api/projects', { clientId: '00000000-0000-0000-0000-000000000000', name: 'X' })).status);
check('Cliente con nombre vacío', 'ADMIN', 400, (await admin.post('/api/clients', { name: '   ' })).status);
const dupClient = await admin.post('/api/clients', { name: 'Constructora Ficticia SA' });
observe('Cliente con nombre repetido', 'ADMIN', dupClient.status, dupClient.status === 201 ? 'se permite duplicar empresas con el mismo nombre' : '');

// sessions per role
const S = {};
for (const [k, a] of Object.entries({ sup, t1, t2, clA, clB })) { S[k] = new Session(k); S[k].acc = a; check('Login por formulario', a.role, 204, await S[k].login(a.email, a.password)); }
const role = (k) => S[k].acc.role;

section = '1c Permisos de alta';
check('SUPERVISOR crea cliente', 'SUPERVISOR', 403, (await S.sup.post('/api/clients', { name: 'X' })).status);
check('SUPERVISOR crea proyecto', 'SUPERVISOR', 403, (await S.sup.post('/api/projects', { clientId: cA.id, name: 'X' })).status);
check('SUPERVISOR crea cuenta', 'SUPERVISOR', 403, (await S.sup.post('/api/accounts', { name: 'X', email: 'x9@example.invalid', role: 'USUARIO' })).status);
check('USUARIO lista operadores', 'USUARIO', 403, (await S.t1.get('/api/operators')).status);
check('CLIENTE lista operadores', 'CLIENTE', 403, (await S.clA.get('/api/operators')).status);
check('CLIENTE ve solo su empresa', 'CLIENTE', 1, (await S.clA.get('/api/clients')).json?.length);
check('CLIENTE ve solo sus proyectos', 'CLIENTE', 2, (await S.clA.get('/api/projects')).json?.length);
check('CLIENTE pide proyecto ajeno', 'CLIENTE', 404, (await S.clA.get(`/api/projects/${pB1.id}`)).status);
{
  const ops = (await S.sup.get('/api/operators')).json ?? [];
  check('SUPERVISOR ve operadores (sin CLIENTE)', 'SUPERVISOR', '5 0', `${ops.length} ${ops.filter((o) => o.role === 'CLIENTE').length}`,
    'admin+sup+2 técnicos+x1 de 1b; ninguno CLIENTE. Hasta el corte 1 eran 4: x1 daba 400 y desde D-23 se crea');
}

// ---------- 2. happy path ----------
section = '2 Ciclo completo';
let r = await S.sup.post('/api/tasks', { projectId: pA1.id, title: 'Instalar 4 cámaras domo en piso 3', detail: 'Cableado UTP cat6 desde el rack del piso 2.', location: GPS });
check('SUPERVISOR crea tarea', 'SUPERVISOR', 201, r.status);
const T = r.json; check('Estado inicial', 'SUPERVISOR', 'POR_HACER', T.status); observe('Código asignado', 'SUPERVISOR', T.code);
check('Asignar técnico 1', 'SUPERVISOR', 200, (await S.sup.post(`/api/tasks/${T.id}/assignments`, { userId: t1.id })).status);
check('Asignar técnico 2', 'SUPERVISOR', 200, (await S.sup.post(`/api/tasks/${T.id}/assignments`, { userId: t2.id })).status);
check('Asignar dos veces al mismo (idempotente)', 'SUPERVISOR', 200, (await S.sup.post(`/api/tasks/${T.id}/assignments`, { userId: t2.id })).status);
check('Asignar a un CLIENTE', 'SUPERVISOR', 400, (await S.sup.post(`/api/tasks/${T.id}/assignments`, { userId: clA.id })).status);
check('USUARIO asigna', 'USUARIO', 403, (await S.t1.post(`/api/tasks/${T.id}/assignments`, { userId: t1.id })).status);
check('Técnico asignado ve la tarea', 'USUARIO', 200, (await S.t1.get(`/api/tasks/${T.id}`)).status);
check('CLIENTE de la empresa ve la tarea', 'CLIENTE', 200, (await S.clA.get(`/api/tasks/${T.id}`)).status);
check('CLIENTE de otra empresa', 'CLIENTE', 404, (await S.clB.get(`/api/tasks/${T.id}`)).status);
check('Pedir FINALIZADO directo', 'ADMIN', 400, (await admin.post(`/api/tasks/${T.id}/status`, { to: 'FINALIZADO', location: GPS })).status);
check('Cambio de estado sin ubicación', 'USUARIO', 400, (await S.t1.post(`/api/tasks/${T.id}/status`, { to: 'EN_PROCESO' })).status);
check('Ubicación con coordenadas Y motivo', 'USUARIO', 400, (await S.t1.post(`/api/tasks/${T.id}/status`, { to: 'EN_PROCESO', location: { ...GPS, ...NOGPS } })).status);
check('Latitud fuera de rango', 'USUARIO', 400, (await S.t1.post(`/api/tasks/${T.id}/status`, { to: 'EN_PROCESO', location: { latitude: 91, longitude: 0 } })).status);
check('CLIENTE inicia la tarea', 'CLIENTE', 403, (await S.clA.post(`/api/tasks/${T.id}/status`, { to: 'EN_PROCESO', location: GPS })).status);
check('Técnico asignado inicia', 'USUARIO', 'EN_PROCESO', (await S.t1.post(`/api/tasks/${T.id}/status`, { to: 'EN_PROCESO', location: GPS })).json?.status);
check('Técnico vuelve a POR_HACER', 'USUARIO', 403, (await S.t1.post(`/api/tasks/${T.id}/status`, { to: 'POR_HACER', location: GPS })).status);
check('Confirmar sin ubicación', 'USUARIO', 400, (await S.t1.post(`/api/tasks/${T.id}/confirmations`, {})).status);
check('SUPERVISOR no asignado confirma', 'SUPERVISOR', 403, (await S.sup.post(`/api/tasks/${T.id}/confirmations`, { location: GPS })).status);

section = '2b Fotos';
for (let i = 1; i <= 4; i++) check(`Foto PNG ${i}`, 'USUARIO', 201, (await S.t1.upload(`/api/tasks/${T.id}/photos`, PHOTO, `foto${i}.png`, 'image/png')).status);
check('Foto JPEG (bytes mágicos) del CLIENTE', 'CLIENTE', 201, (await S.clA.upload(`/api/tasks/${T.id}/photos`, JPEG_HEADER, 'obra.jpg', 'image/jpeg')).status);
check('6.ª foto', 'USUARIO', 409, (await S.t1.upload(`/api/tasks/${T.id}/photos`, PHOTO, 'foto6.png', 'image/png')).status);
r = await S.sup.post('/api/tasks', { projectId: pA2.id, title: 'Tarea para límites de fotos', location: GPS });
const TP = r.json;
check('Texto con extensión .png', 'SUPERVISOR', 415, (await S.sup.upload(`/api/tasks/${TP.id}/photos`, FAKE_PNG, 'falsa.png', 'image/png')).status);
check('Archivo de 10,5 MB', 'SUPERVISOR', 413, (await S.sup.upload(`/api/tasks/${TP.id}/photos`, BIG_10_5, 'grande.png', 'image/png')).status);
check('Archivo de 12 MB (supera límite multipart)', 'SUPERVISOR', 413, (await S.sup.upload(`/api/tasks/${TP.id}/photos`, BIG_12, 'enorme.png', 'image/png')).status);
check('Técnico no asignado sube foto', 'USUARIO', 404, (await S.t1.upload(`/api/tasks/${TP.id}/photos`, PHOTO, 'x.png', 'image/png')).status, 'tarea invisible = 404');
const det = (await S.t1.get(`/api/tasks/${T.id}`)).json;
const ph = det.photos[0];
const phGet = await S.clA.get(`/api/tasks/${T.id}/photos/${ph.id}`);
check('CLIENTE descarga foto', 'CLIENTE', '200 image/png', `${phGet.status} ${phGet.type}`);
check('CLIENTE de otra empresa descarga foto', 'CLIENTE', 404, (await S.clB.get(`/api/tasks/${T.id}/photos/${ph.id}`)).status);

section = '2c Confirmaciones y cierre';
r = await S.t1.post(`/api/tasks/${T.id}/confirmations`, { location: GPS });
check('Técnico 1 confirma → sigue EN_PROCESO', 'USUARIO', 'EN_PROCESO 1/1', `${r.json?.status} ${r.json?.confirmed}/${r.json?.pending}`, 'confirmed/pending');
check('Técnico 1 confirma de nuevo (idempotente)', 'USUARIO', 200, (await S.t1.post(`/api/tasks/${T.id}/confirmations`, { location: GPS })).status);
r = await S.t2.post(`/api/tasks/${T.id}/confirmations`, { location: NOGPS });
check('Técnico 2 confirma sin GPS → FINALIZADO', 'USUARIO', 'FINALIZADO', r.json?.status);
check('Foto en tarea FINALIZADO', 'USUARIO', 400, (await S.t1.upload(`/api/tasks/${T.id}/photos`, PHOTO, 'tarde.png', 'image/png')).status);
check('Facturar sin firma', 'ADMIN', 400, (await admin.post(`/api/tasks/${T.id}/status`, { to: 'FACTURADO', location: GPS })).status);
check('Firma con imagen que no es PNG', 'CLIENTE', 400, (await S.clA.post(`/api/tasks/${T.id}/signature`, { signerName: 'Carla', image: 'data:image/png;base64,' + JPEG_HEADER.toString('base64'), location: GPS })).status);
check('Firma con fecha inválida', 'CLIENTE', 400, (await S.clA.post(`/api/tasks/${T.id}/signature`, { signerName: 'Carla', signedOn: '18/11/2026', image: SIGN_B64, location: GPS })).status);
check('CLIENTE de otra empresa firma', 'CLIENTE', 404, (await S.clB.post(`/api/tasks/${T.id}/signature`, { signerName: 'Hugo', image: SIGN_B64, location: GPS })).status);
r = await S.clA.post(`/api/tasks/${T.id}/signature`, { signerName: 'Carla Cliente', signedOn: '2026-11-18', image: SIGN_B64, location: GPS });
check('CLIENTE firma en remoto', 'CLIENTE', '201 remote=true', `${r.status} remote=${r.json?.remote}`);
check('Segunda firma', 'SUPERVISOR', 409, (await S.sup.post(`/api/tasks/${T.id}/signature`, { signerName: 'Otro', image: SIGN_B64, location: GPS })).status);
const sg = await S.t1.get(`/api/tasks/${T.id}/signature`);
check('Descargar firma vigente', 'USUARIO', '200 image/png', `${sg.status} ${sg.type}`);
check('SUPERVISOR factura — D-207 (corte 3A); hasta v0.2.1 daba 403', 'SUPERVISOR', 'FACTURADO', (await S.sup.post(`/api/tasks/${T.id}/status`, { to: 'FACTURADO', location: GPS })).json?.status);
check('ADMIN factura una tarea ya facturada: 409 YA_CERRADA', 'ADMIN', '409 YA_CERRADA', await admin.post(`/api/tasks/${T.id}/status`, { to: 'FACTURADO', location: GPS }).then((x) => `${x.status} ${x.json?.code}`));
check('FACTURADO es terminal (reabrir)', 'ADMIN', 400, (await admin.post(`/api/tasks/${T.id}/status`, { to: 'EN_PROCESO', location: GPS })).status);
check('FACTURADO es terminal (anular)', 'ADMIN', 400, (await admin.post(`/api/tasks/${T.id}/status`, { to: 'ANULADA', location: GPS })).status);
check('Técnico ya no ve la facturada', 'USUARIO', 404, (await S.t1.get(`/api/tasks/${T.id}`)).status);
check('CLIENTE ya no ve la facturada', 'CLIENTE', 404, (await S.clA.get(`/api/tasks/${T.id}`)).status);
check('SUPERVISOR sí ve la facturada', 'SUPERVISOR', 200, (await S.sup.get(`/api/tasks/${T.id}`)).status);
const full = (await admin.get(`/api/tasks/${T.id}`)).json;
observe('Bitácora: secuencia de eventos', 'ADMIN', full.events.map((e) => e.kind + (e.toStatus ? `→${e.toStatus}` : '')).join(', '));
const conf2 = full.events.find((e) => e.kind === 'CONFIRMACION' && e.locationAbsentReason);
check('Evento sin GPS guarda el motivo', 'ADMIN', NOGPS.absentReason, conf2?.locationAbsentReason);
const asg = full.events.filter((e) => e.kind === 'ASIGNADA');
check('Asignación no registra ubicación', 'ADMIN', 'null', String(asg[0]?.latitude ?? null) + (asg[0]?.locationAbsentReason ? 'motivo' : ''));
fs.writeFileSync(path.join(OUT, 'tarea-ciclo-completo.json'), JSON.stringify(full, null, 2));

// ---------- 3. reopen ----------
section = '3 Reapertura y firma reemplazada';
r = await S.sup.post('/api/tasks', { projectId: pB1.id, title: 'Ajustar parlantes del lobby', location: GPS });
const R = r.json;
await S.sup.post(`/api/tasks/${R.id}/assignments`, { userId: t1.id });
await S.t1.post(`/api/tasks/${R.id}/status`, { to: 'EN_PROCESO', location: GPS });
check('Única confirmación → FINALIZADO', 'USUARIO', 'FINALIZADO', (await S.t1.post(`/api/tasks/${R.id}/confirmations`, { location: GPS })).json?.status);
check('Firma presencial del técnico asignado', 'USUARIO', '201 remote=false', await S.t1.post(`/api/tasks/${R.id}/signature`, { signerName: 'Gerente del hotel', image: SIGN_B64, location: GPS }).then((x) => `${x.status} remote=${x.json?.remote}`));
check('Técnico reabre', 'USUARIO', 403, (await S.t1.post(`/api/tasks/${R.id}/status`, { to: 'EN_PROCESO', location: GPS })).status);
r = await S.sup.post(`/api/tasks/${R.id}/status`, { to: 'EN_PROCESO', location: GPS });
check('SUPERVISOR reabre → confirmaciones limpias y sin firma', 'SUPERVISOR', 'EN_PROCESO c=0 p=1 signed=false', `${r.json?.status} c=${r.json?.confirmed} p=${r.json?.pending} signed=${r.json?.signed}`);
const sigs = (await admin.get(`/api/tasks/${R.id}`)).json.signatures;
check('La firma anterior queda como evidencia', 'ADMIN', '1 current=false', `${sigs.length} current=${sigs[0]?.current}`);
check('Sin firma vigente, GET firma', 'ADMIN', 404, (await admin.get(`/api/tasks/${R.id}/signature`)).status);
check('Firma histórica por id', 'ADMIN', 200, (await admin.get(`/api/tasks/${R.id}/signature?signatureId=${sigs[0].id}`)).status);
check('Reconfirmar → FINALIZADO otra vez', 'USUARIO', 'FINALIZADO', (await S.t1.post(`/api/tasks/${R.id}/confirmations`, { location: GPS })).json?.status);
check('Nueva firma tras reapertura', 'CLIENTE', 201, (await S.clB.post(`/api/tasks/${R.id}/signature`, { signerName: 'Hugo Cliente', image: SIGN_B64, location: NOGPS })).status);
check('Volver a POR_HACER desde FINALIZADO', 'ADMIN', 'POR_HACER signed=false', await admin.post(`/api/tasks/${R.id}/status`, { to: 'POR_HACER', location: GPS }).then((x) => `${x.json?.status} signed=${x.json?.signed}`));

// ---------- 4. cancel ----------
section = '4 Anulación';
r = await S.clA.post('/api/tasks', { projectId: pA2.id, title: 'Pedido del cliente: revisar UPS', location: NOGPS });
check('CLIENTE crea tarea en su proyecto', 'CLIENTE', '201 asignados=0', `${r.status} asignados=${r.json?.assignees?.length}`);
const C = r.json;
check('CLIENTE crea en proyecto ajeno', 'CLIENTE', 400, (await S.clA.post('/api/tasks', { projectId: pB1.id, title: 'X', location: GPS })).status);
check('SUPERVISOR anula', 'SUPERVISOR', 403, (await S.sup.post(`/api/tasks/${C.id}/status`, { to: 'ANULADA', location: GPS })).status);
check('ADMIN anula', 'ADMIN', 'ANULADA', (await admin.post(`/api/tasks/${C.id}/status`, { to: 'ANULADA', location: GPS })).json?.status);
check('Lista normal oculta la anulada (ADMIN)', 'ADMIN', false, (await admin.get('/api/tasks')).json.some((t) => t.id === C.id));
check('ADMIN lista ?status=ANULADA', 'ADMIN', true, (await admin.get('/api/tasks?status=ANULADA')).json.some((t) => t.id === C.id));
check('SUPERVISOR lista ?status=ANULADA', 'SUPERVISOR', 403, (await S.sup.get('/api/tasks?status=ANULADA')).status);
check('CLIENTE ve su tarea anulada', 'CLIENTE', 404, (await S.clA.get(`/api/tasks/${C.id}`)).status);
check('Estado inexistente en filtro', 'ADMIN', 400, (await admin.get('/api/tasks?status=CERRADA')).status);

// ---------- 5. technician-created task ----------
section = '5 Tarea creada por técnico';
r = await S.t2.post('/api/tasks', { projectId: pA1.id, title: 'Reponer conector RJ45 dañado', location: GPS });
check('USUARIO crea y queda autoasignado', 'USUARIO', '201 asignado=Teresa Técnica', `${r.status} asignado=${r.json?.assignees?.map((a) => a.name).join(',')}`);
const U = r.json;
check('Técnico 1 no ve la tarea de técnico 2', 'USUARIO', 404, (await S.t1.get(`/api/tasks/${U.id}`)).status);
check('Técnico 1 en su lista no la ve', 'USUARIO', false, (await S.t1.get('/api/tasks')).json.some((t) => t.id === U.id));
const longTitle = 'x'.repeat(201);
check('Título de 201 caracteres', 'USUARIO', 400, (await S.t2.post('/api/tasks', { projectId: pA1.id, title: longTitle, location: GPS })).status);
check('Título vacío', 'USUARIO', 400, (await S.t2.post('/api/tasks', { projectId: pA1.id, title: '  ', location: GPS })).status);

// ---------- 6. edge cases that can strand a task ----------
section = '6 Casos borde (posibles tareas trabadas)';
r = await admin.post('/api/tasks', { projectId: pA1.id, title: 'Borde: iniciar sin asignados', location: GPS });
const E1 = r.json;
r = await admin.post(`/api/tasks/${E1.id}/status`, { to: 'EN_PROCESO', location: GPS });
check('ADMIN inicia una tarea sin asignados', 'ADMIN', '409 SIN_ASIGNADOS', `${r.status} ${r.json?.code}`, 'D-26 regla 1; el 18/11 era una observación (200 EN_PROCESO)');
check('La tarea sigue en POR_HACER', 'ADMIN', 'POR_HACER', sql(`SELECT status FROM sti.task WHERE id='${E1.id}'`));
// Under rule 1 the task needs an assignee to start; the rule checked here is unchanged: ADMIN not assigned cannot confirm.
await admin.post(`/api/tasks/${E1.id}/assignments`, { userId: t1.id });
await admin.post(`/api/tasks/${E1.id}/status`, { to: 'EN_PROCESO', location: GPS });
check('ADMIN confirma sin estar asignado', 'ADMIN', 403, (await admin.post(`/api/tasks/${E1.id}/confirmations`, { location: GPS })).status);

r = await admin.post('/api/tasks', { projectId: pA1.id, title: 'Borde: desasignar al último pendiente', location: GPS });
const E2 = r.json;
await admin.post(`/api/tasks/${E2.id}/assignments`, { userId: t1.id });
await admin.post(`/api/tasks/${E2.id}/assignments`, { userId: t2.id });
await S.t1.post(`/api/tasks/${E2.id}/status`, { to: 'EN_PROCESO', location: GPS });
await S.t1.post(`/api/tasks/${E2.id}/confirmations`, { location: GPS });
r = await S.sup.del(`/api/tasks/${E2.id}/assignments/${t2.id}`);
check('Desasignar al técnico pendiente (el otro ya confirmó) → FINALIZADO', 'SUPERVISOR', '200 FINALIZADO', `${r.status} ${r.json?.status}`, 'D-26 regla 2; el 18/11 quedaba EN_PROCESO con todo confirmado (N-14)');
const fin2 = sql(`SELECT a.email || '|' || s.email FROM sti.task_event e JOIN sti.app_user a ON a.id = e.actor_id JOIN sti.app_user s ON s.id = e.subject_id WHERE e.task_id='${E2.id}' AND e.kind='ESTADO' AND e.to_status='FINALIZADO'`);
check('La bitácora dice quién la finalizó y a quién quitó', 'SUPERVISOR', `${sup.email}|${t2.email}`, fin2);
check('El que queda ya no tiene nada que confirmar', 'USUARIO', 400, (await S.t1.post(`/api/tasks/${E2.id}/confirmations`, { location: GPS })).status, 'la tarea ya no está EN_PROCESO');

r = await admin.post('/api/tasks', { projectId: pA1.id, title: 'Borde: desasignar a todos en curso', location: GPS });
const E3 = r.json;
await admin.post(`/api/tasks/${E3.id}/assignments`, { userId: t1.id });
await S.t1.post(`/api/tasks/${E3.id}/status`, { to: 'EN_PROCESO', location: GPS });
r = await admin.del(`/api/tasks/${E3.id}/assignments/${t1.id}`);
check('Desasignar al único técnico de una tarea EN_PROCESO', 'ADMIN', '409 ULTIMO_ASIGNADO', `${r.status} ${r.json?.code}`, 'D-26 regla 3; el 18/11 era una observación');
check('Nada cambió', 'ADMIN', 'EN_PROCESO|1', sql(`SELECT t.status || '|' || (SELECT count(*) FROM sti.task_assignment a WHERE a.task_id=t.id) FROM sti.task t WHERE t.id='${E3.id}'`));

// ---------- 7. sessions ----------
section = '7 Sesión';
const tmp = new Session('tmp');
await tmp.login(t1.email, t1.password);
const stolen = tmp.cookieHeader();
check('Logout', 'USUARIO', 204, (await tmp.raw('POST', '/api/auth/logout')).status);
const replay = await fetch(BASE + '/api/auth/me', { headers: { cookie: stolen } });
check('Cookie vieja tras logout', 'USUARIO', 401, replay.status);
const exp = new Session('exp');
await exp.login(t2.email, t2.password);
check('Sesión válida antes de expirar', 'USUARIO', 200, (await exp.get('/api/auth/me')).status);
try {
  const out = sql("DELETE FROM sti.spring_session WHERE principal_name = 'tecnico2@example.invalid' RETURNING 1");
  observe('Sesiones borradas en la base para simular expiración', 'sistema', out.split(/\r?\n/).filter(Boolean).length);
  check('Sesión expirada: GET /api/auth/me', 'USUARIO', 401, (await exp.get('/api/auth/me')).status);
  const w = await exp.post('/api/tasks', { projectId: pA1.id, title: 'tras expirar', location: GPS });
  check('Sesión expirada: escritura con CSRF nuevo', 'USUARIO', 401, w.status);
} catch (e) { observe('Simular expiración', 'sistema', 'no se pudo: ' + e.message.split('\n')[0]); }
check('Las otras sesiones siguen vivas', 'USUARIO', 200, (await S.t1.get('/api/auth/me')).status);


// ---------- 7b. concurrency: 8 rounds, independent sessions, state read from the database ----------
section = '7b Concurrencia (10 vueltas, sesiones independientes)';
const ROUNDS = 10;
const fresh = async (acc) => { const x = new Session(acc.email); await x.login(acc.email, acc.password); return x; };
{
  let stuck = 0, finished = 0, doubleFin = 0;
  for (let i = 0; i < ROUNDS; i++) {
    const t = (await admin.post('/api/tasks', { projectId: pA1.id, title: `Conc confirmaciones ${i}`, location: GPS })).json;
    await admin.post(`/api/tasks/${t.id}/assignments`, { userId: t1.id });
    await admin.post(`/api/tasks/${t.id}/assignments`, { userId: t2.id });
    await admin.post(`/api/tasks/${t.id}/status`, { to: 'EN_PROCESO', location: GPS });
    const [a, b] = [await fresh(t1), await fresh(t2)];
    await a.refreshCsrf(); await b.refreshCsrf();
    await Promise.all([a.post(`/api/tasks/${t.id}/confirmations`, { location: GPS }), b.post(`/api/tasks/${t.id}/confirmations`, { location: GPS })]);
    const st = sql(`SELECT t.status || '|' || (SELECT count(*) FROM sti.task_assignment a WHERE a.task_id=t.id AND a.confirmed_at IS NULL) || '|' || (SELECT count(*) FROM sti.task_event e WHERE e.task_id=t.id AND e.to_status='FINALIZADO') FROM sti.task t WHERE t.id='${t.id}'`);
    const [status, pending, fins] = st.split('|');
    if (status === 'FINALIZADO') finished++; else if (pending === '0') stuck++;
    if (Number(fins) > 1) doubleFin++;
  }
  check('Dos técnicos confirman a la vez → FINALIZADO', 'USUARIO', `${ROUNDS}/${ROUNDS}`, `${finished}/${ROUNDS}`, `trabadas (todo confirmado, EN_PROCESO): ${stuck}; doble evento FINALIZADO: ${doubleFin}`);
}
{
  let over = 0, maxSeen = 0, codes = {};
  for (let i = 0; i < ROUNDS; i++) {
    const t = (await admin.post('/api/tasks', { projectId: pA2.id, title: `Conc fotos ${i}`, location: GPS })).json;
    for (let k = 0; k < 4; k++) await admin.upload(`/api/tasks/${t.id}/photos`, PHOTO, 'p.png', 'image/png');
    const ss = await Promise.all([admin, S.sup, S.clA, S.clA].map(async (_, j) => j === 0 ? fresh({ email: creds.adminEmail, password: creds.adminPassword }) : j === 1 ? fresh(sup) : fresh(clA)));
    const res = await Promise.all(ss.map((x) => x.upload(`/api/tasks/${t.id}/photos`, PHOTO, 'c.png', 'image/png')));
    for (const x of res) codes[x.status] = (codes[x.status] ?? 0) + 1;
    const n = Number(sql(`SELECT count(*) FROM sti.task_photo WHERE task_id='${t.id}'`));
    maxSeen = Math.max(maxSeen, n); if (n > 5) over++;
  }
  check('4 subidas simultáneas sobre 4 fotos → máximo 5', 'varios', `0/${ROUNDS} con más de 5`, `${over}/${ROUNDS} con más de 5`, `máximo visto en base: ${maxSeen}; códigos: ${JSON.stringify(codes)}`);
}
{
  let codes = {}, multi = 0;
  for (let i = 0; i < ROUNDS; i++) {
    const t = (await admin.post('/api/tasks', { projectId: pA1.id, title: `Conc firmas ${i}`, location: GPS })).json;
    await admin.post(`/api/tasks/${t.id}/assignments`, { userId: t1.id });
    await S.t1.post(`/api/tasks/${t.id}/status`, { to: 'EN_PROCESO', location: GPS });
    await S.t1.post(`/api/tasks/${t.id}/confirmations`, { location: GPS });
    const [a, b] = [await fresh(clA), await fresh(sup)];
    const res = await Promise.all([a, b].map((x) => x.post(`/api/tasks/${t.id}/signature`, { signerName: 'Firma concurrente', image: SIGN_B64, location: GPS })));
    for (const x of res) codes[x.status] = (codes[x.status] ?? 0) + 1;
    if (Number(sql(`SELECT count(*) FROM sti.task_signature WHERE task_id='${t.id}' AND superseded_at IS NULL`)) !== 1) multi++;
  }
  check('Dos firmas simultáneas → una vigente, la otra 409', 'varios', `{"201":${ROUNDS},"409":${ROUNDS}}`, JSON.stringify(codes), `tareas con ≠1 firma vigente: ${multi}`);
}

// ---------- 8. board seed for the UI ----------
section = '8 Tablero para la UI';
S.t2 = await fresh(t2);
const board = [];
const task = async (who, projectId, title, detail) => (await who.post('/api/tasks', { projectId, title, detail, location: GPS })).json;
const go = (who, id, to, loc = GPS) => who.post(`/api/tasks/${id}/status`, { to, location: loc });
const b1 = await task(S.sup, pA1.id, 'Relevar cobertura de cámaras en estacionamiento', 'Visita con el jefe de obra.'); board.push(b1);
await S.sup.post(`/api/tasks/${b1.id}/assignments`, { userId: t1.id });
const b2 = await task(S.clA, pA2.id, 'Pedido: punto de red extra en oficina técnica', 'Lo solicita la administración de obra.'); board.push(b2);
const b3 = await task(S.sup, pB1.id, 'Cambiar amplificador del salón principal', null); board.push(b3);
await S.sup.post(`/api/tasks/${b3.id}/assignments`, { userId: t1.id }); await S.sup.post(`/api/tasks/${b3.id}/assignments`, { userId: t2.id });
await go(S.t1, b3.id, 'EN_PROCESO'); await S.t2.post(`/api/tasks/${b3.id}/confirmations`, { location: GPS });
const b4 = await task(S.t1, pA1.id, 'Peinado de rack piso 2', 'Etiquetar patch cords.'); board.push(b4);
await go(S.t1, b4.id, 'EN_PROCESO'); await S.t1.upload(`/api/tasks/${b4.id}/photos`, PHOTO, 'rack.png', 'image/png');
const b5 = await task(S.sup, pA2.id, 'Tendido de fibra entre obrador y portería', null); board.push(b5);
await S.sup.post(`/api/tasks/${b5.id}/assignments`, { userId: t2.id }); await go(S.t2, b5.id, 'EN_PROCESO'); await S.t2.post(`/api/tasks/${b5.id}/confirmations`, { location: GPS });
const b6 = await task(S.sup, pB1.id, 'Prueba de sonido en habitaciones 101-110', null); board.push(b6);
await S.sup.post(`/api/tasks/${b6.id}/assignments`, { userId: t1.id }); await go(S.t1, b6.id, 'EN_PROCESO'); await S.t1.post(`/api/tasks/${b6.id}/confirmations`, { location: GPS });
await S.clB.post(`/api/tasks/${b6.id}/signature`, { signerName: 'Hugo Cliente', image: SIGN_B64, location: GPS });
const b7 = await task(S.sup, pA1.id, 'Configurar NVR y grabación 30 días', null); board.push(b7);
await S.sup.post(`/api/tasks/${b7.id}/assignments`, { userId: t1.id }); await go(S.t1, b7.id, 'EN_PROCESO'); await S.t1.post(`/api/tasks/${b7.id}/confirmations`, { location: GPS });
await S.clA.post(`/api/tasks/${b7.id}/signature`, { signerName: 'Carla Cliente', image: SIGN_B64, location: GPS }); await go(admin, b7.id, 'FACTURADO');
const b8 = await task(S.sup, pA2.id, 'Montaje de soporte de TV en sala de reuniones', null); board.push(b8);
const fin = {};
for (const t of board) fin[t.title] = (await admin.get(`/api/tasks/${t.id}`)).json.status;
observe('Estados del tablero sembrado', 'ADMIN', Object.entries(fin).map(([k, v]) => `${v}: ${k}`).join(' | '));

// ---------- 9. accounts (corte 2): every new operation, four roles and no session ----------
section = '9 Cuentas';
{
  const anon = new Session('anónimo');
  const roles = [['ADMIN', admin], ['SUPERVISOR', S.sup], ['USUARIO', S.t1], ['CLIENTE', S.clA], ['anónimo', anon]];
  const deny = (who, okStatus) => (who === 'ADMIN' ? okStatus : who === 'anónimo' ? 401 : 403);
  const put = (s, id, body) => s.raw('PUT', `/api/accounts/${id}`, { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
  const coded = (x) => `${x.status} ${x.json?.code}`;
  const target = (await admin.post('/api/accounts', { name: 'Cuenta objetivo', email: 'objetivo@example.invalid', role: 'USUARIO' })).json.account;
  const slug = { ADMIN: 'admin', SUPERVISOR: 'supervisor', USUARIO: 'usuario', CLIENTE: 'cliente', 'anónimo': 'anonimo' };
  for (const [who, s] of roles) {
    check('GET /api/accounts', who, deny(who, 200), (await s.get('/api/accounts')).status);
    check('GET /api/accounts/{id}', who, deny(who, 200), (await s.get(`/api/accounts/${target.id}`)).status);
    check('POST /api/accounts', who, deny(who, 201), (await s.post('/api/accounts', { name: 'Alta ' + who, email: `alta.${slug[who]}@example.invalid`, role: 'USUARIO' })).status);
    check('PUT /api/accounts/{id}', who, deny(who, 200), (await put(s, target.id, { phone: '021 555 000' })).status);
    check('POST /api/accounts/{id}/password-reset', who, deny(who, 200), (await s.post(`/api/accounts/${target.id}/password-reset`, {})).status);
    check('GET /api/operators?includeInactive=true', who, deny(who, 200), (await s.get('/api/operators?includeInactive=true')).status, 'D-86');
  }

  // Own password: every role changes it with the current one and goes back to the run's password.
  const other = 'Otra-' + crypto.randomBytes(12).toString('base64url');
  for (const [who, s] of roles.filter(([w]) => w !== 'ADMIN')) {
    if (who === 'anónimo') {
      check('POST /api/auth/password', who, 401, (await s.post('/api/auth/password', { currentPassword: FAKE_PASSWORD, newPassword: other })).status);
      continue;
    }
    const there = (await s.post('/api/auth/password', { currentPassword: s.acc.password, newPassword: other })).status;
    const back = (await s.post('/api/auth/password', { currentPassword: other, newPassword: s.acc.password })).status;
    check('POST /api/auth/password (ida y vuelta)', who, '204 204', `${there} ${back}`);
  }
  check('Cambio con la contraseña actual equivocada', 'USUARIO', '400 CONTRASENA_ACTUAL', coded(await S.t1.post('/api/auth/password', { currentPassword: 'equivocada-1234', newPassword: other })));
  check('Cambio con 11 caracteres', 'USUARIO', '400 CONTRASENA_CORTA', coded(await S.t1.post('/api/auth/password', { currentPassword: FAKE_PASSWORD, newPassword: '12345678901' })));
  check('Cambio a la misma contraseña', 'USUARIO', '400 CONTRASENA_IGUAL', coded(await S.t1.post('/api/auth/password', { currentPassword: FAKE_PASSWORD, newPassword: FAKE_PASSWORD })));

  // Initial password in force (D-86): only csrf, me, password change and logout.
  const created = await admin.post('/api/accounts', { name: 'Recién creada', email: 'recien@example.invalid', role: 'SUPERVISOR' });
  check('Respuesta del alta sin caché', 'ADMIN', true, /no-store/.test(created.cacheControl ?? ''));
  const nu = new Session('recién');
  check('Ingreso con la contraseña inicial', 'SUPERVISOR', 204, await nu.login('recien@example.invalid', created.json.initialPassword));
  check('Con contraseña inicial: GET /api/auth/csrf', 'SUPERVISOR', 200, (await nu.get('/api/auth/csrf')).status);
  check('Con contraseña inicial: GET /api/auth/me', 'SUPERVISOR', true, (await nu.get('/api/auth/me')).json?.mustChangePassword);
  for (const url of ['/api/tasks', '/api/projects', '/api/clients', '/api/operators', '/api/accounts']) {
    check(`Con contraseña inicial: GET ${url}`, 'SUPERVISOR', '403 CAMBIO_DE_CONTRASENA', coded(await nu.get(url)));
  }
  check('Con contraseña inicial: POST /api/tasks', 'SUPERVISOR', '403 CAMBIO_DE_CONTRASENA', coded(await nu.post('/api/tasks', { projectId: pA1.id, title: 'no debe crearse', location: GPS })));
  check('No se creó la tarea', 'sistema', 0, Number(sql("SELECT count(*) FROM sti.task WHERE title = 'no debe crearse'")));
  check('Con contraseña inicial: logout', 'SUPERVISOR', 204, (await nu.raw('POST', '/api/auth/logout')).status);

  // Reset: the old password stops working, open sessions end, the change is asked again.
  await firstSignIn('objetivo@example.invalid', (await admin.post(`/api/accounts/${target.id}/password-reset`, {})).json.initialPassword, FAKE_PASSWORD);
  const live = new Session('objetivo');
  await live.login('objetivo@example.invalid', FAKE_PASSWORD);
  const reset = await admin.post(`/api/accounts/${target.id}/password-reset`, {});
  check('Restablecer', 'ADMIN', 200, reset.status);
  check('Sesión abierta tras restablecer', 'USUARIO', 401, (await live.get('/api/auth/me')).status);
  check('Contraseña anterior tras restablecer', 'USUARIO', 401, await new Session('x').login('objetivo@example.invalid', FAKE_PASSWORD));
  await firstSignIn('objetivo@example.invalid', reset.json.initialPassword, FAKE_PASSWORD);

  // Deactivation ends the open session on the next request; reactivation lets the person in again.
  const open = new Session('objetivo');
  await open.login('objetivo@example.invalid', FAKE_PASSWORD);
  check('Desactivar', 'ADMIN', 200, (await put(admin, target.id, { active: false })).status);
  check('Sesión abierta de la persona desactivada', 'USUARIO', 401, (await open.get('/api/tasks')).status);
  check('Ingreso de la persona desactivada', 'USUARIO', 401, await new Session('y').login('objetivo@example.invalid', FAKE_PASSWORD));
  check('No se ofrece para asignar', 'SUPERVISOR', false, (await S.sup.get('/api/operators')).json.some((o) => o.id === target.id));
  check('ADMIN la ve entre los inactivos', 'ADMIN', false, (await admin.get('/api/operators?includeInactive=true')).json.find((o) => o.id === target.id)?.active);
  check('Reactivar', 'ADMIN', 200, (await put(admin, target.id, { active: true })).status);
  check('Ingreso tras reactivar', 'USUARIO', 204, await new Session('z').login('objetivo@example.invalid', FAKE_PASSWORD));

  // Rule 6 and D-83 on oneself and on a person with open tasks.
  const me = (await admin.get('/api/auth/me')).json;
  check('ADMIN cambia su propio rol', 'ADMIN', '409 PROPIO_ROL', coded(await put(admin, me.id, { role: 'SUPERVISOR' })));
  check('ADMIN se desactiva a sí mismo', 'ADMIN', '409 PROPIA_CUENTA', coded(await put(admin, me.id, { active: false })));
  check('ADMIN restablece su propia contraseña', 'ADMIN', '409 PROPIA_CONTRASENA', coded(await admin.post(`/api/accounts/${me.id}/password-reset`, {})), 'D-83');
  check('Pasar a CLIENTE con tareas abiertas', 'ADMIN', '409 TAREAS_ABIERTAS', coded(await put(admin, t1.id, { role: 'CLIENTE', clientId: cA.id })));
  check('Correo en uso', 'ADMIN', '409 CORREO_EN_USO', coded(await put(admin, target.id, { email: 'TECNICO2@example.invalid' })));
  check('Teléfono inválido', 'ADMIN', '400 TELEFONO', coded(await put(admin, target.id, { phone: '0981-ABC' })));

  // Rule 10: the log names who and what, and never a password or a hash.
  check('Bitácora sin contraseñas ni hashes', 'sistema', 0, Number(sql(`SELECT count(*) FROM sti.account_event WHERE changes::text ILIKE '%password%' OR changes::text LIKE '%$2a$%' OR strpos(changes::text, '${FAKE_PASSWORD}') > 0 OR strpos(changes::text, '${other}') > 0`)));
  const actor = `CASE WHEN e.actor_id = e.account_id THEN 'propia' WHEN u.email = '${creds.adminEmail.toLowerCase()}' THEN 'ADMIN' ELSE 'otro' END`;
  check('Bitácora de la cuenta objetivo (qué y quién)', 'sistema',
    'ALTA:ADMIN,EDICION:ADMIN,RESTABLECIMIENTO:ADMIN,RESTABLECIMIENTO:ADMIN,CAMBIO_CONTRASENA:propia,RESTABLECIMIENTO:ADMIN,CAMBIO_CONTRASENA:propia,DESACTIVACION:ADMIN,ACTIVACION:ADMIN',
    sql(`SELECT string_agg(e.kind || ':' || ${actor}, ',' ORDER BY e.occurred_at) FROM sti.account_event e JOIN sti.app_user u ON u.id = e.actor_id WHERE e.account_id = '${target.id}'`),
    'los intentos de los otros roles no dejaron registro');
}

// ---------- 10. corte 2B (ENCARGO-DEV-003): recover the password and brake the attempts ----------
section = '10 Recuperar contraseña y frenos (corte 2B)';
{
  const anon = new Session('anónimo');
  const roles = [['ADMIN', admin], ['SUPERVISOR', S.sup], ['USUARIO', S.t1], ['CLIENTE', S.clA], ['anónimo', anon]];
  const coded = (x) => `${x.status} ${x.json?.code}`;
  const sha = (token) => crypto.createHash('sha256').update(token).digest('hex');
  const newToken = () => crypto.randomBytes(32).toString('base64url');
  const form = (email, password) => ({ body: new URLSearchParams({ username: email, password }).toString(), headers: { 'content-type': 'application/x-www-form-urlencoded' } });
  // The mail is out of this matrix's reach (every fake account has a reserved domain), so the link that the mail
  // would carry is made as the worker does: a token, only its hash in the table, 30 minutes of life.
  const plantLink = (accountId) => {
    const token = newToken();
    sql(`INSERT INTO sti.password_reset_token (id, account_id, token_hash, expires_at) VALUES (gen_random_uuid(), '${accountId}', decode('${sha(token)}', 'hex'), clock_timestamp() + interval '30 minutes')`);
    return token;
  };
  const DEAD = '400 ENLACE_INVALIDO';

  // The three new addresses with the four roles and without a session: open to all, the same answer.
  for (const [who, s] of roles) {
    const tag = who === 'anónimo' ? 'anon' : who.toLowerCase();
    check('POST /api/auth/password-recovery', who, 202, (await s.post('/api/auth/password-recovery', { email: `nadie.${tag}@example.invalid` })).status);
    check('POST /api/auth/password-recovery/check (enlace inventado)', who, DEAD, coded(await s.post('/api/auth/password-recovery/check', { token: newToken() })));
    check('POST /api/auth/password-recovery/confirm (enlace inventado)', who, DEAD, coded(await s.post('/api/auth/password-recovery/confirm', { token: newToken(), newPassword: FAKE_PASSWORD + 'x' })));
    const wrong = await s.get('/api/auth/password-recovery');
    check('GET /api/auth/password-recovery (método no admitido)', who, '405 JSON propio', `${wrong.status} ${wrong.type?.includes('json') && wrong.json?.status === 405 ? 'JSON propio' : wrong.type}`);
  }

  // Rule 1: the same status, type and size for an email with account, without account, inactive and empty.
  const ghost = 'fantasma@example.invalid';
  const active = (await admin.post('/api/accounts', { name: 'Cuenta activa', email: 'activa@example.invalid', role: 'USUARIO' })).json.account;
  const off = (await admin.post('/api/accounts', { name: 'Cuenta inactiva', email: 'inactiva@example.invalid', role: 'USUARIO' })).json.account;
  await admin.raw('PUT', `/api/accounts/${off.id}`, { body: JSON.stringify({ active: false }), headers: { 'content-type': 'application/json' } });
  const answers = [];
  for (const email of [active.email, off.email, ghost, '']) {
    const r = await anon.post('/api/auth/password-recovery', { email });
    answers.push(`${r.status}|${r.type}|${r.bytes.length}`);
  }
  check('Misma respuesta (estado, tipo y tamaño) con cuenta, inactiva, sin cuenta y vacío', 'anónimo', 1, new Set(answers).size, answers[0]);
  check('Fila de la cuenta activa (dominio reservado)', 'sistema', 'OMITIDO DOMINIO_RESERVADO', sql(`SELECT status || ' ' || reason FROM sti.mail_outbox WHERE account_id = '${active.id}' ORDER BY created_at DESC LIMIT 1`));
  check('Fila de la cuenta inactiva', 'sistema', 'OMITIDO CUENTA_INACTIVA', sql(`SELECT status || ' ' || reason FROM sti.mail_outbox WHERE account_id = '${off.id}' ORDER BY created_at DESC LIMIT 1`));
  check('Fila sin cuenta: sin cuenta y sin texto', 'sistema', 'OMITIDO SIN_CUENTA NULL', sql(`SELECT status || ' ' || reason || ' ' || coalesce(account_id::text, 'NULL') FROM sti.mail_outbox WHERE account_id IS NULL ORDER BY created_at DESC LIMIT 1`));
  check('La cola no tiene columna con el correo escrito, un hash ni un token', 'sistema', 0, Number(sql(`SELECT count(*) FROM information_schema.columns WHERE table_schema = 'sti' AND table_name IN ('mail_outbox', 'mail_attempt') AND (column_name ILIKE '%mail%' OR column_name ILIKE '%address%' OR column_name ILIKE '%hash%' OR column_name ILIKE '%token%')`)));
  check('Ninguna fila quedó pendiente (dominio reservado)', 'sistema', 0, Number(sql(`SELECT count(*) FROM sti.mail_outbox WHERE status = 'PENDIENTE'`)));

  // Block by email (N-30): 5 failures in a row block 15 minutes, for an account and for an email nobody has.
  const brake = (await admin.post('/api/accounts', { name: 'Cuenta de freno', email: 'freno@example.invalid', role: 'USUARIO' })).json;
  await firstSignIn('freno@example.invalid', brake.initialPassword, FAKE_PASSWORD);
  const run = async (email, password, n) => {
    const out = [];
    for (let i = 0; i < n; i++) out.push(await new Session('freno').login(email, password));
    return out.join(' ');
  };
  check('Cuenta existente: 4 fallos dan 401 y el 5.º da 429', 'USUARIO', '401 401 401 401 429', await run('freno@example.invalid', 'mala-contrasena-1', 5));
  check('Correo inexistente: lo mismo, 4 fallos y el 5.º', 'anónimo', '401 401 401 401 429', await run('nadie-freno@example.invalid', 'mala-contrasena-1', 5));
  const blockedReal = await new Session('b').raw('POST', '/api/auth/login', form('freno@example.invalid', FAKE_PASSWORD));
  const blockedGhost = await new Session('b').raw('POST', '/api/auth/login', form('nadie-freno@example.invalid', FAKE_PASSWORD));
  check('Bloqueada: la contraseña correcta también se rechaza (429)', 'USUARIO', '429 DEMASIADOS_INTENTOS', coded(blockedReal));
  check('Mismo mensaje exista o no la cuenta', 'anónimo', JSON.stringify(blockedReal.json), JSON.stringify(blockedGhost.json), blockedReal.json?.message);
  let lockEvents = 0;
  for (let i = 0; i < 20 && lockEvents < 1; i++) {
    lockEvents = Number(sql(`SELECT count(*) FROM sti.account_event WHERE account_id = (SELECT id FROM sti.app_user WHERE email = 'freno@example.invalid') AND kind = 'BLOQUEO_INGRESO'`));
    if (!lockEvents) await new Promise((r) => setTimeout(r, 250));
  }
  check('El bloqueo queda en la bitácora de la cuenta, una vez', 'sistema', 1, lockEvents);
  check('La bitácora del bloqueo no guarda contraseñas', 'sistema', 0, Number(sql(`SELECT count(*) FROM sti.account_event WHERE kind = 'BLOQUEO_INGRESO' AND (changes::text ILIKE '%mala-contrasena%' OR changes::text ILIKE '%password%')`)));
  check('Pedir el enlace durante el bloqueo funciona', 'anónimo', 202, (await anon.post('/api/auth/password-recovery', { email: 'freno@example.invalid' })).status);

  // Choosing the new password with the link: lifts the block, ends sessions, voids the link.
  const brakeId = sql(`SELECT id FROM sti.app_user WHERE email = 'freno@example.invalid'`);
  sql(`INSERT INTO sti.spring_session (primary_id, session_id, creation_time, last_access_time, max_inactive_interval, expiry_time, principal_name) VALUES (gen_random_uuid()::text, gen_random_uuid()::text, (extract(epoch FROM now()) * 1000)::bigint, (extract(epoch FROM now()) * 1000)::bigint, 1800, ((extract(epoch FROM now()) + 1800) * 1000)::bigint, 'freno@example.invalid')`);
  check('Hay una sesión abierta de la cuenta antes de recuperar', 'sistema', 1, Number(sql(`SELECT count(*) FROM sti.spring_session WHERE principal_name = 'freno@example.invalid'`)));
  const token = plantLink(brakeId);
  const nueva = 'Nueva-' + crypto.randomBytes(12).toString('base64url');
  check('Enlace vigente: check', 'anónimo', 204, (await anon.post('/api/auth/password-recovery/check', { token })).status);
  check('Contraseña de 11 caracteres', 'anónimo', '400 CONTRASENA_CORTA', coded(await anon.post('/api/auth/password-recovery/confirm', { token, newPassword: '12345678901' })));
  check('El enlace sigue vivo tras un rechazo por contraseña corta', 'anónimo', 204, (await anon.post('/api/auth/password-recovery/check', { token })).status);
  check('Guardar la contraseña nueva', 'anónimo', 204, (await anon.post('/api/auth/password-recovery/confirm', { token, newPassword: nueva })).status);
  check('El enlace no sirve de nuevo (un solo uso)', 'anónimo', DEAD, coded(await anon.post('/api/auth/password-recovery/confirm', { token, newPassword: nueva + 'x' })));
  check('Se cerraron todas las sesiones de la cuenta', 'sistema', 0, Number(sql(`SELECT count(*) FROM sti.spring_session WHERE principal_name = 'freno@example.invalid'`)));
  check('No inicia sesión sola: quien guardó sigue sin sesión', 'anónimo', 401, (await anon.get('/api/auth/me')).status);
  check('La contraseña anterior ya no sirve', 'USUARIO', 401, await new Session('o').login('freno@example.invalid', FAKE_PASSWORD));
  check('La nueva abre aunque la cuenta estaba bloqueada (bloqueo levantado)', 'USUARIO', 204, await new Session('n').login('freno@example.invalid', nueva));
  check('Bitácora: recuperación por correo', 'sistema', 1, Number(sql(`SELECT count(*) FROM sti.account_event WHERE account_id = '${brakeId}' AND kind = 'RECUPERACION_CORREO'`)));
  check('Bitácora de recuperación sin contraseña ni token', 'sistema', 0, Number(sql(`SELECT count(*) FROM sti.account_event WHERE kind = 'RECUPERACION_CORREO' AND (strpos(changes::text, '${nueva}') > 0 OR strpos(changes::text, '${token}') > 0 OR changes::text ILIKE '%password%')`)));

  // An account with the initial password still in force: recovering removes the mark.
  const fresh = (await admin.post('/api/accounts', { name: 'Cuenta inicial', email: 'inicial@example.invalid', role: 'USUARIO' })).json;
  check('Alta con cambio obligatorio', 'sistema', 't', sql(`SELECT must_change_password FROM sti.app_user WHERE id = '${fresh.account.id}'`));
  const t2 = plantLink(fresh.account.id);
  check('Recuperar con el cambio obligatorio pendiente', 'anónimo', 204, (await anon.post('/api/auth/password-recovery/confirm', { token: t2, newPassword: nueva })).status);
  check('Marca de contraseña inicial retirada', 'sistema', 'f', sql(`SELECT must_change_password FROM sti.app_user WHERE id = '${fresh.account.id}'`));
  check('La contraseña inicial ya no sirve', 'USUARIO', 401, await new Session('i').login('inicial@example.invalid', fresh.initialPassword));

  // A link of an account switched off does not serve; an absurdly long email gets the same answer.
  const t3 = plantLink(off.id);
  check('Enlace de una cuenta inactiva', 'anónimo', DEAD, coded(await anon.post('/api/auth/password-recovery/check', { token: t3 })));
  check('Correo de 400 caracteres: misma respuesta, sin error', 'anónimo', 202, (await anon.post('/api/auth/password-recovery', { email: 'a'.repeat(400) + '@example.invalid' })).status);

  // The error pages: the application's own JSON, never the tool's page.
  for (const [who, s] of roles) {
    const nf = await s.get('/api/no-existe');
    check('GET /api/no-existe: JSON propio sin HTML', who, who === 'anónimo' ? '401 json' : '404 json', `${nf.status} ${nf.type?.includes('json') && !/<html/i.test(nf.bytes.toString()) ? 'json' : nf.type}`);
    const bad = await s.raw('DELETE', '/api/auth/csrf');
    check('DELETE /api/auth/csrf: JSON propio sin HTML', who, 'json', bad.type?.includes('json') && !/<html/i.test(bad.bytes.toString()) ? 'json' : `${bad.status} ${bad.type}`);
  }
  const health = await anon.get('/api/health');
  check('/api/health no dice de qué commit salió', 'anónimo', 0, (health.bytes.toString().match(/commit|git|sha/gi) ?? []).length);
}

// ---------- 11. closing (corte 3A, R-23): not billable, invoicing by SUPERVISOR, back to finished ----------
section = '11 Cierre: no facturable y volver a Finalizadas (corte 3A)';
{
  const anon = new Session('anónimo');
  const st = (x) => x.json?.status ?? `${x.status} ${x.json?.code ?? ''}`.trim();
  const finished = async (title) => {
    const t = (await admin.post('/api/tasks', { projectId: pA1.id, title, location: GPS })).json;
    await admin.post(`/api/tasks/${t.id}/assignments`, { userId: t1.id });
    await S.t1.post(`/api/tasks/${t.id}/status`, { to: 'EN_PROCESO', location: GPS });
    await S.t1.post(`/api/tasks/${t.id}/confirmations`, { location: GPS });
    return t;
  };
  const close = (who, id, to, reason) => who.post(`/api/tasks/${id}/status`, { to, location: GPS, ...(reason ? { reason } : {}) });
  const row = (id) => sql(`SELECT status || ' ' || coalesce(closing_reason, '-') FROM sti.task WHERE id = '${id}'`);
  const supId = sql(`SELECT id FROM sti.app_user WHERE email = '${sup.email}'`);
  const N = await finished('Cierre: mantenimiento interno del rack');

  // Permissions: four roles and no session.
  check('No facturable sin sesión', 'anónimo', 401, (await close(anon, N.id, 'NO_FACTURABLE', 'USO_INTERNO')).status);
  check('No facturable', 'USUARIO', 403, (await close(S.t1, N.id, 'NO_FACTURABLE', 'USO_INTERNO')).status);
  check('No facturable', 'CLIENTE', 403, (await close(S.clA, N.id, 'NO_FACTURABLE', 'USO_INTERNO')).status);
  check('No facturable, cliente de otra empresa', 'CLIENTE', 404, (await close(S.clB, N.id, 'NO_FACTURABLE', 'USO_INTERNO')).status);
  // Rules.
  check('Sin motivo', 'SUPERVISOR', '400 MOTIVO_INVALIDO', st(await close(S.sup, N.id, 'NO_FACTURABLE')));
  check('Motivo fuera de la lista', 'SUPERVISOR', '400 MOTIVO_INVALIDO', st(await close(S.sup, N.id, 'NO_FACTURABLE', 'CORTESIA')));
  check('Motivo al facturar (no corresponde)', 'SUPERVISOR', '400 MOTIVO_INVALIDO', st(await close(S.sup, N.id, 'FACTURADO', 'GARANTIA')));
  check('Facturar sin firma', 'SUPERVISOR', 400, (await close(S.sup, N.id, 'FACTURADO')).status);
  const open = (await admin.post('/api/tasks', { projectId: pA1.id, title: 'Cierre: tarea abierta', location: GPS })).json;
  check('No facturable desde Por hacer', 'ADMIN', 400, (await close(admin, open.id, 'NO_FACTURABLE', 'USO_INTERNO')).status);
  check('Volver a Finalizadas desde Finalizada', 'ADMIN', '409 YA_FINALIZADA', st(await close(admin, N.id, 'FINALIZADO')));
  check('No facturable sin firma (uso interno)', 'SUPERVISOR', 'NO_FACTURABLE', st(await close(S.sup, N.id, 'NO_FACTURABLE', 'USO_INTERNO')));
  check('En la base: estado y motivo', 'sistema', 'NO_FACTURABLE USO_INTERNO', row(N.id));
  check('En el historial: quién, cuándo y por qué', 'sistema', `${supId} USO_INTERNO true`, sql(`SELECT actor_id || ' ' || closing_reason || ' ' || (occurred_at IS NOT NULL) FROM sti.task_event WHERE task_id = '${N.id}' AND to_status = 'NO_FACTURABLE'`));
  check('El detalle trae el motivo', 'ADMIN', 'USO_INTERNO', (await admin.get(`/api/tasks/${N.id}`)).json?.closingReason);
  check('Ya cerrada: cerrar otra vez', 'ADMIN', '409 YA_CERRADA', st(await close(admin, N.id, 'NO_FACTURABLE', 'GARANTIA')));
  check('Anular una no facturable', 'ADMIN', 400, (await close(admin, N.id, 'ANULADA')).status);
  check('Reabrir una no facturable a En proceso', 'ADMIN', 400, (await close(admin, N.id, 'EN_PROCESO')).status);
  // Visibility (rule 6): as invoiced.
  check('El técnico asignado no la ve', 'USUARIO', 404, (await S.t1.get(`/api/tasks/${N.id}`)).status);
  check('El cliente no la ve', 'CLIENTE', 404, (await S.clA.get(`/api/tasks/${N.id}`)).status);
  check('No está en la lista del técnico', 'USUARIO', 0, ((await S.t1.get('/api/tasks')).json ?? []).filter((t) => t.id === N.id).length);
  check('No está en la lista del cliente', 'CLIENTE', 0, ((await S.clA.get('/api/tasks')).json ?? []).filter((t) => t.id === N.id).length);
  check('Filtro No facturable', 'SUPERVISOR', 1, ((await S.sup.get('/api/tasks?status=NO_FACTURABLE')).json ?? []).filter((t) => t.id === N.id).length);
  check('Filtro No facturable', 'ADMIN', 1, ((await admin.get('/api/tasks?status=NO_FACTURABLE')).json ?? []).filter((t) => t.id === N.id).length);
  check('Filtro No facturable (técnico: nada)', 'USUARIO', 0, ((await S.t1.get('/api/tasks?status=NO_FACTURABLE')).json ?? []).length);
  // Back to finished (D-209).
  check('Volver a Finalizadas', 'USUARIO', 404, (await close(S.t1, N.id, 'FINALIZADO')).status);
  check('Volver a Finalizadas', 'CLIENTE', 404, (await close(S.clA, N.id, 'FINALIZADO')).status);
  check('Volver a Finalizadas sin sesión', 'anónimo', 401, (await close(anon, N.id, 'FINALIZADO')).status);
  check('Volver a Finalizadas con motivo (no corresponde)', 'SUPERVISOR', '400 MOTIVO_INVALIDO', st(await close(S.sup, N.id, 'FINALIZADO', 'GARANTIA')));
  check('Volver a Finalizadas desde No facturable', 'SUPERVISOR', 'FINALIZADO', st(await close(S.sup, N.id, 'FINALIZADO')));
  check('Volver borra el motivo de la tarea', 'sistema', 'FINALIZADO -', row(N.id));
  check('El historial conserva el motivo', 'sistema', 'USO_INTERNO', sql(`SELECT closing_reason FROM sti.task_event WHERE task_id = '${N.id}' AND to_status = 'NO_FACTURABLE'`));
  check('Volver conserva las confirmaciones', 'sistema', '1 1', sql(`SELECT count(*) || ' ' || count(confirmed_at) FROM sti.task_assignment WHERE task_id = '${N.id}'`));
  check('Volver queda en el historial', 'sistema', `NO_FACTURABLE ${supId}`, sql(`SELECT from_status || ' ' || actor_id FROM sti.task_event WHERE task_id = '${N.id}' AND to_status = 'FINALIZADO' AND from_status = 'NO_FACTURABLE'`));
  check('El técnico la vuelve a ver', 'USUARIO', 200, (await S.t1.get(`/api/tasks/${N.id}`)).status);
  // Garantía, then signed and invoiced by the SUPERVISOR, then back: the signature stays.
  await close(admin, N.id, 'NO_FACTURABLE', 'GARANTIA');
  check('No facturable por garantía', 'ADMIN', 'NO_FACTURABLE GARANTIA', row(N.id));
  await close(admin, N.id, 'FINALIZADO');
  check('Firma del cliente', 'CLIENTE', 201, (await S.clA.post(`/api/tasks/${N.id}/signature`, { signerName: 'Carla Cliente', image: SIGN_B64, location: GPS })).status);
  check('El SUPERVISOR factura con firma (D-207)', 'SUPERVISOR', 'FACTURADO', st(await close(S.sup, N.id, 'FACTURADO')));
  check('Volver a Finalizadas desde Facturada', 'ADMIN', 'FINALIZADO', st(await close(admin, N.id, 'FINALIZADO')));
  check('Volver conserva la firma vigente', 'sistema', 1, Number(sql(`SELECT count(*) FROM sti.task_signature WHERE task_id = '${N.id}' AND superseded_at IS NULL`)));
  check('Y se puede volver a facturar sin firmar de nuevo', 'ADMIN', 'FACTURADO', st(await close(admin, N.id, 'FACTURADO')));
  check('El cliente no ve la facturada', 'CLIENTE', 404, (await S.clA.get(`/api/tasks/${N.id}`)).status);

  // Closing at the same time: one wins, the other is told (rule 8). Independent sessions, released together.
  const tally = (codes, res) => { for (const x of res) { const k = x.json?.code ? `${x.status} ${x.json.code}` : String(x.status); codes[k] = (codes[k] ?? 0) + 1; } };
  const sorted = (codes) => JSON.stringify(Object.fromEntries(Object.entries(codes).sort()));
  let codes = {}, bad = 0;
  for (let i = 0; i < ROUNDS; i++) {
    const t = await finished(`Conc cierre ${i}`);
    await S.clA.post(`/api/tasks/${t.id}/signature`, { signerName: 'Firma', image: SIGN_B64, location: GPS });
    const [a, b] = [await fresh({ email: creds.adminEmail, password: creds.adminPassword }), await fresh(sup)];
    await a.refreshCsrf(); await b.refreshCsrf();
    tally(codes, await Promise.all([close(a, t.id, 'NO_FACTURABLE', 'GARANTIA'), close(b, t.id, 'FACTURADO')]));
    if (Number(sql(`SELECT count(*) FROM sti.task_event WHERE task_id = '${t.id}' AND to_status IN ('FACTURADO','NO_FACTURABLE')`)) !== 1) bad++;
  }
  check('Dos cierres a la vez: uno gana, el otro 409 YA_CERRADA', 'ADMIN+SUPERVISOR', `{"200":${ROUNDS},"409 YA_CERRADA":${ROUNDS}}`, sorted(codes), `tareas con un número de eventos de cierre distinto de 1: ${bad}`);
  codes = {}; bad = 0;
  for (let i = 0; i < ROUNDS; i++) {
    const t = await finished(`Conc volver ${i}`);
    await close(admin, t.id, 'NO_FACTURABLE', 'USO_INTERNO');
    const [a, b] = [await fresh({ email: creds.adminEmail, password: creds.adminPassword }), await fresh(sup)];
    await a.refreshCsrf(); await b.refreshCsrf();
    tally(codes, await Promise.all([close(a, t.id, 'FINALIZADO'), close(b, t.id, 'FINALIZADO')]));
    if (Number(sql(`SELECT count(*) FROM sti.task_event WHERE task_id = '${t.id}' AND to_status = 'FINALIZADO' AND from_status = 'NO_FACTURABLE'`)) !== 1) bad++;
  }
  check('Dos "Volver a Finalizadas" a la vez: uno gana, el otro 409 YA_FINALIZADA', 'ADMIN+SUPERVISOR', `{"200":${ROUNDS},"409 YA_FINALIZADA":${ROUNDS}}`, sorted(codes), `tareas con un número de eventos de vuelta distinto de 1: ${bad}`);
}

// ---------- output ----------
const seed = { clients: { cA, cB }, projects: { pA1, pA2, pB1 }, accounts: { admin: { email: creds.adminEmail, note: 'password en secretos.json' }, sup, t1, t2, clA, clB }, tasks: { cicloCompleto: T.id, reapertura: R.id, anulada: C.id } };
fs.writeFileSync(path.join(OUT, 'datos-falsos.json'), JSON.stringify(seed, null, 2));
fs.writeFileSync(path.join(OUT, 'matriz-api.json'), JSON.stringify(rows, null, 2));
const md = ['| Sección | Regla | Rol | Esperado | Obtenido | Resultado |', '|---|---|---|---|---|---|',
  ...rows.map((x) => `| ${x.section} | ${x.rule}${x.note ? ` — ${x.note}` : ''} | ${x.role} | ${x.expected} | ${x.obtained} | ${x.ok === null ? 'obs.' : x.ok ? 'OK' : '**FALLA**'} |`)];
fs.writeFileSync(path.join(OUT, 'matriz-api.md'), md.join('\n') + '\n');
const fails = rows.filter((x) => x.ok === false).length, oks = rows.filter((x) => x.ok).length, obs = rows.filter((x) => x.ok === null).length;
console.log(`\nRESUMEN: ${oks} OK, ${fails} FALLA, ${obs} observaciones`);

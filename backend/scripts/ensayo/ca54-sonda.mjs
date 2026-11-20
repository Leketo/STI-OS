// CA-54 probe (corte 3A): v0.2.1 against schema 6 with a NO_FACTURABLE task. Built from the head of matriz-api.mjs
// (same Session, check and observe); the probe itself is at the end.
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

// ---------- CA-54 probe: what v0.2.1 does with a NO_FACTURABLE task (D-220) ----------
// Usage: node backend/scripts/ensayo/ca54-sonda.mjs <ensayo output dir> <task number>
// The task is turned into NO_FACTURABLE by SQL (v0.2.1 cannot do it); the technician and the customer get a new
// password through the ADMIN's reset, as in the matrix. Only fake data of the rehearsal.
const number = Number(process.argv[3]);
const id = sql(`SELECT id FROM sti.task WHERE number = ${number}`);
const admin = new Session('ADMIN');
await admin.login(creds.adminEmail, creds.adminPassword);
const signIn = async (email) => {
  const target = sql(`SELECT id FROM sti.app_user WHERE email = '${email}'`);
  const initial = (await admin.post(`/api/accounts/${target}/password-reset`, {})).json.initialPassword;
  const first = new Session(email);
  await first.login(email, initial);
  await first.post('/api/auth/password', { newPassword: FAKE_PASSWORD });
  const s = new Session(email);
  await s.login(email, FAKE_PASSWORD);
  return s;
};
const tech = await signIn('tecnico1@example.invalid');
const customer = await signIn('cliente.constructora@example.invalid');
observe('Tarea elegida', 'sistema', `TAR-${String(number).padStart(4, '0')} ${sql(`SELECT status FROM sti.task WHERE id = '${id}'`)}`);
sql(`UPDATE sti.task SET status = 'NO_FACTURABLE', closing_reason = 'GARANTIA' WHERE id = '${id}'`);
observe('Pasada a NO_FACTURABLE por SQL', 'sistema', sql(`SELECT status || ' ' || closing_reason FROM sti.task WHERE id = '${id}'`));
for (const [who, label] of [[admin, 'ADMIN'], [tech, 'USUARIO'], [customer, 'CLIENTE']]) {
  const detail = await who.get(`/api/tasks/${id}`);
  observe('Detalle', label, `${detail.status} ${detail.json?.status ?? ''}`.trim());
  const list = (await who.get('/api/tasks')).json ?? [];
  observe('En la lista', label, list.some((t) => t.id === id) ? 'sí' : 'no');
  observe('Filtro ?status=NO_FACTURABLE', label, (await who.get('/api/tasks?status=NO_FACTURABLE')).status);
}
observe('Cambio de estado a FINALIZADO', 'ADMIN', (await admin.post(`/api/tasks/${id}/status`, { to: 'FINALIZADO', location: GPS })).status);
observe('Cambio de estado a EN_PROCESO', 'ADMIN', (await admin.post(`/api/tasks/${id}/status`, { to: 'EN_PROCESO', location: GPS })).status);
observe('Cambio de estado a FACTURADO', 'ADMIN', (await admin.post(`/api/tasks/${id}/status`, { to: 'FACTURADO', location: GPS })).status);
observe('Foto', 'ADMIN', (await admin.upload(`/api/tasks/${id}/photos`, PHOTO, 'p.png', 'image/png')).status);
observe('Firma', 'CLIENTE', (await customer.post(`/api/tasks/${id}/signature`, { signerName: 'Prueba', image: 'data:image/png;base64,' + PHOTO.toString('base64'), location: GPS })).status);
observe('Estado en la base al final', 'sistema', sql(`SELECT status || ' ' || coalesce(closing_reason, '-') FROM sti.task WHERE id = '${id}'`));
const md = ['| Regla | Rol | Obtenido |', '|---|---|---|', ...rows.map((x) => `| ${x.rule} | ${x.role} | ${x.obtained} |`)];
fs.writeFileSync(path.join(OUT, 'ca54-sonda.md'), md.join('\n') + '\n');

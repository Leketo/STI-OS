// CA-38 (ENCARGO-DEV-003): no difference in time that tells apart an email with an account from one without.
// Rehearsal only (127.0.0.1:8099), fake accounts under example.invalid (and, for the path that really sends, a fake
// domain the rehearsal mail server swallows). Nothing here touches the product. Method, per case:
//   - N samples after WARM warm-up requests, the cases interleaved in random order on every round so drift of the
//     machine hits all of them alike;
//   - one new HTTP connection and one new session per request, as a browser that has just arrived would do;
//   - the sign-in samples are spread over a pool of accounts, at most 3 failures each, so the block of rule 13 (5
//     failures in 15 minutes) never answers in place of the check that is being timed. Unknown emails are new
//     on every sample;
//   - the medians are compared with a 95 % bootstrap interval of their difference (2000 resamples).
// Usage: node backend/scripts/ensayo/tiempos-corte2b.mjs output/ensayo [N=300] [dominio-que-envia]
// The optional third argument is a domain that is not reserved (D-151); with the rehearsal mail server up the
// active account on it takes the real path: queue row, not the "omitido" one.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const BASE = 'http://127.0.0.1:8099';
const OUT = process.argv[2];
const N = Number(process.argv[3] ?? 300);
const SENDING_DOMAIN = process.argv[4] ?? '';
const WARM = 30;
const creds = JSON.parse(fs.readFileSync(path.join(OUT, 'secretos.json'), 'utf8'));
const tag = crypto.randomBytes(3).toString('hex');

class S {
  constructor() { this.c = new Map(); }
  ck() { return [...this.c].map(([k, v]) => `${k}=${v}`).join('; '); }
  eat(r) { for (const x of r.headers.getSetCookie?.() ?? []) { const [p] = x.split(';'); const i = p.indexOf('='); this.c.set(p.slice(0, i), p.slice(i + 1)); } }
  async csrf() { const r = await fetch(BASE + '/api/auth/csrf', { headers: this.c.size ? { cookie: this.ck() } : {} }); this.eat(r); return r.json(); }
  async timed(method, url, { form, json } = {}) {
    const t = await this.csrf();
    const headers = { [t.headerName]: t.token, cookie: this.ck() };
    let body;
    if (form) { headers['content-type'] = 'application/x-www-form-urlencoded'; body = new URLSearchParams(form).toString(); }
    if (json !== undefined) { headers['content-type'] = 'application/json'; body = JSON.stringify(json); }
    const t0 = process.hrtime.bigint();
    const r = await fetch(BASE + url, { method, headers, body, redirect: 'manual' });
    const txt = await r.text();
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    this.eat(r);
    return { status: r.status, ms, body: txt };
  }
  async api(method, url, data) {
    const r = await this.timed(method, url, { json: data });
    return { status: r.status, json: (() => { try { return JSON.parse(r.body); } catch { return null; } })() };
  }
}

const admin = new S();
const st = await admin.timed('POST', '/api/auth/login', { form: { username: creds.adminEmail, password: creds.adminPassword } });
if (st.status !== 204) throw new Error('admin login ' + st.status);

const POOL = Math.ceil(N / 3) + 1;
const active = [], inactive = [];
for (let i = 0; i < POOL; i++) {
  const a = await admin.api('POST', '/api/accounts', { name: `Activa ${i}`, email: `act.${tag}.${i}@example.invalid`, role: 'USUARIO' });
  const b = await admin.api('POST', '/api/accounts', { name: `Inactiva ${i}`, email: `ina.${tag}.${i}@example.invalid`, role: 'USUARIO' });
  if (a.status !== 201 || b.status !== 201) throw new Error(`pool ${a.status} ${b.status}`);
  const off = await admin.api('PUT', `/api/accounts/${b.json.account.id}`, { active: false });
  if (off.status !== 200) throw new Error('deactivate ' + off.status);
  active.push(a.json.account.email); inactive.push(b.json.account.email);
}
let sending = null;
if (SENDING_DOMAIN) {
  sending = [];
  for (let i = 0; i < POOL; i++) {
    const c = await admin.api('POST', '/api/accounts', { name: `Envia ${i}`, email: `env.${tag}.${i}@${SENDING_DOMAIN}`, role: 'USUARIO' });
    if (c.status !== 201) throw new Error('sending account ' + c.status);
    sending.push(c.json.account.email);
  }
}

const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
function ci(a, b) {
  const d = [];
  for (let i = 0; i < 2000; i++) {
    const ra = Array.from(a, () => a[Math.floor(Math.random() * a.length)]);
    const rb = Array.from(b, () => b[Math.floor(Math.random() * b.length)]);
    d.push(q(ra, 0.5) - q(rb, 0.5));
  }
  return [q(d, 0.025), q(d, 0.975)];
}

// Runs a family of cases; `make(case, i)` returns the request to time.
async function family(name, cases, make, reference) {
  const res = Object.fromEntries(Object.keys(cases).map((k) => [k, []]));
  const statuses = Object.fromEntries(Object.keys(cases).map((k) => [k, {}]));
  const bodies = Object.fromEntries(Object.keys(cases).map((k) => [k, new Set()]));
  for (let i = 0; i < N + WARM; i++) {
    for (const k of Object.keys(cases).sort(() => Math.random() - 0.5)) {
      const r = await make(k, i);
      if (i >= WARM) { res[k].push(r.ms); statuses[k][r.status] = (statuses[k][r.status] ?? 0) + 1; bodies[k].add(r.body); }
    }
  }
  const out = {};
  for (const k of Object.keys(cases)) out[k] = { n: res[k].length, status: statuses[k], cuerpos_distintos: bodies[k].size, cuerpo: [...bodies[k]][0], p10: q(res[k], 0.1), mediana: q(res[k], 0.5), p90: q(res[k], 0.9), media: mean(res[k]) };
  const diffs = {};
  for (const k of Object.keys(cases)) if (k !== reference) diffs[`${k} contra ${reference}`] = { mediana_ms: out[k].mediana - out[reference].mediana, ic95_ms: ci(res[k], res[reference]) };
  console.log(`\n== ${name}`);
  console.log(JSON.stringify({ out, diffs }, null, 1));
  return { out, diffs, raw: res };
}

const wrong = 'Clave-equivocada-' + crypto.randomBytes(6).toString('hex');
const report = {};

// A. Sign-in with a wrong password: unknown email, account, inactive account.
report.ingreso = await family('Ingreso con contraseña errónea', { inexistente: 1, activa: 1, inactiva: 1 }, (k, i) => {
  const email = k === 'inexistente' ? `nadie.${tag}.${i}.${crypto.randomBytes(2).toString('hex')}@example.invalid` : (k === 'activa' ? active : inactive)[i % POOL];
  return new S().timed('POST', '/api/auth/login', { form: { username: email, password: wrong } });
}, 'activa');

// B. Asking for the recovery link.
const recoveryCases = { inexistente: 1, activa_o_dominio_reservado: 1, inactiva: 1 };
if (sending) recoveryCases.activa_que_envia = 1;
report.recuperar = await family('Pedido del enlace de recuperación', recoveryCases, (k, i) => {
  const email = k === 'inexistente' ? `nadie.${tag}.${i}.${crypto.randomBytes(2).toString('hex')}@example.invalid`
    : k === 'inactiva' ? inactive[i % POOL] : k === 'activa_que_envia' ? sending[i % POOL] : active[i % POOL];
  return new S().timed('POST', '/api/auth/password-recovery', { json: { email } });
}, 'inexistente');

// C. The block message: an account and an email nobody has, both already blocked.
const blockedReal = active[0], blockedGhost = `bloqueado.${tag}@example.invalid`;
for (const email of [blockedReal, blockedGhost]) for (let i = 0; i < 5; i++) await new S().timed('POST', '/api/auth/login', { form: { username: email, password: wrong } });
report.bloqueo = await family('Mensaje de bloqueo (429)', { cuenta: 1, inexistente: 1 }, (k) =>
  new S().timed('POST', '/api/auth/login', { form: { username: k === 'cuenta' ? blockedReal : blockedGhost, password: wrong } }), 'cuenta');

// D. A link that does not serve: invented, and one that existed in the table but is already used.
const planted = crypto.randomBytes(32).toString('base64url');
const sql = (q) => execFileSync('docker', ['exec', 'sti-ensayo', 'psql', '-U', 'postgres', '-d', 'sti_os', '-tAc', q]).toString().trim();
sql(`INSERT INTO sti.password_reset_token (id, account_id, token_hash, expires_at, used_at) SELECT gen_random_uuid(), id, decode('${crypto.createHash('sha256').update(planted).digest('hex')}', 'hex'), clock_timestamp() + interval '30 minutes', clock_timestamp() FROM sti.app_user WHERE email = '${active[1]}'`);
report.enlace = await family('Enlace que no sirve (check)', { inventado: 1, ya_usado: 1 }, (k) => {
  const token = k === 'inventado' ? crypto.randomBytes(32).toString('base64url') : planted;
  return new S().timed('POST', '/api/auth/password-recovery/check', { json: { token } });
}, 'inventado');

fs.writeFileSync(path.join(OUT, `tiempos-corte2b-${tag}.json`), JSON.stringify({ n: N, warm: WARM, pool: POOL, informe: report }, null, 1));
console.log(`\nResultados en ${path.join(OUT, `tiempos-corte2b-${tag}.json`)}`);

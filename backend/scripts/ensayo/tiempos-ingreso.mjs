// Q2 of ENCARGO-DEV-003: does a sign-in with an unknown email take as long as one with a wrong password?
// Rehearsal only (127.0.0.1:8099). Fake accounts under example.invalid. Nothing is changed in the product.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const BASE = 'http://127.0.0.1:8099';
const OUT = process.argv[2];
const N = Number(process.argv[3] ?? 300);
const WARM = 30;
const creds = JSON.parse(fs.readFileSync(path.join(OUT, 'secretos.json'), 'utf8'));

class S {
  constructor() { this.c = new Map(); }
  ck() { return [...this.c].map(([k, v]) => `${k}=${v}`).join('; '); }
  eat(r) { for (const x of r.headers.getSetCookie?.() ?? []) { const [p] = x.split(';'); const i = p.indexOf('='); this.c.set(p.slice(0, i), p.slice(i + 1)); } }
  async csrf() { const r = await fetch(BASE + '/api/auth/csrf', { headers: this.c.size ? { cookie: this.ck() } : {} }); this.eat(r); const j = await r.json(); return j; }
  async loginTimed(u, p) {
    const t = await this.csrf();
    const body = new URLSearchParams({ username: u, password: p }).toString();
    const h = { 'content-type': 'application/x-www-form-urlencoded', [t.headerName]: t.token, cookie: this.ck() };
    const t0 = process.hrtime.bigint();
    const r = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: h, body, redirect: 'manual' });
    const txt = await r.text();
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    this.eat(r);
    return { status: r.status, ms, body: txt };
  }
  async json(method, url, data) {
    const t = await this.csrf();
    const r = await fetch(BASE + url, { method, headers: { 'content-type': 'application/json', [t.headerName]: t.token, cookie: this.ck() }, body: JSON.stringify(data) });
    this.eat(r); return { status: r.status, json: await r.json().catch(() => null) };
  }
}

const admin = new S();
const st = await admin.loginTimed(creds.adminEmail, creds.adminPassword);
if (st.status !== 204) throw new Error('admin login ' + st.status);
const tag = crypto.randomBytes(3).toString('hex');
const act = await admin.json('POST', '/api/accounts', { name: 'Activa tiempos', email: `activa.${tag}@example.invalid`, role: 'USUARIO' });
const ina = await admin.json('POST', '/api/accounts', { name: 'Inactiva tiempos', email: `inactiva.${tag}@example.invalid`, role: 'USUARIO' });
const off = await admin.json('PUT', `/api/accounts/${ina.json.account.id}`, { active: false });
if (act.status !== 201 || ina.status !== 201 || off.status !== 200) throw new Error(`setup ${act.status} ${ina.status} ${off.status}`);

const cases = {
  inexistente: `nadie.${tag}@example.invalid`,
  activa_clave_mala: `activa.${tag}@example.invalid`,
  inactiva_clave_mala: `inactiva.${tag}@example.invalid`,
};
const res = Object.fromEntries(Object.keys(cases).map((k) => [k, []]));
const statuses = Object.fromEntries(Object.keys(cases).map((k) => [k, {}]));
const bodies = Object.fromEntries(Object.keys(cases).map((k) => [k, new Set()]));
const wrong = 'Clave-equivocada-' + crypto.randomBytes(6).toString('hex');
for (let i = 0; i < N + WARM; i++) {
  const order = Object.keys(cases).sort(() => Math.random() - 0.5);
  for (const k of order) {
    const r = await new S().loginTimed(cases[k], wrong);
    if (i >= WARM) { res[k].push(r.ms); statuses[k][r.status] = (statuses[k][r.status] ?? 0) + 1; bodies[k].add(r.body); }
  }
}
const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const out = {};
for (const k of Object.keys(cases)) out[k] = { n: res[k].length, status: statuses[k], cuerpos: [...bodies[k]], p10: q(res[k], 0.1), mediana: q(res[k], 0.5), p90: q(res[k], 0.9), media: mean(res[k]) };
// Bootstrap 95% CI for the difference of medians against "activa_clave_mala".
function ci(a, b) {
  const d = [];
  for (let i = 0; i < 2000; i++) {
    const ra = Array.from(a, () => a[Math.floor(Math.random() * a.length)]);
    const rb = Array.from(b, () => b[Math.floor(Math.random() * b.length)]);
    d.push(q(ra, 0.5) - q(rb, 0.5));
  }
  return [q(d, 0.025), q(d, 0.975)];
}
out.dif_mediana_inexistente_vs_activa = { ms: out.inexistente.mediana - out.activa_clave_mala.mediana, ic95: ci(res.inexistente, res.activa_clave_mala) };
out.dif_mediana_inactiva_vs_activa = { ms: out.inactiva_clave_mala.mediana - out.activa_clave_mala.mediana, ic95: ci(res.inactiva_clave_mala, res.activa_clave_mala) };
fs.writeFileSync(path.join(OUT, `tiempos-ingreso-${tag}.json`), JSON.stringify({ n: N, warm: WARM, out, raw: res }, null, 1));
console.log(JSON.stringify(out, null, 1));

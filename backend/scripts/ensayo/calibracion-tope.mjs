// D-161: calibration of the ceiling of password checks at the same time (STI_AUTH_MAX_CONCURRENT_CHECKS).
// Rehearsal only. The backend must already be up with the ceiling to measure; the script reads it from the log line
// "Tope de comprobaciones de contraseña al mismo tiempo: N".
//
// Method: a quiet phase measures /api/health alone; then, for SECONDS, C clients keep signing in at the same time
// without pause (wrong password, a new unknown email on every attempt so the block of rule 13 never answers in place
// of the check), each one with a new session, while one more client asks /api/health every 100 ms.
// Reports: health latency (p50, p95, max, errors) quiet and under load, how many sign-ins were checked (401) and how
// many were turned away (429 SISTEMA_OCUPADO), and the latency of the checked ones.
// Usage: node backend/scripts/ensayo/calibracion-tope.mjs output/ensayo [C=40] [SECONDS=30]
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const BASE = 'http://127.0.0.1:8099';
const OUT = process.argv[2];
const C = Number(process.argv[3] ?? 40);
const SECONDS = Number(process.argv[4] ?? 30);
const log = fs.readFileSync(path.join(OUT, 'logs', 'backend.out.log'), 'utf8');
const ceiling = Number((log.match(/Tope de comprobaciones de contraseña al mismo tiempo: (\d+)/) ?? [])[1]);
const tag = crypto.randomBytes(3).toString('hex');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const q = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : NaN; };
const r1 = (x) => Math.round(x * 10) / 10;

async function health(stopAt) {
  const ms = []; let errors = 0;
  while (Date.now() < stopAt) {
    const t0 = performance.now();
    try { const r = await fetch(BASE + '/api/health', { signal: AbortSignal.timeout(5000) }); await r.text(); if (r.status !== 200) errors++; else ms.push(performance.now() - t0); }
    catch { errors++; }
    await sleep(100);
  }
  return { n: ms.length, errors, p50: r1(q(ms, 0.5)), p95: r1(q(ms, 0.95)), max: r1(Math.max(...ms)) };
}

let seq = 0;
async function signIns(stopAt) {
  const out = { checked: [], busy: 0, blocked: 0, other: {} };
  while (Date.now() < stopAt) {
    const csrf = await fetch(BASE + '/api/auth/csrf');
    const cookie = (csrf.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');
    const t = await csrf.json();
    const t0 = performance.now();
    const r = await fetch(BASE + '/api/auth/login', { method: 'POST', redirect: 'manual', headers: { cookie, [t.headerName]: t.token, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ username: `calibra.${tag}.${seq++}@example.invalid`, password: 'mala-contrasena-1' }).toString() });
    const body = await r.text();
    const ms = performance.now() - t0;
    if (r.status === 401) out.checked.push(ms);
    else if (r.status === 429 && body.includes('SISTEMA_OCUPADO')) out.busy++;
    else if (r.status === 429) out.blocked++;
    else out.other[r.status] = (out.other[r.status] ?? 0) + 1;
  }
  return out;
}

const quiet = await health(Date.now() + 10_000);
const stopAt = Date.now() + SECONDS * 1000;
const [loaded, ...clients] = await Promise.all([health(stopAt), ...Array.from({ length: C }, () => signIns(stopAt))]);
const checked = clients.flatMap((c) => c.checked);
const busy = clients.reduce((a, c) => a + c.busy, 0);
const blocked = clients.reduce((a, c) => a + c.blocked, 0);
const other = clients.reduce((a, c) => { for (const [k, v] of Object.entries(c.other)) a[k] = (a[k] ?? 0) + v; return a; }, {});
const result = {
  ceiling, clients: C, seconds: SECONDS, healthQuiet: quiet, healthLoaded: loaded,
  signIns: { checked: checked.length, perSecond: r1(checked.length / SECONDS), busy, blocked, other, checkedP50: r1(q(checked, 0.5)), checkedP95: r1(q(checked, 0.95)) },
};
fs.writeFileSync(path.join(OUT, `calibracion-tope-${ceiling}.json`), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));

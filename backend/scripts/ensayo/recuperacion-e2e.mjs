// Corte 2B (ENCARGO-DEV-003): password recovery end to end, with the rehearsal's fake mail server (GreenMail, SSL).
// The mail really leaves the backend over SMTPS and arrives as a file in <outDir>/correo/; this script reads the link
// from there, as a person would read it from the mail. Nothing here touches the product.
//
// Usage, against the rehearsal environment and nothing else:
//   ./backend/scripts/ensayo.ps1 -Accion Levantar -Correo
//   node backend/scripts/ensayo/recuperacion-e2e.mjs output/ensayo
//
// The accounts that must get a mail use the domain correo-ensayo.lan: not reserved (D-151), and the only server the
// backend can reach is the rehearsal one, which keeps every message. The reserved-domain cases use the reserved ones.
// "Expired" is made by moving expires_at of that fake row back in the rehearsal database: waiting 30 minutes for every
// run is not reasonable. The suite covers the same rule with a clock (RecoveryTest.aLinkThatNoLongerWorks).
// It writes recuperacion-e2e.md and .json to <outDir>. Links and passwords never go to the output: only their shape.
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const BASE = 'http://127.0.0.1:8099';
const PUBLIC = 'http://127.0.0.1:3000';
const OUT = process.argv[2];
if (!OUT) throw new Error('outDir required');
const MAILDIR = path.join(OUT, 'correo');
const creds = JSON.parse(fs.readFileSync(path.join(OUT, 'secretos.json'), 'utf8'));
const sql = (q) => execFileSync('docker', ['exec', 'sti-ensayo', 'psql', '-U', 'postgres', '-d', 'sti_os', '-tAc', q]).toString().trim();
const tag = crypto.randomBytes(3).toString('hex');
const DOMAIN = 'correo-ensayo.lan';
const pass = () => 'Ensayo-' + crypto.randomBytes(12).toString('base64url');
const sha = (t) => crypto.createHash('sha256').update(t).digest('hex');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rows = [];
let section = '';

function check(rule, expected, obtained, note = '') {
  const ok = String(expected) === String(obtained);
  rows.push({ section, rule, expected: String(expected), obtained: String(obtained), ok, note });
  console.log(`${ok ? 'OK  ' : 'FAIL'} [${section}] ${rule} esperado=${expected} obtenido=${obtained} ${note}`);
  return ok;
}

class Session {
  constructor() { this.c = new Map(); this.token = null; this.header = 'X-CSRF-TOKEN'; }
  ck() { return [...this.c].map(([k, v]) => `${k}=${v}`).join('; '); }
  eat(r) {
    for (const x of r.headers.getSetCookie?.() ?? []) {
      const [p] = x.split(';'); const i = p.indexOf('='); const k = p.slice(0, i), v = p.slice(i + 1);
      if (/Max-Age=0/i.test(x) || v === '') this.c.delete(k); else this.c.set(k, v);
    }
  }
  async csrf() {
    const r = await fetch(BASE + '/api/auth/csrf', { headers: this.c.size ? { cookie: this.ck() } : {} });
    this.eat(r); const j = await r.json(); this.token = j.token; this.header = j.headerName ?? this.header;
  }
  async raw(method, url, { body, headers = {} } = {}) {
    if (method !== 'GET') await this.csrf();
    const h = { ...headers };
    if (this.c.size) h.cookie = this.ck();
    if (method !== 'GET') h[this.header] = this.token;
    const r = await fetch(BASE + url, { method, headers: h, body, redirect: 'manual' });
    this.eat(r);
    const text = await r.text();
    let json = null; try { json = JSON.parse(text); } catch {}
    return { status: r.status, json, text, type: r.headers.get('content-type') };
  }
  post(url, data) { return this.raw('POST', url, { body: JSON.stringify(data), headers: { 'content-type': 'application/json' } }); }
  async login(email, password) {
    return (await this.raw('POST', '/api/auth/login', { body: new URLSearchParams({ username: email, password }).toString(), headers: { 'content-type': 'application/x-www-form-urlencoded' } })).status;
  }
}
const coded = (r) => `${r.status} ${r.json?.code ?? ''}`.trim();
const anon = () => new Session();

// ---------- mail files ----------
const mailFiles = () => fs.existsSync(MAILDIR) ? fs.readdirSync(MAILDIR).filter((f) => /^\d{3}\.txt$/.test(f)).sort() : [];
const readMail = (f) => fs.readFileSync(path.join(MAILDIR, f), 'utf8');
const mailsTo = (email) => mailFiles().filter((f) => readMail(f).split('\n')[0].toLowerCase().includes(email.toLowerCase()));
async function waitMails(email, count, seconds = 40) {
  for (let i = 0; i < seconds * 4; i++) { if (mailsTo(email).length >= count) return mailsTo(email); await sleep(250); }
  return mailsTo(email);
}
const linkOf = (f) => (readMail(f).match(/https?:\/\/\S+/) ?? [''])[0];
const tokenOf = (link) => link.split('#')[1] ?? '';

// ---------- accounts ----------
const admin = new Session();
if ((await admin.login(creds.adminEmail, creds.adminPassword)) !== 204) throw new Error('admin login');
async function account(local, { domain = DOMAIN, active = true } = {}) {
  const email = `${local}.${tag}@${domain}`;
  const r = await admin.post('/api/accounts', { name: `E2E ${local}`, email, role: 'USUARIO' });
  if (r.status !== 201) throw new Error(`alta ${email}: ${r.status}`);
  const chosen = pass();
  const s = new Session();
  await s.login(email, r.json.initialPassword);
  await s.post('/api/auth/password', { newPassword: chosen });
  if (!active) await admin.raw('PUT', `/api/accounts/${r.json.account.id}`, { body: JSON.stringify({ active: false }), headers: { 'content-type': 'application/json' } });
  return { id: r.json.account.id, email, password: chosen };
}
const lastRow = (id) => sql(`SELECT status || ' ' || coalesce(reason, '-') FROM sti.mail_outbox WHERE account_id = '${id}' ORDER BY created_at DESC LIMIT 1`);

// ======================================================================================================
section = '1 Pedir, recibir y usar el enlace';
const a = await account('completa');
check('Pedir el enlace', 202, (await anon().post('/api/auth/password-recovery', { email: a.email.toUpperCase() })).status, 'escrito en mayúsculas');
let mails = await waitMails(a.email, 1);
check('Llega un correo al servidor falso (SMTPS)', 1, mails.length);
const m1 = readMail(mails[0]);
check('Asunto', 'Recuperar tu contraseña de STI-OS', (m1.match(/^Subject: (.*)$/m) ?? [])[1]);
check('Remitente', 'STI-OS <notificaciones@stisistemas.com>', (m1.match(/^From: (.*)$/m) ?? [])[1]);
check('El texto dice que vence a los 30 minutos y que sirve una vez', 'true', /30 minutos/.test(m1) && /una sola vez/.test(m1));
const link1 = linkOf(mails[0]);
const t1 = tokenOf(link1);
check('El enlace va a STI_PUBLIC_URL/nueva-contrasena', `${PUBLIC}/nueva-contrasena`, link1.split('#')[0]);
check('El token va después del # (no llega a ningún servidor en la URL)', 'true', link1.includes('#') && !link1.split('#')[0].includes('?'));
check('Forma del token: 43 caracteres base64url (256 bits)', 'true', /^[A-Za-z0-9_-]{43}$/.test(t1));
check('Fila de la cola', 'ENVIADO -', lastRow(a.id));
check('La base guarda solo el hash del token', 1, Number(sql(`SELECT count(*) FROM sti.password_reset_token WHERE account_id = '${a.id}' AND token_hash = decode('${sha(t1)}', 'hex')`)));
check('El token en claro no está en ninguna tabla', 0, Number(sql(`SELECT count(*) FROM (SELECT t::text AS x FROM sti.password_reset_token t UNION ALL SELECT o::text FROM sti.mail_outbox o UNION ALL SELECT m::text FROM sti.mail_attempt m UNION ALL SELECT e::text FROM sti.account_event e) q WHERE strpos(x, '${t1}') > 0`)));
check('Vence a los 30 minutos de enviado', 'true', sql(`SELECT abs(extract(epoch FROM (expires_at - created_at)) - 1800) < 5 FROM sti.password_reset_token WHERE token_hash = decode('${sha(t1)}', 'hex')`) === 't');
check('Enlace vigente: check', 204, (await anon().post('/api/auth/password-recovery/check', { token: t1 })).status);
const n1 = pass();
check('Guardar la contraseña nueva', 204, (await anon().post('/api/auth/password-recovery/confirm', { token: t1, newPassword: n1 })).status);
check('Ingresa con la nueva', 204, await anon().login(a.email, n1));
check('La anterior ya no sirve', 401, await anon().login(a.email, a.password));

section = '2 Enlaces que no sirven';
check('Enlace usado: check', '400 ENLACE_INVALIDO', coded(await anon().post('/api/auth/password-recovery/check', { token: t1 })));
check('Enlace usado: confirm', '400 ENLACE_INVALIDO', coded(await anon().post('/api/auth/password-recovery/confirm', { token: t1, newPassword: pass() })));
const b = await account('alterado');
await anon().post('/api/auth/password-recovery', { email: b.email });
mails = await waitMails(b.email, 1);
const t2 = tokenOf(linkOf(mails[0]));
const flip = (t, i) => t.slice(0, i) + (t[i] === 'A' ? 'B' : 'A') + t.slice(i + 1);
const deadMsg = (await anon().post('/api/auth/password-recovery/check', { token: flip(t2, 42) })).json?.message;
check('Enlace alterado (último carácter)', '400 ENLACE_INVALIDO', coded(await anon().post('/api/auth/password-recovery/check', { token: flip(t2, 42) })));
check('Enlace alterado (primer carácter)', '400 ENLACE_INVALIDO', coded(await anon().post('/api/auth/password-recovery/check', { token: flip(t2, 0) })));
check('Enlace recortado', '400 ENLACE_INVALIDO', coded(await anon().post('/api/auth/password-recovery/check', { token: t2.slice(0, 40) })));
check('Enlace alterado: confirm no cambia nada', '400 ENLACE_INVALIDO', coded(await anon().post('/api/auth/password-recovery/confirm', { token: flip(t2, 10), newPassword: pass() })));
check('El original sigue vivo tras los intentos alterados', 204, (await anon().post('/api/auth/password-recovery/check', { token: t2 })).status);
sql(`UPDATE sti.password_reset_token SET expires_at = clock_timestamp() - interval '1 second' WHERE token_hash = decode('${sha(t2)}', 'hex')`);
const expired = await anon().post('/api/auth/password-recovery/confirm', { token: t2, newPassword: pass() });
check('Enlace vencido (expires_at movido 30 min atrás en el ensayo): confirm', '400 ENLACE_INVALIDO', coded(expired));
check('Mismo texto para usado, alterado y vencido', 'Este enlace ya no sirve. Pedí uno nuevo.', `${deadMsg === expired.json?.message ? expired.json?.message : 'distinto'}`);
check('Con el enlace vencido la contraseña no cambió', 204, await anon().login(b.email, b.password));

section = '3 Un pedido nuevo anula el anterior';
const c = await account('reemplazo');
await anon().post('/api/auth/password-recovery', { email: c.email });
await waitMails(c.email, 1);
await anon().post('/api/auth/password-recovery', { email: c.email });
mails = await waitMails(c.email, 2);
check('Llegan dos correos', 2, mails.length);
const [ta, tb] = mails.map((f) => tokenOf(linkOf(f)));
check('El primer enlace ya no sirve', '400 ENLACE_INVALIDO', coded(await anon().post('/api/auth/password-recovery/check', { token: ta })));
check('El segundo sí', 204, (await anon().post('/api/auth/password-recovery/check', { token: tb })).status);
check('El primero quedó revocado en la base', 'true', sql(`SELECT revoked_at IS NOT NULL FROM sti.password_reset_token WHERE token_hash = decode('${sha(ta)}', 'hex')`) === 't');

section = '4 Tres pedidos por hora por correo';
const d = await account('tres');
const statuses = [];
for (let i = 1; i <= 4; i++) {
  statuses.push((await anon().post('/api/auth/password-recovery', { email: d.email })).status);
  if (i < 4) await waitMails(d.email, i);
}
check('Los cuatro pedidos reciben la misma respuesta', '202 202 202 202', statuses.join(' '));
await sleep(12000);
check('Llegan 3 correos, no 4 (12 s después del cuarto)', 3, mailsTo(d.email).length);
check('El cuarto queda omitido por el límite', 'OMITIDO LIMITE_POR_CORREO', lastRow(d.id));
const ghostTres = `nadie-tres.${tag}@${DOMAIN}`;
// The rows without an account keep nothing of the address (D-160), so they cannot be picked by it: count the
// difference before and after. (A first version counted "the last minute" and caught a row of the matrix run.)
const noAccount = () => Number(sql(`SELECT count(*) FROM sti.mail_outbox WHERE account_id IS NULL AND reason = 'SIN_CUENTA'`));
const before = noAccount();
for (let i = 0; i < 4; i++) await anon().post('/api/auth/password-recovery', { email: ghostTres });
check('Sin cuenta: 4 filas nuevas, sin cuenta y sin texto (también la 4.ª: el límite no se anota sin cuenta)', 4, noAccount() - before);
check('Sin cuenta: ningún correo', 0, mailsTo(ghostTres).length);

section = '5 Dominios reservados, cuenta inactiva y sin cuenta';
const reserved = [];
for (const dom of ['example.invalid', 'example.com', 'sub.example.org', 'algo.test', 'algo.example']) reserved.push(await account(`reservado-${dom.replace(/\./g, '-')}`, { domain: dom }));
const off = await account('inactiva', { active: false });
for (const r of reserved) await anon().post('/api/auth/password-recovery', { email: r.email });
await anon().post('/api/auth/password-recovery', { email: off.email });
await sleep(12000);
for (const r of reserved) check(`Dominio ${r.email.split('@')[1]}: fila omitida y ningún correo`, 'OMITIDO DOMINIO_RESERVADO 0', `${lastRow(r.id)} ${mailsTo(r.email).length}`);
check('Cuenta inactiva: fila omitida y ningún correo', 'OMITIDO CUENTA_INACTIVA 0', `${lastRow(off.id)} ${mailsTo(off.email).length}`);

section = '6 Host falso';
const e = await account('host');
const hostAnswer = await new Promise((resolve, reject) => {
  (async () => {
    const s = anon(); await s.csrf();
    const body = JSON.stringify({ email: e.email });
    const req = http.request(BASE + '/api/auth/password-recovery', { method: 'POST', headers: {
      host: 'atacante.example', 'x-forwarded-host': 'atacante.example', 'x-forwarded-proto': 'https', 'content-type': 'application/json',
      'content-length': Buffer.byteLength(body), cookie: s.ck(), [s.header]: s.token } }, (res) => { res.resume(); resolve(res.statusCode); });
    req.on('error', reject); req.end(body);
  })().catch(reject);
});
check('Pedido con Host y X-Forwarded-Host falsos', 202, hostAnswer);
mails = await waitMails(e.email, 1);
check('El enlace sigue apuntando a STI_PUBLIC_URL', `${PUBLIC}/nueva-contrasena`, linkOf(mails[0]).split('#')[0]);

section = '7 Bloqueo y recuperación';
const f = await account('bloqueo');
const fails = [];
for (let i = 0; i < 5; i++) fails.push(await anon().login(f.email, 'mala-contrasena-1'));
check('5 fallos seguidos: 4 dan 401 y el 5.º 429', '401 401 401 401 429', fails.join(' '));
const right = await anon().raw('POST', '/api/auth/login', { body: new URLSearchParams({ username: f.email, password: f.password }).toString(), headers: { 'content-type': 'application/x-www-form-urlencoded' } });
check('Con la contraseña correcta también se rechaza', '429 DEMASIADOS_INTENTOS', coded(right));
const ghost = `nadie-bloqueo.${tag}@${DOMAIN}`;
for (let i = 0; i < 5; i++) await anon().login(ghost, 'mala-contrasena-1');
const ghostAnswer = await anon().raw('POST', '/api/auth/login', { body: new URLSearchParams({ username: ghost, password: 'otra-cualquiera' }).toString(), headers: { 'content-type': 'application/x-www-form-urlencoded' } });
check('Mismo estado y cuerpo exista o no la cuenta', right.text, ghostAnswer.text, right.json?.message);
check('Pedir el enlace estando bloqueada', 202, (await anon().post('/api/auth/password-recovery', { email: f.email })).status);
mails = await waitMails(f.email, 1);
const tf = tokenOf(linkOf(mails[0]));
const nf = pass();
check('Guardar la nueva con el enlace del correo', 204, (await anon().post('/api/auth/password-recovery/confirm', { token: tf, newPassword: nf })).status);
check('El bloqueo se levantó: ingresa con la nueva', 204, await anon().login(f.email, nf));
check('Bitácora: BLOQUEO_INGRESO y RECUPERACION_CORREO, con la propia cuenta como actor (D-158)', '1 1 0', sql(`SELECT count(*) FILTER (WHERE kind = 'BLOQUEO_INGRESO') || ' ' || count(*) FILTER (WHERE kind = 'RECUPERACION_CORREO') || ' ' || count(*) FILTER (WHERE actor_id <> account_id) FROM sti.account_event WHERE account_id = '${f.id}' AND kind IN ('BLOQUEO_INGRESO', 'RECUPERACION_CORREO')`));

section = '8 Registro sin enlaces';
const allTokens = mailFiles().map((x) => tokenOf(linkOf(x))).filter(Boolean);
const logs = ['backend.out.log', 'backend.err.log'].map((x) => { try { return fs.readFileSync(path.join(OUT, 'logs', x), 'utf8'); } catch { return ''; } }).join('\n');
check(`Ninguno de los ${allTokens.length} tokens enviados aparece en el log del backend`, 0, allTokens.filter((t) => logs.includes(t)).length);
check('El log no contiene "nueva-contrasena#"', 0, (logs.match(/nueva-contrasena#/g) ?? []).length);
check('Los intentos guardan solo la clase del resultado', 'ENVIADO', sql(`SELECT string_agg(DISTINCT result, ',') FROM sti.mail_attempt`));
check('Ningún token en claro en la base', 0, Number(sql(`SELECT count(*) FROM (SELECT t::text AS x FROM sti.password_reset_token t UNION ALL SELECT o::text FROM sti.mail_outbox o UNION ALL SELECT m::text FROM sti.mail_attempt m UNION ALL SELECT e::text FROM sti.account_event e) q WHERE ${allTokens.map((t) => `strpos(x, '${t}') > 0`).join(' OR ')}`)));

fs.writeFileSync(path.join(OUT, 'recuperacion-e2e.json'), JSON.stringify(rows, null, 2));
const md = ['| Sección | Regla | Esperado | Obtenido | Resultado |', '|---|---|---|---|---|',
  ...rows.map((x) => `| ${x.section} | ${x.rule}${x.note ? ` — ${x.note}` : ''} | ${x.expected} | ${x.obtained} | ${x.ok ? 'OK' : '**FALLA**'} |`)];
fs.writeFileSync(path.join(OUT, 'recuperacion-e2e.md'), md.join('\n') + '\n');
console.log(`\nRESUMEN: ${rows.filter((x) => x.ok).length} OK, ${rows.filter((x) => !x.ok).length} FALLA`);

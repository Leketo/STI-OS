// Corte 3B (CA-71): captures of the new screens with the installed Chrome, headless, driven through the DevTools
// protocol (Node's own WebSocket; nothing installed). Exact widths: desktop 1440, 390 and 360, day and night.
//
// Usage, against the rehearsal environment with the 3B matrix already run (fake data only):
//   $env:STI_CAPTURA_PASS = <ADMIN password of output/ensayo/secretos.json>   (never written to a file)
//   node backend/scripts/ensayo/capturas-3b.mjs <output dir> <ids.json>
// ids.json names the tasks and catalog rows each capture opens. Passwords never appear on screen: the session is
// opened by a fetch in the page, not through the login form.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

const OUT = process.argv[2];
const IDS = JSON.parse(fs.readFileSync(process.argv[3], 'utf8').replace(/^﻿/, ''));
const BASE = 'http://127.0.0.1:3000';
const PORT = 9333;
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const pass = process.env.STI_CAPTURA_PASS;
if (!pass) throw new Error('STI_CAPTURA_PASS missing');
fs.mkdirSync(OUT, { recursive: true });

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'sti-capturas-'));
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  '--lang=es-419', '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let target;
for (let i = 0; i < 50 && !target; i++) {
  await sleep(200);
  try { target = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find((t) => t.type === 'page'); } catch {}
}
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let seq = 0;
const pending = new Map();
ws.addEventListener('message', (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
});
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++seq;
  pending.set(id, (msg) => (msg.error ? reject(new Error(`${method}: ${msg.error.message}`)) : resolve(msg.result)));
  ws.send(JSON.stringify({ id, method, params }));
});
const HELPERS = `
  const q = (s) => document.querySelector(s);
  const byText = (sel, text) => [...document.querySelectorAll(sel)].find((e) => e.textContent.trim() === text || e.getAttribute('aria-label') === text);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const setValue = (el, v) => {
    const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const until = async (fn, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { const v = fn(); if (v) return v; await wait(100); } throw new Error('timeout ' + fn); };
  const panelTo = (sel) => { const body = q('dialog[open] .sti-panel-body'); const el = typeof sel === 'string' ? body.querySelector(sel) : sel; body.scrollTop += el.getBoundingClientRect().top - body.getBoundingClientRect().top - 12; };
  const sectionByTitle = (t) => [...document.querySelectorAll('dialog[open] .sti-detail-section')].find((s) => s.querySelector('h3')?.textContent.includes(t));
`;
const run = async (code) => {
  const r = await send('Runtime.evaluate', { expression: `(async () => { ${HELPERS} ${code} })()`, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  return r.result.value;
};
const go = async (url) => { await send('Page.navigate', { url }); await sleep(1500); };

await send('Page.enable');
await send('Runtime.enable');
await go(`${BASE}/login`);
const login = await run(`
  const c = await fetch('/api/auth/csrf').then((r) => r.json());
  const r = await fetch('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', [c.headerName || 'X-CSRF-TOKEN']: c.token },
    body: new URLSearchParams({ username: ${JSON.stringify(IDS.adminEmail)}, password: ${JSON.stringify(pass)} }) });
  return r.status;`);
if (login !== 204) throw new Error('login ' + login);
// Data the captures need and the matrix does not leave: a task overdue and one rescheduled twice (ids.json,
// "schedule": [[taskId, day], ...]), through the API as the ADMIN would from the panel.
for (const [id, day] of IDS.schedule ?? []) {
  const status = await run(`
    const c = await fetch('/api/auth/csrf').then((r) => r.json());
    return (await fetch('/api/tasks/${id}/schedule', { method: 'POST', headers: { 'content-type': 'application/json', [c.headerName || 'X-CSRF-TOKEN']: c.token },
      body: JSON.stringify({ scheduledOn: '${day}' }) })).status;`);
  console.log('fecha', id.slice(0, 8), day, status);
}
const tech = await run(`return (await fetch('/api/operators').then((r) => r.json())).filter((o) => o.role === 'USUARIO' && /Técnic/.test(JSON.stringify(o))).map((o) => o.id);`);

const SIZES = { escritorio: [1440, 900, 1], 390: [390, 844, 2], 360: [360, 780, 2] };
const openTask = (id) => `await until(() => document.getElementById('task-open-${id}')); document.getElementById('task-open-${id}').click(); await until(() => q('dialog[open] .sti-panel-body')); await wait(900);`;
// Each capture: what it shows, and the steps in the page after /app loads.
const SHOTS = [
  ['01-tablero', 'Tablero: franja Cargada / Asignación / Terminada y "Atrasada"', `
    await until(() => document.getElementById('task-open-${IDS.overdue}'));
    document.getElementById('task-open-${IDS.overdue}').closest('article').scrollIntoView({ block: 'center' }); await wait(400);`],
  ['02-lista', 'Lista: columnas Cargada, Asignación y Terminada', `
    await until(() => byText('button', 'Lista')); byText('button', 'Lista').click(); await wait(800);`],
  ['03-nueva-tarea', 'Nueva tarea con el bloque Asignación (boceto 2.2)', `
    await until(() => byText('button', 'Nueva tarea') && !byText('button', 'Nueva tarea').disabled); byText('button', 'Nueva tarea').click();
    await until(() => q('#task-new-assignee'));
    setValue(q('#task-project'), q('#task-project').options[1].value); await wait(200);
    setValue(q('#task-title'), 'Revisar cámaras del acceso (datos falsos)');
    for (const id of ${JSON.stringify(tech)}) { setValue(q('#task-new-assignee'), id); await wait(200); }
    setValue(q('#task-new-day'), ${JSON.stringify(IDS.newDay)}); await wait(300);
    panelTo('.sti-assign-block');`],
  ['04-asignar-sin-fecha', 'Asignar una tarea sin fecha (boceto 7.3)', `${openTask(IDS.dateless)}
    setValue(q('#task-assign'), ${JSON.stringify(tech[0])}); await until(() => q('#schedule-day')); await wait(500);`],
  ['05-panel-fecha', 'Panel: recuadro de la fecha de asignación (boceto 7.1)', `${openTask(IDS.rescheduled)}
    panelTo(q('dialog[open] .sti-schedule-box') ?? sectionByTitle('Responsables'));`],
  ['06-panel-fechas', 'Panel: bloque Fechas', `${openTask(IDS.finished)}
    panelTo(sectionByTitle('Fechas'));`],
  ['07-cambiar-fecha', 'Cambiar fecha de asignación (boceto 7.2)', `${openTask(IDS.rescheduled)}
    byText('dialog[open] button', 'Cambiar').click(); await until(() => q('#schedule-day'));
    setValue(q('#schedule-day'), ${JSON.stringify(IDS.newDay)}); await wait(400);`],
  ['08-historial', 'Historial con "Asignó a … para el" y "Cambió la fecha de asignación"', `${openTask(IDS.finished)}
    panelTo(sectionByTitle('Historial'));`],
  ['09-atrasada-panel', 'Panel de una tarea atrasada', `${openTask(IDS.overdue)}
    panelTo(q('dialog[open] .sti-schedule-box') ?? sectionByTitle('Responsables'));`],
  ['10-no-facturable', 'Ventana "¿Por qué no se factura?" (N-49, boceto 6.2)', `${openTask(IDS.toClose)}
    byText('dialog[open] button', 'No facturable').click(); await until(() => q('.sti-reason')); await wait(500);`],
  ['11-editar-cliente', 'Editar cliente (boceto 7.4)', `
    location.hash = 'clients'; await wait(1200);
    await until(() => byText('button', 'Editar ${IDS.clientName}')); byText('button', 'Editar ${IDS.clientName}').click();
    await until(() => q('.sti-edit-summary strong')); await wait(400);`],
  ['12-editar-proyecto', 'Editar proyecto (boceto 7.5)', `
    location.hash = 'projects'; await wait(1200);
    await until(() => byText('button', 'Editar ${IDS.projectName}')); byText('button', 'Editar ${IDS.projectName}').click();
    await until(() => q('.sti-edit-summary strong')); await wait(400);`],
  ['13-filtros-activos', 'Barra con "Filtros activos" (N-31)', `
    await until(() => q('#task-search')); setValue(q('#task-search'), 'cámaras'); await wait(600); window.scrollTo(0, 0);`],
];
// Which sizes and themes each capture is taken in.
const PLAN = {
  '01-tablero': ['escritorio:light', 'escritorio:dark', '390:light', '390:dark', '360:light'],
  '02-lista': ['escritorio:light', 'escritorio:dark'],
  '03-nueva-tarea': ['escritorio:light', 'escritorio:dark', '390:light', '360:light'],
  '04-asignar-sin-fecha': ['escritorio:light', '390:light', '360:dark'],
  '05-panel-fecha': ['escritorio:light', 'escritorio:dark', '390:light', '360:light'],
  '06-panel-fechas': ['escritorio:light', 'escritorio:dark', '390:light', '360:dark'],
  '07-cambiar-fecha': ['escritorio:light', '390:dark', '360:light'],
  '08-historial': ['escritorio:light', '390:light'],
  '09-atrasada-panel': ['390:light', '390:dark'],
  '10-no-facturable': ['escritorio:light', '390:light', '360:light', '360:dark'],
  '11-editar-cliente': ['escritorio:light', 'escritorio:dark', '390:light', '360:light'],
  '12-editar-proyecto': ['escritorio:light', '390:light', '360:dark'],
  '13-filtros-activos': ['360:light', '360:dark', '390:light'],
};
const index = [];
for (const [name, what, steps] of IDS.rolesOnly ? [] : SHOTS) {
  for (const variant of PLAN[name]) {
    const [size, theme] = variant.split(':');
    const [width, height, scale] = SIZES[size];
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: scale, mobile: size !== 'escritorio' });
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: theme }] });
    await go(`${BASE}/login`);
    await run(`localStorage.setItem('sti-theme', ${JSON.stringify(theme)});`);
    await go(`${BASE}/app#tasks`);
    let note = '';
    try { await run(steps); } catch (error) { note = 'FALLA: ' + error.message.split('\n')[0]; }
    // Measured overflow: N-31 asks for none at 360.
    const overflow = await run(`return document.documentElement.scrollWidth - window.innerWidth;`);
    const file = `${name}-${size}-${theme === 'light' ? 'dia' : 'noche'}.jpg`;
    const shot = await send('Page.captureScreenshot', { format: 'jpeg', quality: 82 });
    fs.writeFileSync(path.join(OUT, file), Buffer.from(shot.data, 'base64'));
    index.push({ file, what, size, theme: theme === 'light' ? 'día' : 'noche', overflow, note });
    console.log(file, `desborde=${overflow}`, note);
  }
}
// The other three roles (CA-65, CA-66, CA-67), on fake accounts of the matrix. Their passwords are drawn in each
// matrix run and kept nowhere, so the ADMIN resets each one and the script makes the first sign-in with a random
// password that lives only in this process, as the matrix does.
const csrfFetch = (url, method, body, form = false) => `
  const c = await fetch('/api/auth/csrf').then((r) => r.json());
  return (await fetch(${JSON.stringify(url)}, { method: ${JSON.stringify(method)}, headers: { [c.headerName || 'X-CSRF-TOKEN']: c.token,
    'content-type': ${JSON.stringify(form ? 'application/x-www-form-urlencoded' : 'application/json')} },
    body: ${form ? 'new URLSearchParams(' + JSON.stringify(body) + ')' : JSON.stringify(JSON.stringify(body))} })).status;`;
const signInAs = async (email) => {
  await go(`${BASE}/login`);
  const relog = await run(csrfFetch('/api/auth/login', 'POST', { username: IDS.adminEmail, password: pass }, true));
  const id = await run(`return (await fetch('/api/accounts').then((r) => r.json())).find((a) => a.email === ${JSON.stringify(email)})?.id;`);
  const initial = await run(`
    const c = await fetch('/api/auth/csrf').then((r) => r.json());
    return (await fetch('/api/accounts/${id}/password-reset', { method: 'POST', headers: { [c.headerName || 'X-CSRF-TOKEN']: c.token, 'content-type': 'application/json' }, body: '{}' }).then((r) => r.json())).initialPassword;`);
  await run(csrfFetch('/api/auth/logout', 'POST', {}));
  const chosen = 'Captura-' + crypto.randomBytes(12).toString('base64url');
  const first = await run(csrfFetch('/api/auth/login', 'POST', { username: email, password: initial }, true));
  const change = await run(csrfFetch('/api/auth/password', 'POST', { newPassword: chosen }));
  await run(csrfFetch('/api/auth/logout', 'POST', {}));
  const login = await run(csrfFetch('/api/auth/login', 'POST', { username: email, password: chosen }, true));
  return `${relog} ${first} ${change} ${login}`;
};
const newTask = `
  await until(() => byText('button', 'Nueva tarea') && !byText('button', 'Nueva tarea').disabled); byText('button', 'Nueva tarea').click();
  await until(() => q('#task-title')); await wait(600);
  return q('dialog[open] .sti-assign-block') ? 'con el bloque Asignación' : 'sin el bloque Asignación';`;
const fechas = `${openTask(IDS.finished)} panelTo(sectionByTitle('Fechas'));
  return [...sectionByTitle('Fechas').querySelectorAll('tr, .sti-date-row, dt, dd')].map((e) => e.innerText.replace(/\\s+/g, ' ')).join(' | ').slice(0, 900);`;
const ROLES = [
  ['SUPERVISOR', IDS.supervisorEmail, [
    ['20-supervisor-fechas', 'SUPERVISOR: bloque Fechas', fechas],
  ]],
  ['USUARIO', IDS.technicianEmail, [
    ['21-tecnico-nueva-tarea', 'USUARIO: Nueva tarea, sin el bloque Asignación', newTask],
    ['22-tecnico-fecha', 'USUARIO asignado: el recuadro de la fecha, sin "Cambiar"', `${openTask(IDS.rescheduled)}
      panelTo(q('dialog[open] .sti-schedule-box') ?? sectionByTitle('Responsables'));
      return byText('dialog[open] button', 'Cambiar') || byText('dialog[open] button', 'Poner') ? 'con botón para cambiar la fecha' : 'sin botón para cambiar la fecha';`],
    ['23-tecnico-fechas', 'USUARIO: bloque Fechas', fechas],
  ]],
  ['CLIENTE', IDS.customerEmail, [
    ['24-cliente-nueva-tarea', 'CLIENTE: Nueva tarea, sin el bloque Asignación', newTask],
    ['25-cliente-fechas', 'CLIENTE: bloque Fechas', fechas],
  ]],
];
if (IDS.customerEmail) {
  for (const [role, email, shots] of ROLES) {
    console.log(role, 'ingreso (reingreso ADMIN, inicial, cambio, final):', await signInAs(email));
    for (const [name, what, steps] of shots) {
      for (const size of ['escritorio', '390']) {
        const [width, height, scale] = SIZES[size];
        await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: scale, mobile: size !== 'escritorio' });
        await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });
        await run(`localStorage.setItem('sti-theme', 'light');`);
        await go(`${BASE}/app#tasks`);
        let note = '';
        try { note = (await run(steps)) ?? ''; } catch (error) { note = 'FALLA: ' + error.message.split('\n')[0]; }
        const overflow = await run(`return document.documentElement.scrollWidth - window.innerWidth;`);
        const file = `${name}-${size}-dia.jpg`;
        const shot = await send('Page.captureScreenshot', { format: 'jpeg', quality: 82 });
        fs.writeFileSync(path.join(OUT, file), Buffer.from(shot.data, 'base64'));
        index.push({ file, what, size, theme: 'día', overflow, note });
        console.log(file, `desborde=${overflow}`, note);
      }
    }
  }
}
fs.writeFileSync(path.join(OUT, 'indice.json'), JSON.stringify(index, null, 2));
ws.close();
chrome.kill();
await sleep(500);
try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}

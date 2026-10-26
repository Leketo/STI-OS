"use client";

import { useCallback, useEffect, useState } from "react";
import { deviceLocation, errorFor, postWithCsrf, sendWithCsrf, uploadWithCsrf } from "./api";
import { SignaturePad } from "./signature-pad";

type Role = "ADMIN" | "SUPERVISOR" | "USUARIO" | "CLIENTE";
type Assignee = { id: string; name: string; confirmed: boolean };
type Task = {
  id: string; code: string; projectId: string; title: string; detail: string | null;
  status: string; createdAt: string; assignees: Assignee[]; confirmed: number; pending: number;
  photoCount: number; signed: boolean;
};
type Photo = { id: string; contentType: string; byteSize: number; uploadedAt: string; uploadedBy: string };
type Signature = { id: string; signerName: string; signedOn: string; signedAt: string; presentedBy: string; remote: boolean; current: boolean };
type TaskEvent = { id: string; kind: string; fromStatus: string | null; toStatus: string | null; actorName: string; occurredAt: string; locationAbsentReason: string | null };
type Detail = Task & { events: TaskEvent[]; photos: Photo[]; signatures: Signature[] };
type Project = { id: string; clientId: string; name: string };
type Operator = { id: string; name: string; role: Role };

const COLUMNS = [
  { status: "POR_HACER", label: "Por hacer" },
  { status: "EN_PROCESO", label: "En proceso" },
  { status: "FINALIZADO", label: "Finalizadas" },
];
const INVOICED = { status: "FACTURADO", label: "Facturadas" };
const MAX_PHOTOS = 5;
const inputClass = "w-full rounded-lg border border-slate-300 px-3 py-2.5 focus:border-blue-600 focus:outline-none";
const actionClass = "rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold hover:bg-slate-100 disabled:opacity-60";

export function TaskBoard({ account }: { account: { id: string; role: Role } }) {
  const operator = account.role === "ADMIN" || account.role === "SUPERVISOR";
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [operators, setOperators] = useState<Operator[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");
  const [projectId, setProjectId] = useState("");
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [opened, setOpened] = useState<Detail | null>(null);
  const [signing, setSigning] = useState("");

  const load = useCallback(async () => {
    const [taskResponse, projectResponse] = await Promise.all([
      fetch("/api/tasks", { credentials: "same-origin", cache: "no-store" }),
      fetch("/api/projects", { credentials: "same-origin", cache: "no-store" }),
    ]);
    if (!taskResponse.ok || !projectResponse.ok) throw new Error("catalog");
    setTasks(await taskResponse.json() as Task[]);
    setProjects(await projectResponse.json() as Project[]);
    if (operator) {
      const response = await fetch("/api/operators", { credentials: "same-origin", cache: "no-store" });
      if (response.ok) setOperators(await response.json() as Operator[]);
    }
  }, [operator]);

  async function openDetail(taskId: string) {
    if (opened && opened.id === taskId) { setOpened(null); return; }
    setBusy(taskId);
    try {
      const response = await fetch(`/api/tasks/${taskId}`, { credentials: "same-origin", cache: "no-store" });
      if (!response.ok) { setMessage(errorFor(response)); return; }
      setOpened(await response.json() as Detail);
    } catch {
      setMessage("No se pudo cargar el detalle de la tarea.");
    } finally {
      setBusy("");
    }
  }

  async function refreshDetail(taskId: string) {
    const response = await fetch(`/api/tasks/${taskId}`, { credentials: "same-origin", cache: "no-store" });
    if (response.ok) setOpened(await response.json() as Detail);
  }

  async function upload(taskId: string, file: File) {
    setBusy(taskId);
    setMessage("");
    try {
      const response = await uploadWithCsrf(`/api/tasks/${taskId}/photos`, file);
      if (!response.ok) {
        setMessage(response.status === 413 ? "La foto supera los 10 MB." : errorFor(response));
        return;
      }
      await load();
      await refreshDetail(taskId);
    } catch {
      setMessage("No se pudo subir la foto.");
    } finally {
      setBusy("");
    }
  }

  async function sign(taskId: string, signerName: string, signedOn: string, image: string) {
    setBusy(taskId);
    setMessage("");
    try {
      const response = await postWithCsrf(`/api/tasks/${taskId}/signature`, {
        signerName, signedOn, image, location: await deviceLocation(),
      });
      if (!response.ok) {
        setMessage(response.status === 409 ? "La tarea ya tiene una firma vigente." : errorFor(response));
        return;
      }
      setSigning("");
      await load();
      await refreshDetail(taskId);
    } catch {
      setMessage("No se pudo registrar la firma.");
    } finally {
      setBusy("");
    }
  }

  useEffect(() => {
    let active = true;
    Promise.resolve().then(load).catch(() => { if (active) setMessage("No se pudieron cargar las tareas."); });
    return () => { active = false; };
  }, [load]);

  async function act(path: string, body: object, taskId: string, method = "POST") {
    setBusy(taskId);
    setMessage("");
    try {
      const response = await sendWithCsrf(method, path, body);
      if (!response.ok) { setMessage(errorFor(response)); return; }
      await load();
      if (opened && opened.id === taskId) await refreshDetail(taskId);
    } catch {
      setMessage("No se pudo conectar con el servidor local. La acción pudo no registrarse.");
    } finally {
      setBusy("");
    }
  }

  async function refresh() {
    setBusy("load");
    setMessage("");
    try {
      await load();
    } catch {
      setMessage("No se pudieron cargar las tareas.");
    } finally {
      setBusy("");
    }
  }

  async function move(task: Task, to: string) {
    await act(`/api/tasks/${task.id}/status`, { to, location: await deviceLocation() }, task.id);
  }

  async function confirm(task: Task) {
    await act(`/api/tasks/${task.id}/confirmations`, { location: await deviceLocation() }, task.id);
  }

  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("new");
    setMessage("");
    try {
      const response = await postWithCsrf("/api/tasks", {
        projectId, title: title.trim(), detail: detail.trim() || null, location: await deviceLocation(),
      });
      if (!response.ok) { setMessage(errorFor(response)); return; }
      setTitle("");
      setDetail("");
      await load();
    } catch {
      setMessage("No se pudo confirmar el alta. Revisá el tablero antes de intentar otra vez.");
    } finally {
      setBusy("");
    }
  }

  function actions(task: Task) {
    const mine = task.assignees.some(assignee => assignee.id === account.id);
    const confirmedByMe = task.assignees.some(assignee => assignee.id === account.id && assignee.confirmed);
    const disabled = busy === task.id;
    return <div className="mt-3 flex flex-wrap gap-2">
      {task.status === "POR_HACER" && (operator || mine) &&
        <button className={actionClass} disabled={disabled} onClick={() => move(task, "EN_PROCESO")}>Iniciar</button>}
      {task.status === "EN_PROCESO" && mine && !confirmedByMe &&
        <button className={actionClass} disabled={disabled} onClick={() => confirm(task)}>Confirmar mi parte</button>}
      {task.status === "EN_PROCESO" && operator &&
        <button className={actionClass} disabled={disabled} onClick={() => move(task, "POR_HACER")}>Volver a por hacer</button>}
      {task.status === "FINALIZADO" && operator &&
        <button className={actionClass} disabled={disabled} onClick={() => move(task, "EN_PROCESO")}>Reabrir</button>}
      {task.status === "FINALIZADO" && !task.signed && (operator || mine || account.role === "CLIENTE") &&
        <button className={actionClass} disabled={disabled}
          onClick={() => setSigning(signing === task.id ? "" : task.id)}>Firmar conformidad</button>}
      {task.status === "FINALIZADO" && task.signed && account.role === "ADMIN" &&
        <button className={actionClass} disabled={disabled} onClick={() => move(task, "FACTURADO")}>Marcar facturada</button>}
      {account.role === "ADMIN" && task.status !== "FINALIZADO" && task.status !== "FACTURADO" &&
        <button className={actionClass} disabled={disabled} onClick={() => move(task, "ANULADA")}>Anular</button>}
    </div>;
  }

  function attachments(task: Task) {
    const mine = task.assignees.some(assignee => assignee.id === account.id);
    const open = task.status === "POR_HACER" || task.status === "EN_PROCESO";
    if (!open || !(operator || mine || account.role === "CLIENTE") || task.photoCount >= MAX_PHOTOS) return null;
    return <label className="mt-3 block text-xs text-slate-600">
      Agregar foto ({task.photoCount}/{MAX_PHOTOS})
      <input type="file" accept="image/jpeg,image/png" disabled={busy === task.id} className="mt-1 block w-full text-xs"
        onChange={event => {
          const file = event.target.files ? event.target.files[0] : null;
          event.target.value = "";
          if (file) upload(task.id, file);
        }} />
    </label>;
  }

  function panel(task: Task) {
    if (!opened || opened.id !== task.id) return null;
    return <div className="mt-3 space-y-3 rounded-lg bg-slate-50 p-3 text-xs">
      {opened.photos.length > 0 && <div className="flex flex-wrap gap-2">
        {opened.photos.map(photo => <a key={photo.id} href={`/api/tasks/${task.id}/photos/${photo.id}`}
          target="_blank" rel="noreferrer" title={`Subida por ${photo.uploadedBy}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/tasks/${task.id}/photos/${photo.id}`} alt={`Foto subida por ${photo.uploadedBy}`}
            className="h-20 w-20 rounded border border-slate-300 object-cover" />
        </a>)}
      </div>}
      {opened.signatures.map(signature => <div key={signature.id}
        className={signature.current ? "rounded border border-emerald-300 bg-white p-2" : "rounded border border-slate-300 bg-white p-2 opacity-70"}>
        <p className="font-semibold">{signature.current ? "Firma vigente" : "Firma superada"}</p>
        <p>{signature.signerName} · {signature.signedOn} · presentada por {signature.presentedBy}
          {signature.remote ? " (a distancia)" : " (presencial)"}</p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/api/tasks/${task.id}/signature?signatureId=${signature.id}`} alt={`Firma de ${signature.signerName}`}
          className="mt-1 h-16 bg-white" />
      </div>)}
      <ol className="space-y-1">
        {opened.events.map(event => <li key={event.id}>
          <span className="font-mono">{event.kind}</span>
          {event.toStatus ? ` → ${event.toStatus}` : ""} · {event.actorName} · {new Date(event.occurredAt).toLocaleString()}
          {event.locationAbsentReason ? ` · sin ubicación` : ""}
        </li>)}
      </ol>
    </div>;
  }

  function assignment(task: Task) {
    if (!operator || task.status === "FINALIZADO") return null;
    const free = operators.filter(candidate => !task.assignees.some(assignee => assignee.id === candidate.id));
    return <div className="mt-3 flex flex-wrap items-center gap-2">
      <label className="sr-only" htmlFor={`assign-${task.id}`}>Asignar a</label>
      <select id={`assign-${task.id}`} className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
        defaultValue="" disabled={busy === task.id || free.length === 0}
        onChange={event => { if (event.target.value) act(`/api/tasks/${task.id}/assignments`, { userId: event.target.value }, task.id); }}>
        <option value="">{free.length === 0 ? "Sin personas libres" : "Asignar a…"}</option>
        {free.map(candidate => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
      </select>
    </div>;
  }

  function card(task: Task) {
    const project = projects.find(candidate => candidate.id === task.projectId);
    return <article key={task.id} className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
        <span className="font-mono">{task.code}</span>
        <span className="flex items-center gap-2">
          {task.photoCount > 0 && <span title="Fotos adjuntas">{task.photoCount} 📷</span>}
          {task.signed && <span className="text-emerald-700" title="Firma vigente">Firmada</span>}
          {task.assignees.length > 1 && <span>{task.confirmed} de {task.assignees.length}</span>}
        </span>
      </div>
      <h4 className="mt-1 font-semibold">{task.title}</h4>
      <p className="mt-1 text-xs text-slate-600">{project ? project.name : "Proyecto fuera de tu alcance"}</p>
      {task.detail && <p className="mt-2 text-sm text-slate-700">{task.detail}</p>}
      <ul className="mt-2 flex flex-wrap gap-1">
        {task.assignees.map(assignee => <li key={assignee.id}
          className={`rounded-full px-2 py-0.5 text-xs ${assignee.confirmed ? "bg-emerald-100 text-emerald-900" : "bg-slate-100 text-slate-700"}`}>
          {assignee.name}{assignee.confirmed ? " ✓" : ""}
          {operator && task.status !== "FINALIZADO" && <button className="ml-1 font-bold" aria-label={`Quitar a ${assignee.name}`}
            disabled={busy === task.id}
            onClick={() => act(`/api/tasks/${task.id}/assignments/${assignee.id}`, {}, task.id, "DELETE")}>×</button>}
        </li>)}
        {task.assignees.length === 0 && <li className="text-xs text-slate-500">Sin asignar</li>}
      </ul>
      {assignment(task)}
      {attachments(task)}
      {actions(task)}
      <button type="button" className="mt-2 text-xs font-semibold text-blue-700 hover:underline"
        disabled={busy === task.id} onClick={() => openDetail(task.id)}>
        {opened && opened.id === task.id ? "Ocultar detalle" : "Ver detalle e historial"}
      </button>
      {signing === task.id && <SignaturePad busy={busy === task.id} onCancel={() => setSigning("")}
        onSign={(signerName, signedOn, image) => sign(task.id, signerName, signedOn, image)} />}
      {panel(task)}
    </article>;
  }

  return <div className="mt-8 space-y-6 border-t border-slate-200 pt-8">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="text-xl font-bold">Órdenes de servicio</h2>
        <p className="mt-1 text-sm text-slate-600">
          Datos reales de tu cuenta. Cada paso guarda quién lo hizo, cuándo y la ubicación del dispositivo.
        </p>
      </div>
      <button type="button" className={actionClass} disabled={busy === "load"} onClick={refresh}>Actualizar</button>
    </div>

    <form onSubmit={create} className="space-y-3 rounded-xl border border-slate-200 p-4 sm:p-5">
      <h3 className="font-semibold">Nueva tarea</h3>
      <div>
        <label htmlFor="task-project" className="mb-1 block text-sm font-medium">Proyecto</label>
        <select id="task-project" className={inputClass} required value={projectId}
          onChange={event => setProjectId(event.target.value)}>
          <option value="">Seleccioná un proyecto</option>
          {projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor="task-title" className="mb-1 block text-sm font-medium">Título</label>
        <input id="task-title" className={inputClass} required maxLength={200} value={title}
          onChange={event => setTitle(event.target.value)} />
      </div>
      <div>
        <label htmlFor="task-detail" className="mb-1 block text-sm font-medium">Detalle (opcional)</label>
        <textarea id="task-detail" className={inputClass} rows={2} maxLength={4000} value={detail}
          onChange={event => setDetail(event.target.value)} />
      </div>
      <p className="text-xs text-slate-500">
        La tarea se crea en Por hacer. {account.role === "USUARIO" ? "Vas a quedar asignado automáticamente." : null}
        {account.role === "CLIENTE" ? "Un supervisor la asignará después." : null}
      </p>
      <button type="submit" disabled={busy === "new" || !projectId}
        className="rounded-lg bg-blue-600 px-4 py-2.5 font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
        {busy === "new" ? "Guardando…" : "Crear tarea"}
      </button>
    </form>

    {message && <p role="alert" className="text-sm text-red-700">{message}</p>}

    <div className={operator ? "grid gap-4 sm:grid-cols-2 xl:grid-cols-4" : "grid gap-4 sm:grid-cols-3"}>
      {(operator ? [...COLUMNS, INVOICED] : COLUMNS).map(column => {
        const visible = tasks.filter(task => task.status === column.status);
        return <section key={column.status} className="rounded-xl bg-slate-50 p-3">
          <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-600">
            {column.label} <span className="font-normal">({visible.length})</span>
          </h3>
          <div className="space-y-3">
            {visible.map(card)}
            {visible.length === 0 && <p className="text-xs text-slate-500">Sin tareas.</p>}
          </div>
        </section>;
      })}
    </div>
  </div>;
}

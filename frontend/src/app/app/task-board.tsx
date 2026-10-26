"use client";

import { useCallback, useEffect, useState } from "react";
import { deviceLocation, errorFor, postWithCsrf, sendWithCsrf } from "./api";

type Role = "ADMIN" | "SUPERVISOR" | "USUARIO" | "CLIENTE";
type Assignee = { id: string; name: string; confirmed: boolean };
type Task = {
  id: string; code: string; projectId: string; title: string; detail: string | null;
  status: string; createdAt: string; assignees: Assignee[]; confirmed: number; pending: number;
};
type Project = { id: string; clientId: string; name: string };
type Operator = { id: string; name: string; role: Role };

const COLUMNS = [
  { status: "POR_HACER", label: "Por hacer" },
  { status: "EN_PROCESO", label: "En proceso" },
  { status: "FINALIZADO", label: "Finalizadas" },
];
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
      {account.role === "ADMIN" && task.status !== "FINALIZADO" &&
        <button className={actionClass} disabled={disabled} onClick={() => move(task, "ANULADA")}>Anular</button>}
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
        {task.assignees.length > 1 && <span>{task.confirmed} de {task.assignees.length}</span>}
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
      {actions(task)}
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

    <div className="grid gap-4 sm:grid-cols-3">
      {COLUMNS.map(column => {
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

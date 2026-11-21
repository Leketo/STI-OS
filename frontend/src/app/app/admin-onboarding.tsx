"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  ArrowRight,
  Building2,
  FolderKanban,
  LoaderCircle,
  Pencil,
  Plus,
  Search,
} from "lucide-react";
import { errorFor, postWithCsrf, sendWithCsrf } from "./api";

import { EmptyState, Panel } from "./workspace-ui";
import type { WorkspaceData } from "./use-workspace-data";

/** User management lives in users.tsx since corte 2 (ENCARGO-DEV-002). */
type View = "clients" | "projects";
/** Corte 3B (R-05, bocetos 7.4 and 7.5): what is being renamed. */
type Editing = { kind: "client" | "project"; id: string; name: string; clientId?: string };
type ClientSummary = { projects: number; tasks: number; clientUsers: number };
type ProjectSummary = { tasks: number; byStatus: Record<string, number> };
const STATUS_NAMES: Record<string, string> = {
  POR_HACER: "Por hacer",
  EN_PROCESO: "En proceso",
  FINALIZADO: "Finalizadas",
  FACTURADO: "Facturadas",
  NO_FACTURABLE: "No facturables",
  ANULADA: "Anuladas",
};
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const content = {
  clients: {
    title: "Clientes",
    description: "Cada relación, con sus proyectos a mano.",
    singular: "cliente",
    icon: Building2,
  },
  projects: {
    title: "Proyectos",
    description: "El contexto que organiza cada tarea.",
    singular: "proyecto",
    icon: FolderKanban,
  },
};

export function AdminOnboarding({
  view,
  data,
  admin,
  onOpenProject,
  initialClientId = "",
  initialClientFilter = "",
  onCreateProject,
  onShowProjects,
}: {
  view: View;
  data: WorkspaceData;
  admin: boolean;
  onOpenProject: (id: string) => void;
  initialClientId?: string;
  initialClientFilter?: string;
  onCreateProject: (clientId: string) => void;
  onShowProjects: (clientId: string) => void;
}) {
  // Keyed form state prevents a draft for one entity from being submitted as another.
  return (
    <CatalogView
      key={`${view}-${initialClientId}-${initialClientFilter}`}
      view={view}
      data={data}
      admin={admin}
      onOpenProject={onOpenProject}
      initialClientId={initialClientId}
      initialClientFilter={initialClientFilter}
      onCreateProject={onCreateProject}
      onShowProjects={onShowProjects}
    />
  );
}
function CatalogView({
  view,
  data,
  admin,
  onOpenProject,
  initialClientId = "",
  initialClientFilter = "",
  onCreateProject,
  onShowProjects,
}: {
  view: View;
  data: WorkspaceData;
  admin: boolean;
  onOpenProject: (id: string) => void;
  initialClientId?: string;
  initialClientFilter?: string;
  onCreateProject: (clientId: string) => void;
  onShowProjects: (clientId: string) => void;
}) {
  const { clients, projects, tasks, busy, loading, mutate } = data;
  const meta = content[view];
  const Icon = meta.icon;
  const [search, setSearch] = useState("");
  const [clientFilter, setClientFilter] = useState(initialClientFilter);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [creating, setCreating] = useState(
    view === "projects" && !!initialClientId,
  );
  const [name, setName] = useState("");
  const [clientId, setClientId] = useState(initialClientId);
  const [message, setMessage] = useState("");
  const matching = (value: string) =>
    value
      .toLocaleLowerCase("es")
      .includes(search.trim().toLocaleLowerCase("es"));

  function startCreate(client = "") {
    setClientId(client);
    setMessage("");
    setCreating(true);
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) return;
    const endpoint = view === "clients" ? "/api/clients" : "/api/projects";
    const body =
      view === "clients"
        ? { name: name.trim() }
        : { clientId, name: name.trim() };
    const ok = await mutate(
      `new-${view}`,
      () => postWithCsrf(endpoint, body),
      `${view === "clients" ? "Cliente creado" : "Proyecto creado"}.`,
      errorFor,
    );
    if (ok) {
      setName("");
      setCreating(false);
    } else
      setMessage(data.mutationError.current || "No se pudo confirmar el alta.");
  }

  return (
    <>
      <div className="sti-page-heading">
        <div>
          <p className="sti-eyebrow">ESPACIO DE TRABAJO</p>
          <h1>
            {meta.title}
            <span className="sti-heading-dot">.</span>
          </h1>
          <p>{meta.description}</p>
        </div>
        {admin && (
          <button
            className="sti-button primary"
            disabled={loading || !!busy}
            onClick={() => startCreate()}
          >
            <Plus size={17} />
            {`Nuevo ${meta.singular}`}
          </button>
        )}
      </div>
      <div className="sti-catalog-toolbar">
        <div className="sti-search">
          <Search size={16} />
          <label className="sr-only" htmlFor="catalog-search">
            Buscar {meta.title.toLowerCase()}
          </label>
          <input
            id="catalog-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Buscar ${meta.title.toLowerCase()}…`}
          />
        </div>
        {view === "projects" && (
          <div className="sti-field compact">
            <label className="sr-only" htmlFor="catalog-client">
              Filtrar proyectos por cliente
            </label>
            <select
              id="catalog-client"
              value={clientFilter}
              onChange={(e) => setClientFilter(e.target.value)}
            >
              <option value="">Todos los clientes</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
      {loading && (
        <div className="sti-loading" role="status">
          <LoaderCircle size={22} className="sti-spin" />
          Cargando…
        </div>
      )}
      {view === "clients" && (
        <div className="sti-catalog-grid">
          {clients
            .filter((c) => matching(c.name))
            .map((client) => {
              const related = projects.filter((p) => p.clientId === client.id);
              return (
                <article className="sti-catalog-card" key={client.id}>
                  <div className="sti-catalog-card-top">
                    <span className="sti-catalog-icon">
                      <Building2 size={22} />
                    </span>
                    <span className="sti-status neutral">
                      {related.length}{" "}
                      {related.length === 1 ? "proyecto" : "proyectos"}
                    </span>
                  </div>
                  <h2>{client.name}</h2>
                  {admin && (
                    <button
                      className="sti-text-action sti-edit-action"
                      disabled={!!busy}
                      aria-label={`Editar ${client.name}`}
                      onClick={() =>
                        setEditing({ kind: "client", id: client.id, name: client.name })
                      }
                    >
                      <Pencil size={14} /> Editar
                    </button>
                  )}
                  <p>
                    {tasks.filter((t) => t.clientId === client.id).length}{" "}
                    tareas en tu alcance
                  </p>
                  <div className="sti-client-projects">
                    {related.map((p) => (
                      <button key={p.id} onClick={() => onOpenProject(p.id)}>
                        <FolderKanban size={14} />
                        <span>{p.name}</span>
                        <ArrowRight size={14} />
                      </button>
                    ))}
                    {!related.length && (
                      <span className="sti-muted">
                        Todavía no hay proyectos.
                      </span>
                    )}
                  </div>
                  {admin && (
                    <button
                      className="sti-text-action"
                      onClick={() => onCreateProject(client.id)}
                    >
                      Crear proyecto para este cliente <Plus size={14} />
                    </button>
                  )}
                </article>
              );
            })}
        </div>
      )}
      {view === "projects" && (
        <div className="sti-catalog-grid">
          {projects
            .filter(
              (p) =>
                (!clientFilter || p.clientId === clientFilter) &&
                matching(
                  `${p.name} ${clients.find((c) => c.id === p.clientId)?.name ?? ""}`,
                ),
            )
            .map((project) => {
              const related = tasks.filter((t) => t.projectId === project.id);
              return (
                <article className="sti-catalog-card" key={project.id}>
                  <div className="sti-catalog-card-top">
                    <span className="sti-catalog-icon violet">
                      <FolderKanban size={22} />
                    </span>
                    <span className="sti-status neutral">
                      {related.length} tareas
                    </span>
                  </div>
                  <p className="sti-eyebrow">
                    {clients.find((c) => c.id === project.clientId)?.name ??
                      "Cliente"}
                  </p>
                  <h2>{project.name}</h2>
                  {admin && (
                    <button
                      className="sti-text-action sti-edit-action"
                      disabled={!!busy}
                      aria-label={`Editar ${project.name}`}
                      onClick={() =>
                        setEditing({
                          kind: "project",
                          id: project.id,
                          name: project.name,
                          clientId: project.clientId,
                        })
                      }
                    >
                      <Pencil size={14} /> Editar
                    </button>
                  )}
                  <p>
                    {related.filter((t) => t.status === "EN_PROCESO").length} en
                    proceso ·{" "}
                    {related.filter((t) => t.status === "FINALIZADO").length}{" "}
                    finalizadas
                  </p>
                  <button
                    className="sti-button secondary"
                    onClick={() => onOpenProject(project.id)}
                  >
                    Ver tareas <ArrowRight size={15} />
                  </button>
                </article>
              );
            })}
        </div>
      )}
      {!loading &&
        data.hasLoaded &&
        ((view === "clients" && !clients.some((c) => matching(c.name))) ||
          (view === "projects" &&
            !projects.some(
              (p) =>
                (!clientFilter || p.clientId === clientFilter) &&
                matching(
                  `${p.name} ${clients.find((c) => c.id === p.clientId)?.name ?? ""}`,
                ),
            ))) && (
          <EmptyState
            icon={<Icon size={28} />}
            title={
              search || clientFilter
                ? "No encontramos coincidencias"
                : `Todavía no hay ${meta.title.toLowerCase()}`
            }
          >
            {search || clientFilter
              ? "Probá con otra búsqueda o cambiá el filtro."
              : admin
                ? `Usá el botón de arriba para crear tu primer ${meta.singular}.`
                : "Los datos disponibles para tu cuenta aparecerán acá."}
          </EmptyState>
        )}

      {editing && (
        <EditPanel
          key={`${editing.kind}-${editing.id}`}
          editing={editing}
          data={data}
          onClose={() => setEditing(null)}
          onShowProjects={(id) => {
            setEditing(null);
            onShowProjects(id);
          }}
          onOpenProject={(id) => {
            setEditing(null);
            onOpenProject(id);
          }}
        />
      )}
      {creating && (
        <Panel
          title={`Nuevo ${meta.singular}`}
          eyebrow={meta.title.toUpperCase()}
          busy={!!busy}
          onClose={() => setCreating(false)}
        >
          <p className="sti-panel-intro">
            {view === "clients"
              ? "Empezá por el nombre. Después podés organizar sus proyectos."
              : "Cada proyecto pertenece a un cliente y reúne sus tareas."}
          </p>
          <form className="sti-form" onSubmit={submit}>
            {view === "projects" && (
              <div className="sti-field">
                <label htmlFor="project-client">
                  Cliente <span>*</span>
                </label>
                <select
                  id="project-client"
                  value={clientId}
                  required
                  disabled={!!busy}
                  onChange={(e) => setClientId(e.target.value)}
                >
                  <option value="">Seleccioná un cliente</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                {!clients.length && (
                  <p>Creá primero un cliente en la sección Clientes.</p>
                )}
              </div>
            )}
            <div className="sti-field">
              <label htmlFor="entity-name">
                {view === "clients" ? "Nombre del cliente" : "Nombre del proyecto"}{" "}
                <span>*</span>
              </label>
              <input
                id="entity-name"
                data-autofocus
                required
                maxLength={200}
                value={name}
                disabled={!!busy}
                onChange={(e) => setName(e.target.value)}
                placeholder={
                  view === "projects"
                    ? "Ej.: Casa central"
                    : "Ej.: Nombre de la empresa"
                }
              />
            </div>
            {message && (
              <p className="sti-inline-message" role="alert">
                {message}
              </p>
            )}
            <div className="sti-form-actions">
              <button
                type="button"
                className="sti-button secondary"
                disabled={!!busy}
                onClick={() => setCreating(false)}
              >
                Volver
              </button>
              <button
                type="submit"
                className="sti-button primary"
                disabled={
                  !!busy ||
                  !name.trim() ||
                  (view === "projects" && !clientId)
                }
              >
                {busy ? (
                  <LoaderCircle size={16} className="sti-spin" />
                ) : (
                  <Plus size={16} />
                )}
                {busy ? "Creando…" : `Crear ${meta.singular}`}
              </button>
            </div>
          </form>
        </Panel>
      )}
    </>
  );
}

/** Corte 3B (R-05, bocetos 7.4 and 7.5): ADMIN renames a company or a project. */
function EditPanel({
  editing,
  data,
  onClose,
  onShowProjects,
  onOpenProject,
}: {
  editing: Editing;
  data: WorkspaceData;
  onClose: () => void;
  onShowProjects: (clientId: string) => void;
  onOpenProject: (projectId: string) => void;
}) {
  const { clients, busy, mutate } = data;
  const client = editing.kind === "client";
  const [name, setName] = useState(editing.name);
  const [message, setMessage] = useState("");
  const [summary, setSummary] = useState<ClientSummary | ProjectSummary | null>(null);
  const [summaryError, setSummaryError] = useState(false);
  useEffect(() => {
    let live = true;
    fetch(`/api/${client ? "clients" : "projects"}/${editing.id}/summary`, {
      credentials: "same-origin",
      cache: "no-store",
    })
      .then((response) => (response.ok ? response.json() : Promise.reject(response)))
      .then((body) => live && setSummary(body))
      .catch(() => live && setSummaryError(true));
    return () => {
      live = false;
    };
  }, [client, editing.id]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) return;
    let refusal = "";
    const ok = await mutate(
      `edit-${editing.id}`,
      async () => {
        const response = await sendWithCsrf(
          "PUT",
          `/api/${client ? "clients" : "projects"}/${editing.id}`,
          { name: name.trim() },
        );
        if (!response.ok) {
          const body = (await response
            .clone()
            .json()
            .catch(() => null)) as { message?: string } | null;
          refusal = body?.message ?? "";
        }
        return response;
      },
      client ? "Cliente guardado." : "Proyecto guardado.",
      (response) => refusal || errorFor(response),
    );
    if (ok) onClose();
    else setMessage(refusal || data.mutationError.current || "No se pudo guardar.");
  }

  const clientSummary = client ? (summary as ClientSummary | null) : null;
  const projectSummary = client ? null : (summary as ProjectSummary | null);
  return (
    <Panel
      title={client ? "Editar cliente" : "Editar proyecto"}
      eyebrow="SOLO ADMINISTRADOR"
      busy={!!busy}
      onClose={onClose}
    >
      <form className="sti-form" onSubmit={save}>
        <div className="sti-field">
          <label htmlFor="edit-name">
            {client ? "Nombre de la empresa" : "Nombre del proyecto"} <span>*</span>
          </label>
          <input
            id="edit-name"
            data-autofocus
            required
            maxLength={200}
            value={name}
            disabled={!!busy}
            onChange={(e) => {
              setName(e.target.value);
              setMessage("");
            }}
          />
          <p className="sti-form-help">
            {client
              ? "No puede repetirse con otra empresa."
              : "No puede repetirse dentro del mismo cliente."}
          </p>
        </div>
        {!client && (
          <div className="sti-field">
            <label htmlFor="edit-client">Cliente</label>
            <input
              id="edit-client"
              readOnly
              disabled
              value={clients.find((c) => c.id === editing.clientId)?.name ?? "Cliente"}
            />
            <p className="sti-form-help">
              No se puede cambiar: las tareas del proyecto pertenecen a esta empresa.
            </p>
          </div>
        )}
        <div className="sti-edit-summary" aria-live="polite">
          {!summary && !summaryError && <span className="sti-muted">Contando…</span>}
          {summaryError && (
            <span className="sti-muted">No se pudieron contar sus datos.</span>
          )}
          {clientSummary && (
            <>
              <strong>
                {plural(clientSummary.projects, "proyecto", "proyectos")} ·{" "}
                {plural(clientSummary.tasks, "tarea", "tareas")}
              </strong>
              <span>
                {plural(clientSummary.clientUsers, "usuario cliente", "usuarios cliente")}
              </span>
              <button
                type="button"
                className="sti-text-action"
                onClick={() => onShowProjects(editing.id)}
              >
                Ver proyectos <ArrowRight size={14} />
              </button>
            </>
          )}
          {projectSummary && (
            <>
              <strong>{plural(projectSummary.tasks, "tarea", "tareas")}</strong>
              {projectSummary.tasks > 0 && (
                <span>
                  {Object.entries(projectSummary.byStatus)
                    .map(([status, n]) => `${STATUS_NAMES[status] ?? status}: ${n}`)
                    .join(" · ")}
                </span>
              )}
              <button
                type="button"
                className="sti-text-action"
                onClick={() => onOpenProject(editing.id)}
              >
                Ver tareas <ArrowRight size={14} />
              </button>
            </>
          )}
        </div>
        <p className="sti-form-help">
          El nombre nuevo se ve enseguida en el tablero, las tareas y la constancia.
          Queda registrado quién lo cambió y cuándo.
        </p>
        {message && (
          <p className="sti-inline-message" role="alert">
            {message}
          </p>
        )}
        <div className="sti-form-actions">
          <button
            type="button"
            className="sti-button secondary"
            disabled={!!busy}
            onClick={onClose}
          >
            Cancelar
          </button>
          <button
            type="submit"
            className="sti-button primary"
            disabled={!!busy || !name.trim()}
          >
            {busy ? "Guardando…" : "Guardar cambios"}
          </button>
        </div>
      </form>
    </Panel>
  );
}

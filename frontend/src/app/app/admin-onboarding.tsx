"use client";

import { useState, type FormEvent } from "react";
import {
  ArrowRight,
  Building2,
  FolderKanban,
  LoaderCircle,
  Plus,
  Search,
  Users,
} from "lucide-react";
import { errorFor, postWithCsrf } from "./api";
import { initials, type Role } from "./task-model";
import { EmptyState, Panel } from "./workspace-ui";
import type { WorkspaceData } from "./use-workspace-data";

type View = "clients" | "projects" | "users";
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
  users: {
    title: "Usuarios",
    description: "Las personas que hacen que todo avance.",
    singular: "cuenta",
    icon: Users,
  },
};
const roles: Record<Role, string> = {
  ADMIN: "Administrador",
  SUPERVISOR: "Supervisor",
  USUARIO: "Técnico",
  CLIENTE: "Cliente",
};

export function AdminOnboarding({
  view,
  data,
  admin,
  onOpenProject,
  initialClientId = "",
  onCreateProject,
}: {
  view: View;
  data: WorkspaceData;
  admin: boolean;
  onOpenProject: (id: string) => void;
  initialClientId?: string;
  onCreateProject: (clientId: string) => void;
}) {
  // Keyed form state prevents a draft for one entity from being submitted as another.
  return (
    <CatalogView
      key={`${view}-${initialClientId}`}
      view={view}
      data={data}
      admin={admin}
      onOpenProject={onOpenProject}
      initialClientId={initialClientId}
      onCreateProject={onCreateProject}
    />
  );
}
function CatalogView({
  view,
  data,
  admin,
  onOpenProject,
  initialClientId = "",
  onCreateProject,
}: {
  view: View;
  data: WorkspaceData;
  admin: boolean;
  onOpenProject: (id: string) => void;
  initialClientId?: string;
  onCreateProject: (clientId: string) => void;
}) {
  const { clients, projects, operators, tasks, busy, loading, mutate } = data;
  const meta = content[view];
  const Icon = meta.icon;
  const [search, setSearch] = useState("");
  const [clientFilter, setClientFilter] = useState("");
  const [creating, setCreating] = useState(
    view === "projects" && !!initialClientId,
  );
  const [name, setName] = useState("");
  const [clientId, setClientId] = useState(initialClientId);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("USUARIO");
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
    const endpoint =
      view === "clients"
        ? "/api/clients"
        : view === "projects"
          ? "/api/projects"
          : "/api/accounts";
    const body =
      view === "clients"
        ? { name: name.trim() }
        : view === "projects"
          ? { clientId, name: name.trim() }
          : {
              name: name.trim(),
              email: email.trim().toLowerCase(),
              password,
              role,
              clientId: role === "CLIENTE" ? clientId : null,
            };
    const ok = await mutate(
      `new-${view}`,
      () => postWithCsrf(endpoint, body),
      `${view === "clients" ? "Cliente creado" : view === "projects" ? "Proyecto creado" : "Cuenta creada"}.`,
      (response) =>
        response.status === 409 && view === "users"
          ? "Ese correo ya está registrado."
          : errorFor(response),
    );
    // Never retain an initial password after a submission attempt.
    setPassword("");
    if (ok) {
      setName("");
      setEmail("");
      setCreating(false);
    } else
      setMessage(data.mutationError.current || "No se pudo confirmar el alta.");
  }

  return (
    <>
      <div className="sti-page-heading">
        <div>
          <p className="sti-eyebrow">
            {view === "users" ? "ADMINISTRACIÓN" : "ESPACIO DE TRABAJO"}
          </p>
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
            {view === "users" ? "Nueva cuenta" : `Nuevo ${meta.singular}`}
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
      {view === "users" && (
        <>
          <p className="sti-catalog-explainer">
            Equipo operativo: técnicos, supervisores y administradores. Las
            cuentas de clientes se crean con su cliente asociado.
          </p>
          <div className="sti-table-wrap">
            <table className="sti-table">
              <thead>
                <tr>
                  <th>Persona</th>
                  <th>Rol</th>
                  <th>Tareas asignadas</th>
                </tr>
              </thead>
              <tbody>
                {operators
                  .filter((p) => matching(p.name))
                  .map((person) => (
                    <tr key={person.id}>
                      <td>
                        <span className="sti-person-cell">
                          <span className="sti-avatar">
                            {initials(person.name)}
                          </span>
                          <strong>{person.name}</strong>
                        </span>
                      </td>
                      <td>
                        <span className="sti-status neutral">
                          {roles[person.role]}
                        </span>
                      </td>
                      <td>
                        {
                          tasks.filter((t) =>
                            t.assignees.some((a) => a.id === person.id),
                          ).length
                        }
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </>
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
            )) ||
          (view === "users" && !operators.some((p) => matching(p.name)))) && (
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

      {creating && (
        <Panel
          title={view === "users" ? "Nueva cuenta" : `Nuevo ${meta.singular}`}
          eyebrow={meta.title.toUpperCase()}
          busy={!!busy}
          onClose={() => {
            setCreating(false);
            setPassword("");
          }}
        >
          <p className="sti-panel-intro">
            {view === "clients"
              ? "Empezá por el nombre. Después podés organizar sus proyectos."
              : view === "projects"
                ? "Cada proyecto pertenece a un cliente y reúne sus tareas."
                : "Elegí el rol que corresponde a esta persona."}
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
                {view === "clients"
                  ? "Nombre del cliente"
                  : view === "projects"
                    ? "Nombre del proyecto"
                    : "Nombre completo"}{" "}
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
                    : view === "clients"
                      ? "Ej.: Nombre de la empresa"
                      : "Nombre y apellido"
                }
              />
            </div>
            {view === "users" && (
              <>
                <div className="sti-field">
                  <label htmlFor="account-email">
                    Correo electrónico <span>*</span>
                  </label>
                  <input
                    id="account-email"
                    type="email"
                    autoComplete="off"
                    required
                    maxLength={254}
                    value={email}
                    disabled={!!busy}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <div className="sti-field">
                  <label htmlFor="account-password">
                    Contraseña inicial <span>*</span>
                  </label>
                  <input
                    id="account-password"
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={12}
                    maxLength={1024}
                    value={password}
                    disabled={!!busy}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <p>Usá al menos 12 caracteres.</p>
                </div>
                <div className="sti-field">
                  <label htmlFor="account-role">
                    Rol <span>*</span>
                  </label>
                  <select
                    id="account-role"
                    value={role}
                    disabled={!!busy}
                    onChange={(e) => setRole(e.target.value as Role)}
                  >
                    {(Object.keys(roles) as Role[]).map((r) => (
                      <option key={r} value={r}>
                        {roles[r]}
                      </option>
                    ))}
                  </select>
                </div>
                {role === "CLIENTE" && (
                  <div className="sti-field">
                    <label htmlFor="account-client">
                      Cliente asociado <span>*</span>
                    </label>
                    <select
                      id="account-client"
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
                  </div>
                )}
              </>
            )}
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
                onClick={() => {
                  setCreating(false);
                  setPassword("");
                }}
              >
                Volver
              </button>
              <button
                type="submit"
                className="sti-button primary"
                disabled={
                  !!busy ||
                  !name.trim() ||
                  ((view === "projects" ||
                    (view === "users" && role === "CLIENTE")) &&
                    !clientId)
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

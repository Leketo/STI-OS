"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  ArrowRight,
  Check,
  Copy,
  KeyRound,
  LoaderCircle,
  Pencil,
  Plus,
  TriangleAlert,
  Users,
} from "lucide-react";
import { leaveIfSessionEnded, sendWithCsrf } from "./api";
import { refusalMessage } from "./password-form";
import {
  filterPeople,
  initials,
  phoneProblem,
  ROLE_LABELS,
  type Account,
  type Client,
  type Person,
  type PersonState,
  type Role,
} from "./task-model";
import { EmptyState, Panel } from "./workspace-ui";
import type { WorkspaceData } from "./use-workspace-data";

/** An initial password just drawn by the server. It lives only while its panel is open (rule 1). */
/** N-32: a reset says so. The panel after "Restablecer" is not the one after creating the account. */
type Issued = { name: string; password: string; reset?: boolean };
const ROLES = Object.keys(ROLE_LABELS) as Role[];

/**
 * User management (ENCARGO-DEV-002), ADMIN only. The server is the authority on every rule; this screen
 * shows its refusals as they come.
 */
export function UsersView({
  account,
  data,
  onOpenPerson,
}: {
  account: Account;
  data: WorkspaceData;
  onOpenPerson: (id: string) => void;
}) {
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [role, setRole] = useState<Role | "">("");
  const [state, setState] = useState<PersonState>("all");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Person | null>(null);
  const [issued, setIssued] = useState<Issued | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    const response = await fetch("/api/accounts", {
      credentials: "same-origin",
      cache: "no-store",
      signal,
    });
    if (leaveIfSessionEnded(response)) return;
    if (!response.ok) throw new Error(await refusalMessage(response));
    const next = (await response.json()) as Person[];
    if (!signal?.aborted) setPeople(next);
  }, []);

  const reload = useCallback(async () => {
    setError("");
    try {
      await load();
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "No se pudo cargar la lista.",
      );
    }
  }, [load]);

  useEffect(() => {
    const controller = new AbortController();
    Promise.resolve()
      .then(() => load(controller.signal))
      .catch((failure) => {
        if (!controller.signal.aborted)
          setError(
            failure instanceof Error
              ? failure.message
              : "No se pudo cargar la lista.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [load]);

  /** After any account change: the list, and the people the board offers. */
  async function changed() {
    await reload();
    await data.refresh();
  }

  const shown = filterPeople(people, role, state);

  return (
    <>
      <div className="sti-page-heading">
        <div>
          <p className="sti-eyebrow">ADMINISTRACIÓN</p>
          <h1>
            Usuarios<span className="sti-heading-dot">.</span>
          </h1>
          <p>Quién entra al sistema, con qué rol y qué puede ver.</p>
        </div>
        <button
          className="sti-button primary"
          disabled={loading}
          onClick={() => setCreating(true)}
        >
          <Plus size={17} />
          Nuevo usuario
        </button>
      </div>
      <div className="sti-catalog-toolbar sti-users-toolbar">
        <div className="sti-field compact">
          <label className="sr-only" htmlFor="users-role">
            Filtrar por rol
          </label>
          <select
            id="users-role"
            value={role}
            onChange={(e) => setRole(e.target.value as Role | "")}
          >
            <option value="">Todos los roles</option>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </div>
        <div className="sti-field compact">
          <label className="sr-only" htmlFor="users-state">
            Filtrar por estado
          </label>
          <select
            id="users-state"
            value={state}
            onChange={(e) => setState(e.target.value as PersonState)}
          >
            <option value="all">Activos e inactivos</option>
            <option value="active">Solo activos</option>
            <option value="inactive">Solo inactivos</option>
          </select>
        </div>
        <span className="sti-filter-count" aria-live="polite">
          {shown.length} {shown.length === 1 ? "persona" : "personas"}
        </span>
      </div>
      {error && (
        <p role="alert" className="sti-inline-message">
          {error}
        </p>
      )}
      {loading ? (
        <div className="sti-loading" role="status">
          <LoaderCircle size={22} className="sti-spin" />
          Cargando…
        </div>
      ) : shown.length ? (
        <div className="sti-table-wrap">
          <table className="sti-table sti-users-table">
            <thead>
              <tr>
                <th>Persona</th>
                <th>Rol</th>
                <th>Empresa</th>
                <th>Teléfono</th>
                <th>Tareas asignadas</th>
                <th>Estado</th>
                <th>
                  <span className="sr-only">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map((person) => (
                <tr key={person.id} className={person.active ? "" : "is-inactive"}>
                  <td data-label="Persona">
                    <span className="sti-person-cell">
                      <span className="sti-avatar">{initials(person.name)}</span>
                      <span className="sti-person-text">
                        <strong>{person.name}</strong>
                        <small>{person.email}</small>
                        {person.mustChangePassword && (
                          <small className="sti-person-flag">
                            <KeyRound size={12} aria-hidden="true" />
                            Todavía no cambió la contraseña inicial
                          </small>
                        )}
                      </span>
                    </span>
                  </td>
                  <td data-label="Rol">
                    <span className="sti-status neutral">
                      {ROLE_LABELS[person.role]}
                    </span>
                  </td>
                  <td data-label="Empresa">{person.clientName ?? "—"}</td>
                  <td data-label="Teléfono">{person.phone ?? "—"}</td>
                  <td data-label="Tareas asignadas">
                    {person.role === "CLIENTE" ? (
                      person.assignedTasks
                    ) : (
                      <button
                        className="sti-count-link"
                        onClick={() => onOpenPerson(person.id)}
                        aria-label={`Ver las ${person.assignedTasks} tareas asignadas a ${person.name}`}
                      >
                        {person.assignedTasks}
                        <ArrowRight size={13} aria-hidden="true" />
                      </button>
                    )}
                  </td>
                  <td data-label="Estado">
                    <span
                      className={`sti-status ${person.active ? "green" : "neutral"}`}
                    >
                      {person.active ? "Activo" : "Inactivo"}
                    </span>
                  </td>
                  <td data-label="">
                    <button
                      className="sti-button secondary sti-button-small"
                      onClick={() => setEditing(person)}
                      aria-label={`Editar a ${person.name}`}
                    >
                      <Pencil size={14} aria-hidden="true" />
                      Editar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState icon={<Users size={28} />} title="No hay personas con ese filtro">
          Probá con otro rol o estado.
        </EmptyState>
      )}
      <p className="sti-catalog-explainer sti-users-footnote">
        Desactivar a una persona le quita el acceso y conserva sus tareas y su
        historial. No se borra a nadie.
      </p>

      {creating && (
        <NewUserPanel
          clients={data.clients}
          onClose={() => setCreating(false)}
          onCreated={(name, password) => {
            setCreating(false);
            setIssued({ name, password });
            void changed();
          }}
        />
      )}
      {editing && (
        <EditUserPanel
          key={editing.id}
          person={editing}
          self={editing.id === account.id}
          clients={data.clients}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void changed();
          }}
          onReset={(name, password) => {
            setEditing(null);
            setIssued({ name, password, reset: true });
            void changed();
          }}
          onOpenPerson={(id) => {
            setEditing(null);
            onOpenPerson(id);
          }}
        />
      )}
      {issued && (
        <IssuedPanel issued={issued} onClose={() => setIssued(null)} />
      )}
    </>
  );
}

function CompanyField({
  id,
  clients,
  value,
  disabled,
  onChange,
}: {
  id: string;
  clients: Client[];
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div className="sti-field">
      <label htmlFor={id}>
        Empresa <span>*</span>
      </label>
      <select
        id={id}
        value={value}
        required
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Seleccioná una empresa</option>
        {clients.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      {!clients.length && <p>Creá primero la empresa en la sección Clientes.</p>}
    </div>
  );
}

function NewUserPanel({
  clients,
  onClose,
  onCreated,
}: {
  clients: Client[];
  onClose: () => void;
  onCreated: (name: string, password: string) => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<Role>("USUARIO");
  const [clientId, setClientId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const phoneError = phoneProblem(phone);
  const ready =
    !!name.trim() &&
    !!email.trim() &&
    !phoneError &&
    (role !== "CLIENTE" || !!clientId);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await sendWithCsrf("POST", "/api/accounts", {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        phone: phone.trim(),
        role,
        clientId: role === "CLIENTE" ? clientId : null,
      });
      if (leaveIfSessionEnded(response)) return;
      if (!response.ok) {
        setError(await refusalMessage(response));
        return;
      }
      const created = (await response.json()) as {
        account: { name: string };
        initialPassword: string;
      };
      onCreated(created.account.name, created.initialPassword);
    } catch {
      setError(
        "No pudimos confirmar el alta. Cerrá el panel y revisá la lista antes de intentar de nuevo.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title="Nuevo usuario" eyebrow="USUARIOS" busy={busy} onClose={onClose}>
      <p className="sti-panel-intro">
        Cargá los datos de la persona. El acceso queda listo al crearla.
      </p>
      <form className="sti-form" onSubmit={submit}>
        <div className="sti-field">
          <label htmlFor="new-user-name">
            Nombre y apellido <span>*</span>
          </label>
          <input
            id="new-user-name"
            data-autofocus
            required
            maxLength={200}
            value={name}
            disabled={busy}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="sti-field">
          <label htmlFor="new-user-email">
            Correo <span>*</span>
          </label>
          <input
            id="new-user-email"
            type="email"
            autoComplete="off"
            required
            maxLength={254}
            value={email}
            disabled={busy}
            aria-describedby="new-user-email-help"
            onChange={(e) => setEmail(e.target.value)}
          />
          <p id="new-user-email-help">
            Con este correo ingresa y recupera su contraseña.
          </p>
        </div>
        <div className="sti-field">
          <label htmlFor="new-user-phone">
            Teléfono <small>(opcional)</small>
          </label>
          <input
            id="new-user-phone"
            type="tel"
            maxLength={30}
            value={phone}
            disabled={busy}
            aria-invalid={!!phoneError || undefined}
            aria-describedby={phoneError ? "new-user-phone-error" : undefined}
            onChange={(e) => setPhone(e.target.value)}
          />
          {phoneError && <p id="new-user-phone-error" className="sti-field-error">{phoneError}</p>}
        </div>
        <div className="sti-field">
          <label htmlFor="new-user-role">
            Rol <span>*</span>
          </label>
          <select
            id="new-user-role"
            value={role}
            disabled={busy}
            onChange={(e) => setRole(e.target.value as Role)}
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </div>
        {role === "CLIENTE" && (
          <CompanyField
            id="new-user-company"
            clients={clients}
            value={clientId}
            disabled={busy}
            onChange={setClientId}
          />
        )}
        <p className="sti-callout">
          <KeyRound size={16} aria-hidden="true" />
          <span>
            La contraseña la genera el sistema. Te la mostramos una sola vez al
            crear la cuenta. La persona tiene que cambiarla en su primer
            ingreso.
          </span>
        </p>
        {error && (
          <p role="alert" className="sti-inline-message">
            {error}
          </p>
        )}
        <div className="sti-form-actions">
          <button
            type="button"
            className="sti-button secondary"
            disabled={busy}
            onClick={onClose}
          >
            Cancelar
          </button>
          <button type="submit" className="sti-button primary" disabled={!ready || busy}>
            {busy ? <LoaderCircle size={16} className="sti-spin" /> : <Plus size={16} />}
            {busy ? "Creando…" : "Crear usuario"}
          </button>
        </div>
      </form>
    </Panel>
  );
}

/** Shown once. Closing it drops the only reference the page held to the password. */
function IssuedPanel({ issued, onClose }: { issued: Issued; onClose: () => void }) {
  const [copied, setCopied] = useState<"" | "ok" | "failed">("");
  async function copy() {
    try {
      await navigator.clipboard.writeText(issued.password);
      setCopied("ok");
    } catch {
      setCopied("failed");
    }
  }
  return (
    <Panel
      title={
        issued.reset
          ? `Nueva contraseña inicial para ${issued.name}`
          : `${issued.name} ya puede ingresar`
      }
      eyebrow="CONTRASEÑA INICIAL"
      onClose={onClose}
    >
      <p className="sti-panel-intro">
        Pasásela a la persona por un medio seguro. Deja de servir cuando ingresa
        y elige la suya.
      </p>
      {issued.reset && (
        <p className="sti-form-help">
          La anterior ya no sirve y se cerraron sus sesiones.
        </p>
      )}
      <div className="sti-secret">
        <code aria-label="Contraseña inicial">{issued.password}</code>
        <button
          type="button"
          className="sti-button secondary sti-button-small"
          data-autofocus
          onClick={copy}
        >
          {copied === "ok" ? <Check size={15} /> : <Copy size={15} />}
          {copied === "ok" ? "Copiada" : "Copiar"}
        </button>
      </div>
      <p className="sti-form-help" aria-live="polite">
        {copied === "failed"
          ? "No se pudo copiar. Seleccioná la contraseña y copiala a mano."
          : "Se muestra una sola vez."}
      </p>
      <p className="sti-form-help">
        Si se pierde, la restablecés desde Editar usuario y el sistema genera otra.
      </p>
      <div className="sti-form-actions">
        <button type="button" className="sti-button primary" onClick={onClose}>
          Listo
        </button>
      </div>
    </Panel>
  );
}

function EditUserPanel({
  person,
  self,
  clients,
  onClose,
  onSaved,
  onReset,
  onOpenPerson,
}: {
  person: Person;
  self: boolean;
  clients: Client[];
  onClose: () => void;
  onSaved: () => void;
  onReset: (name: string, password: string) => void;
  onOpenPerson: (id: string) => void;
}) {
  const [name, setName] = useState(person.name);
  const [phone, setPhone] = useState(person.phone ?? "");
  const [email, setEmail] = useState(person.email);
  const [role, setRole] = useState<Role>(person.role);
  const [clientId, setClientId] = useState(person.clientId ?? "");
  const [active, setActive] = useState(person.active);
  const [confirmReset, setConfirmReset] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const phoneError = phoneProblem(phone);
  const ready =
    !!name.trim() &&
    !!email.trim() &&
    !phoneError &&
    (role !== "CLIENTE" || !!clientId);
  // D-82: before saving, say how many tasks in progress the person leaves unconfirmed. It does not block.
  const leavesWork = person.active && !active && person.pendingInProgress > 0;

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await sendWithCsrf("PUT", `/api/accounts/${person.id}`, {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        phone: phone.trim(),
        role,
        clientId: role === "CLIENTE" ? clientId : null,
        active,
      });
      if (leaveIfSessionEnded(response)) return;
      if (!response.ok) {
        setError(await refusalMessage(response));
        return;
      }
      onSaved();
    } catch {
      setError(
        "No pudimos confirmar los cambios. Cerrá el panel y revisá la lista antes de intentar de nuevo.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    setBusy(true);
    setError("");
    try {
      const response = await sendWithCsrf(
        "POST",
        `/api/accounts/${person.id}/password-reset`,
      );
      if (leaveIfSessionEnded(response)) return;
      if (!response.ok) {
        setError(await refusalMessage(response));
        setConfirmReset(false);
        return;
      }
      const body = (await response.json()) as {
        account: { name: string };
        initialPassword: string;
      };
      onReset(body.account.name, body.initialPassword);
    } catch {
      setError(
        "No pudimos confirmar el restablecimiento. Cerrá el panel y revisá la lista antes de intentar de nuevo.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title="Editar usuario" eyebrow="USUARIOS" busy={busy} onClose={onClose}>
      <form className="sti-form" onSubmit={save}>
        <div className="sti-field">
          <label htmlFor="edit-user-name">
            Nombre y apellido <span>*</span>
          </label>
          <input
            id="edit-user-name"
            data-autofocus
            required
            maxLength={200}
            value={name}
            disabled={busy}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="sti-field">
          <label htmlFor="edit-user-phone">
            Teléfono <small>(opcional)</small>
          </label>
          <input
            id="edit-user-phone"
            type="tel"
            maxLength={30}
            value={phone}
            disabled={busy}
            aria-invalid={!!phoneError || undefined}
            aria-describedby={phoneError ? "edit-user-phone-error" : undefined}
            onChange={(e) => setPhone(e.target.value)}
          />
          {phoneError && <p id="edit-user-phone-error" className="sti-field-error">{phoneError}</p>}
        </div>
        <div className="sti-field">
          <label htmlFor="edit-user-email">
            Correo <span>*</span>
          </label>
          <input
            id="edit-user-email"
            type="email"
            autoComplete="off"
            required
            maxLength={254}
            value={email}
            disabled={busy}
            aria-describedby="edit-user-email-help"
            onChange={(e) => setEmail(e.target.value)}
          />
          <p id="edit-user-email-help">
            Si cambia el correo, se cierran sus sesiones abiertas.
          </p>
        </div>
        <div className="sti-field">
          <label htmlFor="edit-user-role">
            Rol <span>*</span>
          </label>
          <select
            id="edit-user-role"
            value={role}
            disabled={busy || self}
            aria-describedby={self ? "edit-user-role-help" : undefined}
            onChange={(e) => setRole(e.target.value as Role)}
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
          {self && (
            <p id="edit-user-role-help">
              Tu propio rol lo cambia otro administrador.
            </p>
          )}
        </div>
        {role === "CLIENTE" && (
          <CompanyField
            id="edit-user-company"
            clients={clients}
            value={clientId}
            disabled={busy}
            onChange={setClientId}
          />
        )}
        <div className="sti-switch-row">
          <label className="sti-switch" htmlFor="edit-user-active">
            <input
              id="edit-user-active"
              type="checkbox"
              role="switch"
              checked={active}
              disabled={busy || self}
              aria-describedby="edit-user-active-help"
              onChange={(e) => setActive(e.target.checked)}
            />
            <span aria-hidden="true" />
            Usuario activo
          </label>
          <p id="edit-user-active-help" className="sti-form-help">
            {self
              ? "No podés desactivar tu propia cuenta."
              : "Si lo desactivás no puede ingresar. Sus tareas y su historial se conservan."}
          </p>
        </div>
        {leavesWork && (
          <p className="sti-callout warning" role="status">
            <TriangleAlert size={16} aria-hidden="true" />
            <span>
              {person.pendingInProgress === 1
                ? "Tiene 1 tarea en proceso que todavía no confirmó."
                : `Tiene ${person.pendingInProgress} tareas en proceso que todavía no confirmó.`}{" "}
              Si la desactivás, un supervisor tiene que asignar a otra persona o
              volver esas tareas a Por hacer.
            </span>
          </p>
        )}

        <section className="sti-edit-block" aria-labelledby="edit-user-password">
          <h3 id="edit-user-password">Contraseña</h3>
          {self ? (
            <p className="sti-form-help">
              Tu propia contraseña la cambiás desde «Mi contraseña», en tu menú.
            </p>
          ) : confirmReset ? (
            <div className="sti-confirm" role="group" aria-label="Confirmar restablecimiento">
              <p>
                ¿Generar una nueva contraseña inicial para {person.name}? La
                actual deja de servir y se cierran sus sesiones abiertas.
              </p>
              <div className="sti-form-actions">
                <button
                  type="button"
                  className="sti-button secondary"
                  disabled={busy}
                  onClick={() => setConfirmReset(false)}
                >
                  No, volver
                </button>
                <button
                  type="button"
                  className="sti-button primary"
                  disabled={busy}
                  onClick={reset}
                >
                  {busy && <LoaderCircle size={16} className="sti-spin" />}
                  Sí, restablecer
                </button>
              </div>
            </div>
          ) : (
            <div className="sti-edit-row">
              <p className="sti-form-help">
                Genera una nueva contraseña inicial. La persona la cambia al
                ingresar.
              </p>
              <button
                type="button"
                className="sti-button secondary sti-button-small"
                disabled={busy}
                onClick={() => setConfirmReset(true)}
              >
                <KeyRound size={14} aria-hidden="true" />
                Restablecer
              </button>
            </div>
          )}
        </section>

        <section className="sti-edit-block sti-edit-row" aria-label="Tareas asignadas">
          <strong>
            {person.assignedTasks === 1
              ? "1 tarea asignada"
              : `${person.assignedTasks} tareas asignadas`}
          </strong>
          {person.role !== "CLIENTE" && (
            <button
              type="button"
              className="sti-text-action"
              disabled={busy}
              onClick={() => onOpenPerson(person.id)}
            >
              Ver sus tareas <ArrowRight size={14} />
            </button>
          )}
        </section>

        {error && (
          <p role="alert" className="sti-inline-message">
            {error}
          </p>
        )}
        <div className="sti-form-actions">
          <button
            type="button"
            className="sti-button secondary"
            disabled={busy}
            onClick={onClose}
          >
            Cancelar
          </button>
          <button type="submit" className="sti-button primary" disabled={!ready || busy}>
            {busy && !confirmReset ? <LoaderCircle size={16} className="sti-spin" /> : null}
            Guardar cambios
          </button>
        </div>
      </form>
    </Panel>
  );
}

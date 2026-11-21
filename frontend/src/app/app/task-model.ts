export type Role = "ADMIN" | "SUPERVISOR" | "USUARIO" | "CLIENTE";
export type Account = {
  id: string;
  name: string;
  email: string;
  role: Role;
  clientId: string | null;
  /** D-23: an initial password is in force; the person can only replace it or leave. */
  mustChangePassword?: boolean;
};
export type Client = { id: string; name: string };
export type Project = { id: string; clientId: string; name: string };
/** {@code active} is false only in the ADMIN's list with inactive people (D-86); they are never offered to assign. */
export type Operator = { id: string; name: string; role: Role; active?: boolean };
/** One person in the user list (ENCARGO-DEV-002). */
export type Person = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: Role;
  clientId: string | null;
  clientName: string | null;
  active: boolean;
  mustChangePassword: boolean;
  /** Every task of the person but the cancelled ones: what the board shows filtered by them (D-84). */
  assignedTasks: number;
  /** Tasks in progress the person has not confirmed, for the warning before deactivating (D-82). */
  pendingInProgress: number;
};
export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Administrador",
  SUPERVISOR: "Supervisor",
  USUARIO: "Técnico",
  CLIENTE: "Cliente",
};
export type PersonState = "all" | "active" | "inactive";

/** The user list filters: by role and by state, combinable. */
export function filterPeople(
  people: readonly Person[],
  role: Role | "",
  state: PersonState,
): Person[] {
  return people.filter(
    (person) =>
      (!role || person.role === role) &&
      (state === "all" || (state === "active") === person.active),
  );
}

/** Rule 3: at least 12 characters, and both fields equal. The server checks it is not the current one. */
export const MIN_PASSWORD = 12;
export function passwordProblem(next: string, repeated: string): string {
  if (next.length < MIN_PASSWORD) return "La contraseña nueva tiene que tener 12 caracteres como mínimo.";
  if (next !== repeated) return "Las dos contraseñas no coinciden.";
  return "";
}

/** Rule 7 (D-24): optional, up to 30 characters of digits, spaces, +, - and parentheses. */
export function phoneProblem(phone: string): string {
  const value = phone.trim();
  return !value || /^[0-9 +()-]{1,30}$/.test(value)
    ? ""
    : "El teléfono admite hasta 30 caracteres: dígitos, espacios, +, - y paréntesis.";
}

/** D-85: the status filter offers each role only the states it can see. Technicians and customers never see invoiced tasks. */
export function visibleStatuses(role: Role): string[] {
  // Corte 3A, rule 7: ADMIN and SUPERVISOR also filter by "No facturable"; the others see no closed task.
  return isOperator(role)
    ? [...STAGES.map((stage) => stage.status as string), "NO_FACTURABLE"]
    : STAGES.map((stage) => stage.status as string).filter((s) => s !== "FACTURADO");
}

/** Corte 3A (R-23): the two ways a finished task closes. */
export const CLOSED_STATUSES = ["FACTURADO", "NO_FACTURABLE"] as const;
export const isClosed = (status: string) =>
  (CLOSED_STATUSES as readonly string[]).includes(status);
// N-49 (boceto 6.2): each reason with the explanation shown under it.
export const CLOSING_REASONS = [
  {
    value: "USO_INTERNO",
    label: "Uso interno",
    hint: "Trabajos propios de STI: retirar mercadería o documentos, trámites.",
  },
  {
    value: "GARANTIA",
    label: "Garantía",
    hint: "El trabajo lo cubre la garantía: no se le cobra al cliente.",
  },
] as const;
export const reasonLabel = (reason: string | null | undefined) =>
  CLOSING_REASONS.find((r) => r.value === reason)?.label ?? null;

/** R-21: the service record, for a finished or closed task; operators always, the customer on what it sees, never the technician. */
export function canDownloadRecord(task: Pick<Task, "status">, role: Role): boolean {
  return role !== "USUARIO" && (task.status === "FINALIZADO" || isClosed(task.status));
}

/** The board column a task goes in: both closed states share "Cerradas". */
export const stageOf = (status: string) =>
  status === "NO_FACTURABLE" ? "FACTURADO" : status;

/** The label of a task's state, with the reason when it closed as not billable. */
export function statusLabel(task: { status: string; closingReason?: string | null }): string {
  if (task.status === "NO_FACTURABLE") {
    const reason = reasonLabel(task.closingReason);
    return reason ? `No facturable · ${reason}` : "No facturable";
  }
  return stageLabel(task.status);
}

/** Board filter by person (D-86): only the ADMIN may filter by an inactive one, whose tasks were kept. */
export function personOptions(operators: readonly Operator[], role: Role): Operator[] {
  return operators.filter((person) => person.active !== false || role === "ADMIN");
}

/** Only active people are offered for assignment (rule 5). */
export function assignable(operators: readonly Operator[]): Operator[] {
  return operators.filter((person) => person.active !== false);
}
export type Assignee = { id: string; name: string; confirmed: boolean };
export type Task = {
  id: string;
  code: string;
  projectId: string;
  clientId: string;
  title: string;
  detail: string | null;
  status: string;
  createdAt: string;
  assignees: Assignee[];
  confirmed: number;
  pending: number;
  photoCount: number;
  signed: boolean;
  closingReason?: string | null;
};
export type Photo = {
  id: string;
  contentType: string;
  byteSize: number;
  uploadedAt: string;
  uploadedBy: string;
};
export type Signature = {
  id: string;
  signerName: string;
  signedOn: string;
  signedAt: string;
  presentedBy: string;
  remote: boolean;
  current: boolean;
};
export type TaskEvent = {
  id: string;
  kind: string;
  fromStatus: string | null;
  toStatus: string | null;
  actorName: string;
  subjectId?: string | null;
  occurredAt: string;
  locationAbsentReason: string | null;
  closingReason?: string | null;
};
export type Detail = Task & {
  events: TaskEvent[];
  photos: Photo[];
  signatures: Signature[];
};

export const STAGES = [
  {
    status: "POR_HACER",
    label: "Por hacer",
    tone: "neutral",
    hint: "Listas para empezar",
  },
  {
    status: "EN_PROCESO",
    label: "En proceso",
    tone: "violet",
    hint: "El equipo está trabajando",
  },
  {
    status: "FINALIZADO",
    label: "Finalizadas",
    tone: "green",
    hint: "Trabajo completado",
  },
  {
    status: "FACTURADO",
    // Corte 3A: the column holds both closed states (FACTURADO and NO_FACTURABLE).
    label: "Cerradas",
    tone: "pink",
    hint: "Facturadas o no facturables",
  },
] as const;
export const MAX_PHOTOS = 5;

/**
 * The calendar day in Paraguay (America/Asuncion) at an instant, as YYYY-MM-DD. The signature proposes this
 * date at any hour, whatever zone or clock settings the device has (N-16): toISOString gave the UTC day, which
 * from 21:00 in Paraguay is already tomorrow.
 */
export function paraguayDate(instant: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Asuncion",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const part = (type: string) => parts.find((p) => p.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
export const isOperator = (role: Role) =>
  role === "ADMIN" || role === "SUPERVISOR";
export const isOpen = (task: Task) =>
  task.status === "POR_HACER" || task.status === "EN_PROCESO";
export const isAssigned = (task: Task, accountId: string) =>
  task.assignees.some((a) => a.id === accountId);

/** Start on a populated stage, while respecting an explicitly selected empty stage. */
export function chooseMobileStage(
  tasks: readonly Pick<Task, "status">[],
  stages: readonly { status: string }[],
  selected: string | null,
): string {
  if (selected && stages.some((stage) => stage.status === selected))
    return selected;
  return (
    stages.find((stage) => tasks.some((task) => stageOf(task.status) === stage.status))
      ?.status ??
    stages[0]?.status ??
    "POR_HACER"
  );
}

/** Mirrors the existing UI's actions; the server remains the authority for every mutation. */
export function canMove(
  task: Task,
  to: string,
  account: Pick<Account, "id" | "role">,
): boolean {
  if (task.status === to) return false;
  if (to === "EN_PROCESO" && task.status === "POR_HACER") {
    // D-26, rule 1: nobody could finish a task started without assignees.
    if (task.assignees.length === 0) return false;
    return (
      isOperator(account.role) ||
      (account.role === "USUARIO" && isAssigned(task, account.id))
    );
  }
  if (to === "POR_HACER" && task.status === "EN_PROCESO")
    return isOperator(account.role);
  if (to === "EN_PROCESO" && task.status === "FINALIZADO")
    return isOperator(account.role);
  // D-207: ADMIN and SUPERVISOR invoice a finished, signed task.
  if (to === "FACTURADO")
    return isOperator(account.role) && task.status === "FINALIZADO" && task.signed;
  // R-23: not billable, from finished, without a signature.
  if (to === "NO_FACTURABLE")
    return isOperator(account.role) && task.status === "FINALIZADO";
  // D-209: "Volver a Finalizadas" from either closed state.
  if (to === "FINALIZADO") return isOperator(account.role) && isClosed(task.status);
  return false;
}

/** D-26, rule 3: a task in progress always keeps someone assigned who can finish it. */
export function canUnassign(
  task: Pick<Task, "status" | "assignees">,
  assigneeId: string,
): boolean {
  if (task.status !== "POR_HACER" && task.status !== "EN_PROCESO") return false;
  if (!task.assignees.some((a) => a.id === assigneeId)) return false;
  return !(task.status === "EN_PROCESO" && task.assignees.length === 1);
}

/** D-26, rule 2: removing the only one still pending finishes the task, because everyone else confirmed. */
export function finishesOnRemoval(
  task: Pick<Task, "status" | "assignees">,
  assigneeId: string,
): boolean {
  const removed = task.assignees.find((a) => a.id === assigneeId);
  const others = task.assignees.filter((a) => a.id !== assigneeId);
  return (
    task.status === "EN_PROCESO" &&
    !!removed &&
    !removed.confirmed &&
    others.length > 0 &&
    others.every((a) => a.confirmed)
  );
}

export function canConfirm(task: Task, accountId: string): boolean {
  return (
    task.status === "EN_PROCESO" &&
    task.assignees.some((a) => a.id === accountId && !a.confirmed)
  );
}

export function canDrop(
  task: Task,
  to: string,
  account: Pick<Account, "id" | "role">,
): boolean {
  // Finalization is a confirmation, never a direct status write; a closed task is not dragged (it goes back by
  // its own button, D-209), and nothing is dragged into not billable, which needs a reason.
  if (isClosed(task.status) || to === "NO_FACTURABLE") return false;
  return (
    canMove(task, to, account) ||
    (to === "FINALIZADO" && task.pending === 1 && canConfirm(task, account.id))
  );
}

export function stageLabel(status: string): string {
  return (
    (
      {
        FACTURADO: "Facturada",
        NO_FACTURABLE: "No facturable",
        ANULADA: "Anulada",
      } as Record<string, string>
    )[status] ??
    STAGES.find((s) => s.status === status)?.label ??
    status
  );
}
export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}
export function eventLabel(event: TaskEvent): string {
  if (event.kind === "ESTADO" && event.toStatus === "FINALIZADO" && event.subjectId)
    return "Finalizó la tarea al quitar a la única persona pendiente";
  if (event.kind === "ESTADO" && event.toStatus === "NO_FACTURABLE")
    return `Cerró como no facturable${reasonLabel(event.closingReason) ? ` · ${reasonLabel(event.closingReason)}` : ""}`;
  if (event.kind === "ESTADO" && event.toStatus === "FINALIZADO" && event.fromStatus && isClosed(event.fromStatus))
    return "Volvió a Finalizadas";
  if (event.kind === "ESTADO" && event.toStatus)
    return `Cambió a ${stageLabel(event.toStatus).toLowerCase()}`;
  return (
    (
      {
        CREADA: "Creó la tarea",
        ASIGNADA: "Asignó una persona",
        DESASIGNADA: "Quitó una asignación",
        CONFIRMACION: "Confirmó su parte",
        FIRMA: "Registró la conformidad",
      } as Record<string, string>
    )[event.kind] ?? "Actualizó la tarea"
  );
}

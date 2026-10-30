export type Role = "ADMIN" | "SUPERVISOR" | "USUARIO" | "CLIENTE";
export type Account = {
  id: string;
  name: string;
  email: string;
  role: Role;
  clientId: string | null;
};
export type Client = { id: string; name: string };
export type Project = { id: string; clientId: string; name: string };
export type Operator = { id: string; name: string; role: Role };
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
  occurredAt: string;
  locationAbsentReason: string | null;
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
    label: "Facturadas",
    tone: "pink",
    hint: "Servicio cerrado",
  },
] as const;
export const MAX_PHOTOS = 5;
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
    stages.find((stage) => tasks.some((task) => task.status === stage.status))
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
    return (
      isOperator(account.role) ||
      (account.role === "USUARIO" && isAssigned(task, account.id))
    );
  }
  if (to === "POR_HACER" && task.status === "EN_PROCESO")
    return isOperator(account.role);
  if (to === "EN_PROCESO" && task.status === "FINALIZADO")
    return isOperator(account.role);
  if (to === "FACTURADO")
    return (
      account.role === "ADMIN" && task.status === "FINALIZADO" && task.signed
    );
  return false;
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
  // Finalization is a confirmation, never a direct status write.
  return (
    canMove(task, to, account) ||
    (to === "FINALIZADO" && task.pending === 1 && canConfirm(task, account.id))
  );
}

export function stageLabel(status: string): string {
  return (
    STAGES.find((s) => s.status === status)?.label ??
    (status === "ANULADA" ? "Anulada" : status)
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

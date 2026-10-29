"use client";

import { useRef, useState, type FormEvent } from "react";
import Image from "next/image";
import {
  DragDropContext,
  Draggable,
  Droppable,
  type DropResult,
} from "@hello-pangea/dnd";
import {
  ArrowRight,
  Check,
  CheckCheck,
  Circle,
  ClipboardList,
  Clock3,
  FileCheck2,
  GripVertical,
  ImagePlus,
  LayoutGrid,
  List,
  LoaderCircle,
  Paperclip,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  UserRound,
  X,
} from "lucide-react";
import {
  deviceLocation,
  errorFor,
  postWithCsrf,
  sendWithCsrf,
  uploadWithCsrf,
} from "./api";
import { SignaturePad } from "./signature-pad";
import {
  canConfirm,
  canDrop,
  canMove,
  eventLabel,
  initials,
  isAssigned,
  isOpen,
  isOperator,
  MAX_PHOTOS,
  stageLabel,
  STAGES,
  type Account,
  type Detail,
  type Task,
} from "./task-model";
import { EmptyState, Panel } from "./workspace-ui";
import type { WorkspaceData } from "./use-workspace-data";

type Props = {
  account: Account;
  data: WorkspaceData;
  projectFilter: string;
  onProjectFilter: (id: string) => void;
};
type PendingAction = {
  task: Task;
  to: string;
  title: string;
  description: string;
};
const dateTime = (value: string) =>
  new Intl.DateTimeFormat("es-PY", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));

export function TaskBoard({
  account,
  data,
  projectFilter,
  onProjectFilter,
}: Props) {
  const { tasks, projects, clients, operators, busy, loading, mutate } = data;
  const operator = isOperator(account.role);
  const stages = operator
    ? STAGES
    : STAGES.filter((s) => s.status !== "FACTURADO");
  const [search, setSearch] = useState("");
  const [clientFilter, setClientFilter] = useState("");
  const [personFilter, setPersonFilter] = useState("");
  const [view, setView] = useState<"board" | "list">("board");
  const [mobileStage, setMobileStage] = useState("POR_HACER");
  const [creating, setCreating] = useState(false);
  const [newProject, setNewProject] = useState("");
  const [newClient, setNewClient] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [opened, setOpened] = useState<Detail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const detailRequest = useRef(0);
  const [signing, setSigning] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(
    null,
  );
  const [dragId, setDragId] = useState("");
  const [pendingMove, setPendingMove] = useState<{
    id: string;
    to: string;
  } | null>(null);
  const [panelMessage, setPanelMessage] = useState("");
  const selected = tasks.find((t) => t.id === selectedId) ?? opened;
  const dragging = tasks.find((t) => t.id === dragId);
  const effectiveClient =
    clientFilter ||
    projects.find((p) => p.id === projectFilter)?.clientId ||
    "";
  const filtered = tasks
    .filter((task) => {
      const project = projects.find((p) => p.id === task.projectId);
      const client = clients.find(
        (c) => c.id === (task.clientId || project?.clientId),
      );
      if (
        effectiveClient &&
        (task.clientId || project?.clientId) !== effectiveClient
      )
        return false;
      if (projectFilter && task.projectId !== projectFilter) return false;
      if (personFilter === "mine" && !isAssigned(task, account.id))
        return false;
      if (personFilter === "unassigned" && task.assignees.length) return false;
      if (
        personFilter &&
        !["mine", "unassigned"].includes(personFilter) &&
        !isAssigned(task, personFilter)
      )
        return false;
      return `${task.code} ${task.title} ${project?.name ?? ""} ${client?.name ?? ""}`
        .toLocaleLowerCase("es")
        .includes(search.trim().toLocaleLowerCase("es"));
    })
    .map((task) =>
      pendingMove?.id === task.id ? { ...task, status: pendingMove.to } : task,
    );
  const hasFilters = !!(
    search ||
    effectiveClient ||
    projectFilter ||
    personFilter
  );

  async function readDetail(taskId: string) {
    const request = ++detailRequest.current;
    setDetailLoading(true);
    setDetailError("");
    try {
      const response = await fetch(`/api/tasks/${taskId}`, {
        credentials: "same-origin",
        cache: "no-store",
      });
      if (!response.ok) throw new Error(errorFor(response));
      const detail = (await response.json()) as Detail;
      if (request === detailRequest.current) setOpened(detail);
    } catch (error) {
      if (request === detailRequest.current)
        setDetailError(
          error instanceof Error
            ? error.message
            : "No se pudo cargar el detalle.",
        );
    } finally {
      if (request === detailRequest.current) setDetailLoading(false);
    }
  }
  function openDetail(taskId: string) {
    setSelectedId(taskId);
    setOpened(null);
    setSigning(false);
    setPanelMessage("");
    void readDetail(taskId);
  }
  function closeDetail() {
    ++detailRequest.current;
    setSelectedId("");
    setOpened(null);
    setSigning(false);
  }

  async function act(
    task: Task,
    write: () => Promise<Response>,
    success: string,
    failure = errorFor,
  ) {
    const ok = await mutate(task.id, write, success, failure);
    if (ok && selectedId === task.id) await readDetail(task.id);
    if (!ok)
      setPanelMessage(
        data.mutationError.current || "No se pudo completar la operación.",
      );
    else setPanelMessage(success);
    return ok;
  }
  async function executeMove(task: Task, to: string) {
    setPendingMove({ id: task.id, to });
    await act(
      task,
      async () =>
        sendWithCsrf("POST", `/api/tasks/${task.id}/status`, {
          to,
          location: await deviceLocation(),
        }),
      `Tarea ${task.code}: ${stageLabel(to).toLowerCase()}.`,
    );
    setPendingMove(null);
  }
  function requestMove(task: Task, to: string) {
    if (to !== "ANULADA" && !canMove(task, to, account)) return;
    if (to === "ANULADA") {
      setPendingAction({
        task,
        to,
        title: "¿Anular esta tarea?",
        description:
          "La tarea saldrá del tablero. Su historial se conserva. Esta acción no tiene una opción de deshacer en esta pantalla.",
      });
    } else if (
      to === "POR_HACER" ||
      (task.status === "FINALIZADO" && to === "EN_PROCESO")
    ) {
      setPendingAction({
        task,
        to,
        title: "¿Volver a abrir el trabajo?",
        description:
          "Se reiniciarán las confirmaciones del equipo. Si había una firma vigente, quedará en el historial y será necesario volver a firmar.",
      });
    } else void executeMove(task, to);
  }
  async function confirm(task: Task) {
    await act(
      task,
      async () =>
        postWithCsrf(`/api/tasks/${task.id}/confirmations`, {
          location: await deviceLocation(),
        }),
      "Tu parte quedó confirmada.",
    );
  }
  function onDragEnd(result: DropResult) {
    setDragId("");
    const to = result.destination?.droppableId;
    const task = tasks.find((t) => t.id === result.draggableId);
    if (!task || !to || !canDrop(task, to, account) || busy) return;
    if (to === "FINALIZADO") void confirm(task);
    else requestMove(task, to);
  }
  function openCreate(projectId = projectFilter) {
    setNewProject(projectId);
    setNewClient(
      projects.find((p) => p.id === projectId)?.clientId || effectiveClient,
    );
    setPanelMessage("");
    setCreating(true);
  }
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim() || !newProject) return;
    const ok = await mutate(
      "new",
      async () =>
        postWithCsrf("/api/tasks", {
          projectId: newProject,
          title: title.trim(),
          detail: description.trim() || null,
          location: await deviceLocation(),
        }),
      "Tarea creada en Por hacer.",
    );
    if (ok) {
      setTitle("");
      setDescription("");
      setCreating(false);
      setMobileStage("POR_HACER");
    } else
      setPanelMessage(
        data.mutationError.current ||
          "No se pudo confirmar el alta. Se conservó lo que escribiste.",
      );
  }
  async function upload(task: Task, file: File) {
    if (file.size > 10 * 1024 * 1024) {
      setPanelMessage("La foto supera los 10 MB.");
      return;
    }
    await act(
      task,
      () => uploadWithCsrf(`/api/tasks/${task.id}/photos`, file),
      "Foto agregada.",
      (response) => {
        if (response.status === 415) return "Usá una imagen JPEG o PNG válida.";
        if (response.status === 413) return "La foto supera los 10 MB.";
        if (response.status === 409) return "La tarea ya tiene cinco fotos.";
        return errorFor(response);
      },
    );
  }

  function actions(task: Task) {
    const mine = isAssigned(task, account.id);
    const allowed = (to: string) => canMove(task, to, account);
    return (
      <div className="sti-action-group">
        {allowed("EN_PROCESO") && (
          <button
            className="sti-button primary"
            disabled={!!busy}
            onClick={() => requestMove(task, "EN_PROCESO")}
          >
            <ArrowRight size={16} />
            {task.status === "FINALIZADO" ? "Reabrir tarea" : "Iniciar tarea"}
          </button>
        )}
        {canConfirm(task, account.id) && (
          <button
            className="sti-button primary"
            disabled={!!busy}
            onClick={() => confirm(task)}
          >
            <CheckCheck size={17} />
            Confirmar mi parte
          </button>
        )}
        {task.status === "EN_PROCESO" &&
          task.assignees.some((a) => a.id === account.id && a.confirmed) && (
            <span className="sti-status green">
              <Check size={14} />
              Tu parte está confirmada
            </span>
          )}
        {task.status === "FINALIZADO" &&
          !task.signed &&
          (operator || mine || account.role === "CLIENTE") && (
            <button
              className="sti-button primary"
              disabled={!!busy}
              onClick={() => setSigning(true)}
            >
              <FileCheck2 size={16} />
              Firmar conformidad
            </button>
          )}
        {allowed("FACTURADO") && (
          <button
            className="sti-button primary"
            disabled={!!busy}
            onClick={() => requestMove(task, "FACTURADO")}
          >
            <Check size={16} />
            Marcar facturada
          </button>
        )}
        {allowed("POR_HACER") && (
          <button
            className="sti-button secondary"
            disabled={!!busy}
            onClick={() => requestMove(task, "POR_HACER")}
          >
            Volver a por hacer
          </button>
        )}
        {account.role === "ADMIN" && isOpen(task) && (
          <button
            className="sti-button danger-quiet"
            disabled={!!busy}
            onClick={() => requestMove(task, "ANULADA")}
          >
            Anular tarea
          </button>
        )}
      </div>
    );
  }

  function card(task: Task, index: number) {
    const project = projects.find((p) => p.id === task.projectId);
    const client = clients.find(
      (c) => c.id === (task.clientId || project?.clientId),
    );
    const movable = stages.some((stage) =>
      canDrop(task, stage.status, account),
    );
    return (
      <Draggable
        key={task.id}
        draggableId={task.id}
        index={index}
        isDragDisabled={!movable || !!busy || view === "list"}
      >
        {(provided, snapshot) => (
          <article
            ref={provided.innerRef}
            {...provided.draggableProps}
            className={`sti-task-card${snapshot.isDragging ? " is-dragging" : ""}${busy === task.id ? " is-saving" : ""}`}
          >
            <div className="sti-task-meta">
              <span className="sti-task-code">{task.code}</span>
              {busy === task.id ? (
                <LoaderCircle
                  size={15}
                  className="sti-spin"
                  aria-label="Guardando"
                />
              ) : (
                movable && (
                  <span
                    className="sti-drag-handle"
                    {...provided.dragHandleProps}
                    aria-label={`Mover ${task.code}`}
                  >
                    <GripVertical size={17} />
                  </span>
                )
              )}
            </div>
            <h3>
              <button
                className="sti-task-open"
                onClick={() => openDetail(task.id)}
              >
                {task.title}
              </button>
            </h3>
            <p className="sti-task-description">
              {task.detail || "Abrí la tarea para ver sus detalles."}
            </p>
            <div
              className="sti-task-project"
              title={`${client?.name ?? ""} · ${project?.name ?? ""}`}
            >
              <span className="sti-project-dot" />
              {project?.name ?? "Proyecto"}
            </div>
            {client && <p className="sti-task-client">{client.name}</p>}
            {task.status === "EN_PROCESO" && task.assignees.length > 0 && (
              <div
                className="sti-progress"
                aria-label={`${task.confirmed} de ${task.assignees.length} partes confirmadas`}
              >
                <span
                  style={{
                    width: `${(task.confirmed / task.assignees.length) * 100}%`,
                  }}
                />
                <small>
                  {task.confirmed}/{task.assignees.length}
                </small>
              </div>
            )}
            {task.status === "FINALIZADO" && (
              <span className={`sti-status ${task.signed ? "green" : "amber"}`}>
                <FileCheck2 size={12} />
                {task.signed ? "Conformidad firmada" : "Pendiente de firma"}
              </span>
            )}
            <div className="sti-task-bottom">
              <div
                className="sti-avatar-stack"
                role="group"
                aria-label={
                  task.assignees.length
                    ? `Responsables: ${task.assignees.map((a) => a.name).join(", ")}`
                    : "Sin responsable"
                }
              >
                {task.assignees.slice(0, 3).map((a) => (
                  <span
                    className={`sti-avatar small${a.confirmed ? " confirmed" : ""}`}
                    title={`${a.name}${a.confirmed ? " · Confirmó su parte" : ""}`}
                    key={a.id}
                  >
                    {initials(a.name)}
                  </span>
                ))}
                {task.assignees.length > 3 && (
                  <span className="sti-avatar small">
                    +{task.assignees.length - 3}
                  </span>
                )}
                {!task.assignees.length && (
                  <span className="sti-unassigned">
                    <UserRound size={13} />
                    Sin asignar
                  </span>
                )}
              </div>
              <span
                className="sti-attachments"
                aria-label={`${task.photoCount} fotos`}
              >
                <Paperclip size={13} />
                {task.photoCount}
              </span>
            </div>
          </article>
        )}
      </Draggable>
    );
  }

  return (
    <>
      <div className="sti-page-heading">
        <div>
          <p className="sti-eyebrow">OPERACIONES</p>
          <h1>
            Tablero de tareas<span className="sti-heading-dot">.</span>
          </h1>
          <p>Todo el trabajo, de principio a fin.</p>
        </div>
        <div className="sti-heading-actions">
          <button
            className="sti-button secondary"
            disabled={loading || !!busy}
            onClick={() => void data.refresh()}
            aria-label="Actualizar tareas"
          >
            <RefreshCw size={16} className={loading ? "sti-spin" : ""} />
            <span>Actualizar</span>
          </button>
          <button
            className="sti-button primary"
            disabled={loading || !!busy}
            onClick={() => openCreate()}
          >
            <Plus size={18} />
            Nueva tarea
          </button>
        </div>
      </div>
      <div className="sti-board-summary">
        <span>
          <span className="sti-status-dot violet" />
          <strong>
            {tasks.filter((t) => t.status === "EN_PROCESO").length}
          </strong>{" "}
          en proceso
        </span>
        <span>
          <FileCheck2 size={14} />
          <strong>
            {tasks.filter((t) => t.status === "FINALIZADO" && !t.signed).length}
          </strong>{" "}
          {tasks.filter((t) => t.status === "FINALIZADO" && !t.signed)
            .length === 1
            ? "pendiente"
            : "pendientes"}{" "}
          de firma
        </span>
        <span className="sti-summary-total">
          {tasks.length} tareas en tu alcance
        </span>
      </div>
      <div className="sti-toolbar">
        <div
          className="sti-view-switch"
          role="group"
          aria-label="Vista de tareas"
        >
          <button
            className={view === "board" ? "is-active" : ""}
            aria-pressed={view === "board"}
            onClick={() => setView("board")}
          >
            <LayoutGrid size={16} />
            Tablero
          </button>
          <button
            className={view === "list" ? "is-active" : ""}
            aria-pressed={view === "list"}
            onClick={() => setView("list")}
          >
            <List size={16} />
            Lista
          </button>
        </div>
        <div className="sti-search">
          <Search size={16} />
          <label htmlFor="task-search" className="sr-only">
            Buscar tareas
          </label>
          <input
            id="task-search"
            placeholder="Buscar por tarea, código o proyecto…"
            value={search}
            disabled={!!dragId}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button aria-label="Limpiar búsqueda" onClick={() => setSearch("")}>
              <X size={14} />
            </button>
          )}
        </div>
      </div>
      <div className="sti-filters">
        <SlidersHorizontal size={15} aria-hidden="true" />
        <label className="sr-only" htmlFor="filter-client">
          Filtrar por cliente
        </label>
        <select
          id="filter-client"
          value={effectiveClient}
          disabled={!!dragId}
          onChange={(e) => {
            setClientFilter(e.target.value);
            onProjectFilter("");
          }}
        >
          <option value="">Todos los clientes</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor="filter-project">
          Filtrar por proyecto
        </label>
        <select
          id="filter-project"
          value={projectFilter}
          disabled={!!dragId}
          onChange={(e) => onProjectFilter(e.target.value)}
        >
          <option value="">Todos los proyectos</option>
          {projects
            .filter((p) => !effectiveClient || p.clientId === effectiveClient)
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
        </select>
        <label className="sr-only" htmlFor="filter-person">
          Filtrar por responsable
        </label>
        <select
          id="filter-person"
          value={personFilter}
          disabled={!!dragId}
          onChange={(e) => setPersonFilter(e.target.value)}
        >
          <option value="">Todos los responsables</option>
          <option value="mine">Asignadas a mí</option>
          <option value="unassigned">Sin asignar</option>
          {operators.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        {hasFilters && (
          <button
            className="sti-clear-filters"
            onClick={() => {
              setSearch("");
              setClientFilter("");
              onProjectFilter("");
              setPersonFilter("");
            }}
          >
            Limpiar filtros <X size={13} />
          </button>
        )}
        <span className="sti-filter-count">{filtered.length} resultados</span>
      </div>
      {loading && !tasks.length ? (
        <div className="sti-loading" role="status">
          <LoaderCircle className="sti-spin" size={24} />
          Cargando tus tareas…
        </div>
      ) : !data.hasLoaded ? (
        <EmptyState
          icon={<ClipboardList size={26} />}
          title="No pudimos cargar tus tareas"
        >
          Usá Actualizar para volver a intentar. El detalle del error aparece
          arriba.
        </EmptyState>
      ) : (
        <DragDropContext
          onDragStart={(start, responder) => {
            setDragId(start.draggableId);
            responder.announce(
              "Tarea seleccionada. Usá las flechas para elegir un estado permitido.",
            );
          }}
          onDragUpdate={(update, responder) => {
            responder.announce(
              update.destination
                ? `Estado: ${stageLabel(update.destination.droppableId)}. Espacio para soltar.`
                : "No se puede soltar en esta posición.",
            );
          }}
          onDragEnd={(result, responder) => {
            responder.announce(
              result.destination
                ? "Movimiento solicitado. El aviso de guardado confirmará el resultado."
                : "Movimiento cancelado.",
            );
            onDragEnd(result);
          }}
          dragHandleUsageInstructions="Presioná espacio para tomar la tarea. Usá las flechas para moverla a un estado permitido; espacio para soltar y Escape para cancelar."
        >
          {view === "board" ? (
            <>
              <div className="sti-mobile-stage">
                <label htmlFor="mobile-stage">Estado</label>
                <select
                  id="mobile-stage"
                  value={mobileStage}
                  onChange={(e) => setMobileStage(e.target.value)}
                >
                  {stages.map((s) => (
                    <option key={s.status} value={s.status}>
                      {s.label} (
                      {filtered.filter((t) => t.status === s.status).length})
                    </option>
                  ))}
                </select>
              </div>
              <div
                className="sti-board"
                style={
                  { "--stage-count": stages.length } as React.CSSProperties
                }
              >
                {stages.map((stage) => {
                  const items = filtered.filter(
                    (t) => t.status === stage.status,
                  );
                  return (
                    <section
                      key={stage.status}
                      className={`sti-column ${stage.status === mobileStage ? "mobile-active" : ""}`}
                      aria-label={stage.label}
                    >
                      <header className="sti-column-head">
                        <div>
                          <span className={`sti-status-dot ${stage.tone}`} />
                          <h2>{stage.label}</h2>
                          <span className="sti-column-count">
                            {items.length}
                          </span>
                        </div>
                        {stage.status === "POR_HACER" && (
                          <button
                            className="sti-icon-button"
                            aria-label="Nueva tarea en Por hacer"
                            disabled={!!busy}
                            onClick={() => openCreate()}
                          >
                            <Plus size={17} />
                          </button>
                        )}
                      </header>
                      <p className="sti-column-hint">{stage.hint}</p>
                      <Droppable
                        droppableId={stage.status}
                        isDropDisabled={
                          !!busy ||
                          (!!dragging &&
                            !canDrop(dragging, stage.status, account) &&
                            dragging.status !== stage.status)
                        }
                      >
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.droppableProps}
                            className={`sti-column-body${snapshot.isDraggingOver ? " is-over" : ""}`}
                          >
                            {items.map(card)}
                            {provided.placeholder}
                            {!items.length && (
                              <div className="sti-column-empty">
                                <Circle size={23} strokeWidth={1} />
                                <strong>
                                  {hasFilters
                                    ? "Sin coincidencias"
                                    : "Nada por aquí todavía"}
                                </strong>
                                <span>
                                  {hasFilters
                                    ? "Probá con otros filtros."
                                    : "Las tareas de este estado aparecerán acá."}
                                </span>
                              </div>
                            )}
                          </div>
                        )}
                      </Droppable>
                      {stage.status === "POR_HACER" && (
                        <button
                          className="sti-add-task"
                          disabled={!!busy}
                          onClick={() => openCreate()}
                        >
                          <Plus size={15} />
                          Agregar tarea
                        </button>
                      )}
                    </section>
                  );
                })}
              </div>
              <p className="sti-board-help">
                <GripVertical size={13} />
                Usá el asa para mover tareas entre estados permitidos. También
                podés abrir una tarea y usar sus acciones.
              </p>
            </>
          ) : (
            <div className="sti-table-wrap">
              <table className="sti-table">
                <thead>
                  <tr>
                    <th>Tarea</th>
                    <th>Proyecto</th>
                    <th>Estado</th>
                    <th>Responsables</th>
                    <th>Fotos</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((task) => (
                    <tr key={task.id}>
                      <td>
                        <button
                          className="sti-table-task"
                          onClick={() => openDetail(task.id)}
                        >
                          <span className="sti-task-code">{task.code}</span>
                          <strong>{task.title}</strong>
                        </button>
                      </td>
                      <td>
                        {projects.find((p) => p.id === task.projectId)?.name ??
                          "Proyecto"}
                      </td>
                      <td>
                        <span
                          className={`sti-status ${STAGES.find((s) => s.status === task.status)?.tone ?? "neutral"}`}
                        >
                          {stageLabel(task.status)}
                        </span>
                      </td>
                      <td>
                        {task.assignees.map((a) => a.name).join(", ") ||
                          "Sin asignar"}
                      </td>
                      <td>{task.photoCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!filtered.length && (
                <EmptyState
                  icon={<ClipboardList size={26} />}
                  title="Sin tareas para mostrar"
                >
                  {hasFilters
                    ? "Cambiá los filtros o limpiá la búsqueda."
                    : "Creá tu primera tarea para empezar."}
                </EmptyState>
              )}
            </div>
          )}
        </DragDropContext>
      )}

      {creating && (
        <Panel
          title="Nueva tarea"
          eyebrow="UN NUEVO PASO"
          onClose={() => setCreating(false)}
          busy={!!busy}
        >
          <p className="sti-panel-intro">
            Contanos qué hay que hacer. La tarea empezará en Por hacer.
          </p>
          <form onSubmit={create} className="sti-form">
            <div className="sti-field">
              <label htmlFor="task-client">Cliente</label>
              <select
                id="task-client"
                value={newClient}
                disabled={!!busy}
                onChange={(e) => {
                  setNewClient(e.target.value);
                  setNewProject("");
                }}
              >
                <option value="">Seleccioná un cliente</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="sti-field">
              <label htmlFor="task-project">
                Proyecto <span>*</span>
              </label>
              <select
                id="task-project"
                value={newProject}
                required
                disabled={!!busy}
                onChange={(e) => {
                  setNewProject(e.target.value);
                  setNewClient(
                    projects.find((p) => p.id === e.target.value)?.clientId ??
                      "",
                  );
                }}
              >
                <option value="">Seleccioná un proyecto</option>
                {projects
                  .filter((p) => !newClient || p.clientId === newClient)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
              {!projects.length && (
                <p>
                  Primero necesitás un proyecto.
                  {account.role === "ADMIN" && (
                    <a href="#projects" onClick={() => setCreating(false)}>
                      {" "}
                      Ir a Proyectos
                    </a>
                  )}
                </p>
              )}
            </div>
            <div className="sti-field">
              <label htmlFor="task-title">
                Título de la tarea <span>*</span>
              </label>
              <input
                data-autofocus
                id="task-title"
                required
                maxLength={200}
                placeholder="Ej.: Revisar iluminación del acceso"
                value={title}
                disabled={!!busy}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div className="sti-field">
              <label htmlFor="task-detail">
                Descripción <small>Opcional</small>
              </label>
              <textarea
                id="task-detail"
                maxLength={4000}
                rows={5}
                placeholder="Agregá el contexto que necesita el equipo…"
                value={description}
                disabled={!!busy}
                onChange={(e) => setDescription(e.target.value)}
              />
              <span className="sti-character-count">
                {description.length}/4000
              </span>
            </div>
            <p className="sti-form-help">
              {account.role === "USUARIO"
                ? "Vas a quedar asignado automáticamente."
                : account.role === "CLIENTE"
                  ? "Un supervisor asignará la tarea al equipo."
                  : "Podés asignar responsables desde el detalle después de crearla."}
            </p>
            {panelMessage && (
              <p className="sti-inline-message" role="alert">
                {panelMessage}
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
                className="sti-button primary"
                type="submit"
                disabled={!!busy || !newProject || !title.trim()}
              >
                {busy === "new" ? (
                  <LoaderCircle size={16} className="sti-spin" />
                ) : (
                  <Plus size={16} />
                )}
                {busy === "new" ? "Creando…" : "Crear tarea"}
              </button>
            </div>
          </form>
        </Panel>
      )}

      {selectedId && selected && (
        <Panel
          title={selected.title}
          eyebrow={selected.code}
          onClose={closeDetail}
          busy={!!busy}
          wide
        >
          <div className="sti-detail-status">
            <span
              className={`sti-status ${STAGES.find((s) => s.status === selected.status)?.tone ?? "neutral"}`}
            >
              {stageLabel(selected.status)}
            </span>
            {selected.signed && (
              <span className="sti-status green">
                <FileCheck2 size={13} />
                Firmada
              </span>
            )}
          </div>
          <p className="sti-detail-project">
            {clients.find((c) => c.id === selected.clientId)?.name}{" "}
            <ArrowRight size={13} />
            {projects.find((p) => p.id === selected.projectId)?.name}
          </p>
          {panelMessage && (
            <p className="sti-inline-message" role="status">
              {panelMessage}
            </p>
          )}
          <section className="sti-detail-section">
            <h3>Descripción</h3>
            <p className="sti-preserve-lines">
              {selected.detail ||
                "Esta tarea todavía no tiene una descripción."}
            </p>
          </section>
          <section className="sti-detail-section">
            <div className="sti-section-title">
              <h3>Responsables</h3>
              <span>
                {selected.confirmed}/{selected.assignees.length} confirmados
              </span>
            </div>
            <div className="sti-assignee-list">
              {selected.assignees.map((a) => (
                <div className="sti-assignee-row" key={a.id}>
                  <span className="sti-avatar small">{initials(a.name)}</span>
                  <span>
                    {a.name}
                    <small>
                      {a.confirmed
                        ? "Parte confirmada"
                        : "Pendiente de confirmar"}
                    </small>
                  </span>
                  {a.confirmed && (
                    <Check size={16} className="sti-success-icon" />
                  )}
                  {operator && isOpen(selected) && (
                    <button
                      className="sti-icon-button"
                      disabled={!!busy}
                      aria-label={`Quitar a ${a.name}`}
                      onClick={() =>
                        void act(
                          selected,
                          () =>
                            sendWithCsrf(
                              "DELETE",
                              `/api/tasks/${selected.id}/assignments/${a.id}`,
                              {},
                            ),
                          "Asignación retirada.",
                        )
                      }
                    >
                      <X size={15} />
                    </button>
                  )}
                </div>
              ))}
              {!selected.assignees.length && (
                <p className="sti-muted">Todavía no hay personas asignadas.</p>
              )}
            </div>
            {operator && isOpen(selected) && (
              <div className="sti-field">
                <label htmlFor="task-assign" className="sr-only">
                  Agregar responsable
                </label>
                <select
                  id="task-assign"
                  value=""
                  disabled={!!busy}
                  onChange={(e) => {
                    const userId = e.target.value;
                    if (userId)
                      void act(
                        selected,
                        () =>
                          postWithCsrf(
                            `/api/tasks/${selected.id}/assignments`,
                            { userId },
                          ),
                        "Responsable asignado.",
                      );
                  }}
                >
                  <option value="">+ Agregar responsable</option>
                  {operators
                    .filter(
                      (p) => !selected.assignees.some((a) => a.id === p.id),
                    )
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                </select>
              </div>
            )}
          </section>
          <section className="sti-detail-section">
            <h3>Acciones de la tarea</h3>
            {actions(selected)}
            {selected.status === "EN_PROCESO" && (
              <p className="sti-form-help">
                La tarea se finaliza cuando todas las personas asignadas
                confirman su parte.
              </p>
            )}
            {selected.status === "FACTURADO" && (
              <p className="sti-muted">El servicio está cerrado y facturado.</p>
            )}
            {signing && (
              <SignaturePad
                busy={!!busy}
                onCancel={() => setSigning(false)}
                onSign={async (signerName, signedOn, image) => {
                  const ok = await act(
                    selected,
                    async () =>
                      postWithCsrf(`/api/tasks/${selected.id}/signature`, {
                        signerName,
                        signedOn,
                        image,
                        location: await deviceLocation(),
                      }),
                    "Conformidad registrada.",
                    (response) =>
                      response.status === 409
                        ? "La tarea ya tiene una firma vigente."
                        : errorFor(response),
                  );
                  if (ok) setSigning(false);
                }}
              />
            )}
          </section>
          <section className="sti-detail-section">
            <div className="sti-section-title">
              <h3>Fotos del trabajo</h3>
              <span>
                {selected.photoCount}/{MAX_PHOTOS}
              </span>
            </div>
            {isOpen(selected) &&
              selected.photoCount < MAX_PHOTOS &&
              (operator ||
                isAssigned(selected, account.id) ||
                account.role === "CLIENTE") && (
                <label className={`sti-upload${busy ? " is-disabled" : ""}`}>
                  <ImagePlus size={24} />
                  <strong>Agregar una foto</strong>
                  <span>JPEG o PNG · Hasta 10 MB · Máximo 5 fotos</span>
                  <input
                    type="file"
                    aria-label="Agregar foto del trabajo"
                    accept="image/jpeg,image/png"
                    disabled={!!busy}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (file) void upload(selected, file);
                    }}
                  />
                </label>
              )}
            {opened?.photos.length ? (
              <div className="sti-photo-grid">
                {opened.photos.map((photo) => (
                  <a
                    key={photo.id}
                    href={`/api/tasks/${selected.id}/photos/${photo.id}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Image
                      unoptimized
                      width={240}
                      height={160}
                      src={`/api/tasks/${selected.id}/photos/${photo.id}`}
                      alt={`Foto del trabajo, subida por ${photo.uploadedBy}`}
                    />
                  </a>
                ))}
              </div>
            ) : (
              !detailLoading && (
                <p className="sti-muted">Todavía no hay fotos adjuntas.</p>
              )
            )}
          </section>
          {!!opened?.signatures.length && (
            <section className="sti-detail-section">
              <h3>Conformidad</h3>
              {opened.signatures.map((signature) => (
                <div className="sti-signature-record" key={signature.id}>
                  <span
                    className={`sti-status ${signature.current ? "green" : "neutral"}`}
                  >
                    {signature.current ? "Firma vigente" : "Firma anterior"}
                  </span>
                  <strong>{signature.signerName}</strong>
                  <p>
                    {signature.signedOn} ·{" "}
                    {signature.remote ? "A distancia" : "Presencial"}
                  </p>
                  <Image
                    unoptimized
                    width={400}
                    height={140}
                    src={`/api/tasks/${selected.id}/signature?signatureId=${signature.id}`}
                    alt={`Firma de ${signature.signerName}`}
                  />
                </div>
              ))}
            </section>
          )}
          <section className="sti-detail-section">
            <h3>
              <Clock3 size={17} />
              Historial de actividad
            </h3>
            {detailLoading && (
              <p className="sti-muted" role="status">
                Cargando historial…
              </p>
            )}
            {detailError && (
              <div role="alert">
                <p>{detailError}</p>
                <button
                  className="sti-button secondary"
                  onClick={() => void readDetail(selected.id)}
                >
                  Reintentar
                </button>
              </div>
            )}
            {opened && (
              <ol className="sti-timeline">
                {[...opened.events]
                  .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
                  .map((event) => (
                    <li key={event.id}>
                      <span className="sti-timeline-dot" />
                      <strong>{eventLabel(event)}</strong>
                      <span>{event.actorName}</span>
                      <time dateTime={event.occurredAt}>
                        {dateTime(event.occurredAt)}
                      </time>
                      {event.locationAbsentReason && (
                        <small>Ubicación no disponible</small>
                      )}
                    </li>
                  ))}
              </ol>
            )}
          </section>
        </Panel>
      )}
      {pendingAction && (
        <Panel
          title={pendingAction.title}
          eyebrow={pendingAction.task.code}
          onClose={() => setPendingAction(null)}
          busy={!!busy}
        >
          <p className="sti-panel-intro">{pendingAction.description}</p>
          <div className="sti-form-actions">
            <button
              className="sti-button secondary"
              disabled={!!busy}
              onClick={() => setPendingAction(null)}
            >
              Cancelar
            </button>
            <button
              className={`sti-button ${pendingAction.to === "ANULADA" ? "danger" : "primary"}`}
              disabled={!!busy}
              onClick={async () => {
                await executeMove(pendingAction.task, pendingAction.to);
                setPendingAction(null);
              }}
            >
              {busy ? "Guardando…" : "Confirmar"}
            </button>
          </div>
        </Panel>
      )}
    </>
  );
}

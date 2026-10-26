import Link from "next/link";
import { Kanban, ArrowRight } from "lucide-react";
import { PROJECTS, TEAM_MEMBERS, INITIAL_COLUMNS, CLIENT_VISIBLE_COLUMN_IDS, PROJECT_TASK_TAGS } from "@/lib/kanban-data";

export default function DashboardPage() {
  const visibleColumns = INITIAL_COLUMNS.filter((column) => CLIENT_VISIBLE_COLUMN_IDS.includes(column.id));
  const total = visibleColumns.reduce((count, column) => count + column.tasks.length, 0);
  const count = (id: string) => visibleColumns.find((column) => column.id === id)?.tasks.length ?? 0;
  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-background">
      {/* Welcome header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-4">
        <div className="flex items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground font-black text-sm tracking-tight shadow-2xs">
            STI
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-foreground">STI-OS — Panel de Control</h1>
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                Cliente: Sallustro
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Vista de ejemplo para clientes. Las órdenes y cifras son ficticias; no hay sesión iniciada.
            </p>
          </div>
        </div>
        <Link
          href="/projects/proj-1/board"
          className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors shadow-2xs w-fit"
        >
          <span>Abrir Tablero Kanban</span>
          <ArrowRight className="size-3.5" />
        </Link>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-4 shadow-2xs">
          <span className="text-2xl font-bold text-foreground">{total}</span>
          <p className="text-xs font-medium text-muted-foreground mt-1">Órdenes de ejemplo</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 shadow-2xs">
          <span className="text-2xl font-bold text-primary">{count("In Progress")}</span>
          <p className="text-xs font-medium text-muted-foreground mt-1">Órdenes En Proceso</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 shadow-2xs">
          <span className="text-2xl font-bold text-warning">{count("In Review")}</span>
          <p className="text-xs font-medium text-muted-foreground mt-1">Pendientes de Firma de Cliente</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 shadow-2xs">
          <span className="text-2xl font-bold text-foreground">{count("Todo")}</span>
          <p className="text-xs font-medium text-muted-foreground mt-1">Órdenes Por Hacer</p>
        </div>
      </div>

      {/* Projects Grid */}
      <div>
        <h2 className="text-sm font-semibold text-foreground mb-3">Locales y Proyectos Activos</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {PROJECTS.map((p) => (
            <Link
              key={p.id}
              href={`/projects/${p.id}/board`}
              className="flex items-center justify-between rounded-xl border border-border bg-card p-4 hover:border-primary/50 hover:bg-muted/40 transition-all shadow-2xs group"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-2xl shrink-0">{p.icon}</span>
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors truncate">
                    {p.name}
                  </h3>
                  <p className="text-xs text-muted-foreground truncate">{visibleColumns.reduce((sum, column) => sum + column.tasks.filter((task) => PROJECT_TASK_TAGS[p.id] !== null && task.tag === PROJECT_TASK_TAGS[p.id]).length, 0)} órdenes de ejemplo</p>
                </div>
              </div>
              <Kanban className="size-4 shrink-0 text-muted-foreground group-hover:text-primary transition-colors ml-2" />
            </Link>
          ))}
        </div>
      </div>

      {/* Team status */}
      <div className="rounded-xl border border-border bg-card p-5 shadow-2xs">
        <h2 className="text-sm font-semibold text-foreground mb-3">Equipo Técnico y Operaciones</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {TEAM_MEMBERS.map((m) => (
            <div key={m.name} className="flex items-center gap-2.5 rounded-lg border border-border p-2.5">
              <div className="size-7 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs shrink-0">
                {m.initials}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-foreground truncate">{m.name}</p>
                <p className="text-[10px] text-muted-foreground truncate">{m.role}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

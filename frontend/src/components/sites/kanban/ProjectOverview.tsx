import Link from "next/link";
import { Kanban, List, ArrowRight } from "lucide-react";
import { CLIENT_VISIBLE_COLUMN_IDS, INITIAL_COLUMNS, PROJECTS, PROJECT_TASK_TAGS } from "@/lib/kanban-data";

export function ProjectOverview({ projectId }: { projectId: string }) {
  const project = PROJECTS.find((item) => item.id === projectId);
  if (!project) return null;

  const tag = PROJECT_TASK_TAGS[projectId];
  const columns = INITIAL_COLUMNS.filter((column) => CLIENT_VISIBLE_COLUMN_IDS.includes(column.id));
  const countFor = (id: string) => columns.find((column) => column.id === id)?.tasks.filter((task) => tag !== null && task.tag === tag).length ?? 0;
  const total = columns.reduce((count, column) => count + countFor(column.id), 0);

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      <div className="flex items-center gap-2">
        <span className="text-2xl">{project.icon}</span>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">{project.name}</h1>
      </div>
      <p className="text-xs text-muted-foreground">{project.description}. Datos ficticios para mostrar la navegación del proyecto.</p>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {[
          ["Órdenes de ejemplo", total],
          ["Borrador", countFor("Backlog")],
          ["Por hacer", countFor("Todo")],
          ["En proceso", countFor("In Progress")],
          ["Para firma", countFor("In Review")],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-border bg-card p-4 shadow-2xs">
            <span className="text-2xl font-bold text-foreground">{value}</span>
            <p className="text-xs font-medium text-muted-foreground mt-1">{label}</p>
          </div>
        ))}
      </div>
      <div className="rounded-xl border border-border bg-card p-5 shadow-2xs">
        <h2 className="text-sm font-semibold text-foreground mb-3">Vistas del proyecto</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Link href={`/projects/${project.id}/board`} className="flex items-center gap-2.5 rounded-lg border border-border p-3 text-sm font-medium hover:bg-muted transition-colors">
            <Kanban className="size-4 text-primary" /> Tablero <ArrowRight className="size-3.5 ml-auto" />
          </Link>
          <Link href={`/projects/${project.id}/list`} className="flex items-center gap-2.5 rounded-lg border border-border p-3 text-sm font-medium hover:bg-muted transition-colors">
            <List className="size-4 text-primary" /> Lista de órdenes <ArrowRight className="size-3.5 ml-auto" />
          </Link>
        </div>
      </div>
      {total === 0 && <p className="text-sm text-muted-foreground">Este proyecto no tiene órdenes de ejemplo.</p>}
    </div>
  );
}

"use client";

import { useKanban } from "@/lib/kanban-context";
import { PROJECT_TASK_TAGS } from "@/lib/kanban-data";
import { KanbanColumn } from "./KanbanColumn";
import { FilterPopover } from "./FilterPopover";

export function KanbanBoard({ projectId }: { projectId: string }) {
  const { filteredColumns } = useKanban();
  const tag = PROJECT_TASK_TAGS[projectId];
  const columns = filteredColumns.map((column) => ({
    ...column,
    tasks: column.tasks.filter((task) => tag !== null && task.tag === tag),
  }));

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-border bg-background px-6 py-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Tablero de Órdenes de Servicio</h1>
          <p className="text-xs text-muted-foreground">Ejemplo: Borrador → Por Hacer → En Proceso → Finalizadas. Solo lectura.</p>
        </div>
        <FilterPopover />
      </div>
      <div className="flex-1 overflow-x-auto p-6 bg-background">
        <div className="flex gap-4 items-start pb-4">
          {columns.map((column) => <KanbanColumn key={column.id} column={column} />)}
        </div>
        {columns.every((column) => column.tasks.length === 0) && (
          <p className="text-sm text-muted-foreground">Este proyecto no tiene órdenes de ejemplo.</p>
        )}
      </div>
    </div>
  );
}

"use client";

import { type Column } from "@/lib/kanban-data";
import { KanbanCard } from "./KanbanCard";

export function KanbanColumn({ column }: { column: Column }) {
  return (
    <div className="group flex w-[320px] min-w-[320px] flex-col rounded-xl bg-muted/30 p-2">
      <div className="sticky top-0 z-10 flex items-center gap-2 px-2 py-2">
        <span className="size-2 shrink-0 rounded-full" aria-hidden="true" style={{ backgroundColor: column.dotColor }} />
        <span className="text-sm font-semibold text-foreground">{column.title}</span>
        <span data-slot="badge" data-variant="secondary" className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-secondary px-1.5 text-xs font-medium text-secondary-foreground">
          {column.tasks.length}
        </span>
      </div>
      <div className="flex-1">
        <div className="relative max-h-[calc(100vh-220px)] overflow-y-auto pr-1">
          <div className="flex flex-col gap-2 p-1 rounded-lg min-h-[50px]">
            {column.tasks.map((task) => <KanbanCard key={task.id} task={task} />)}
          </div>
        </div>
      </div>
    </div>
  );
}

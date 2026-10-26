"use client";

import React, { useState } from "react";
import {
  ChevronsUp,
  ChevronUp,
  Minus,
  ChevronDown,
  Calendar,
  Search,
} from "lucide-react";
import { useKanban } from "@/lib/kanban-context";
import { PROJECT_TASK_TAGS, type Priority, type Task } from "@/lib/kanban-data";

export function ProjectListView({ projectId }: { projectId: string }) {
  const { columns } = useKanban();
  const [searchTerm, setSearchTerm] = useState("");

  // Flatten all tasks with their column/status
  const allTasks: { task: Task; status: string }[] = [];
  columns.forEach((col) => {
    col.tasks.forEach((t) => {
      if (PROJECT_TASK_TAGS[projectId] !== null && t.tag === PROJECT_TASK_TAGS[projectId]) {
        allTasks.push({ task: t, status: col.title });
      }
    });
  });

  const filtered = allTasks.filter(({ task }) => {
    if (!searchTerm.trim()) return true;
    const q = searchTerm.toLowerCase();
    return task.title.toLowerCase().includes(q) || task.key.toLowerCase().includes(q);
  });

  const renderPriorityIcon = (p: Priority) => {
    switch (p) {
      case "urgent":
        return <ChevronsUp className="size-3.5 text-destructive" />;
      case "high":
        return <ChevronUp className="size-3.5 text-warning" />;
      case "medium":
        return <Minus className="size-3.5 text-primary" />;
      case "low":
      default:
        return <ChevronDown className="size-3.5 text-muted-foreground" />;
    }
  };

  const getPriorityLabel = (p: Priority) => {
    switch (p) {
      case "urgent":
        return "Urgente";
      case "high":
        return "Alta";
      case "medium":
        return "Media";
      case "low":
        return "Baja";
    }
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-background">
      {/* Header bar */}
      <div className="flex items-center justify-between border-b border-border px-6 py-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Lista de Órdenes de Servicio</h1>
          <p className="text-xs text-muted-foreground">Registro de tareas técnicas, instalaciones y mantenimiento</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Buscar órdenes (ej. TAR-1473)..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-8 rounded-lg border border-input bg-background pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-ring focus:ring-1 focus:ring-ring w-48 sm:w-64"
            />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto p-6">
        <div className="rounded-xl border border-border bg-card shadow-2xs overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-border bg-muted/40 font-medium text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Nº Orden</th>
                <th className="px-4 py-3">Detalle del Servicio</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3">Prioridad</th>
                <th className="px-4 py-3">Tipo</th>
                <th className="px-4 py-3">Local / Sector</th>
                <th className="px-4 py-3">Técnico Asignado</th>
                <th className="px-4 py-3 text-right">Plazo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map(({ task, status }) => (
                <tr key={task.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-mono font-medium text-foreground">
                    {task.key}
                  </td>
                  <td className="px-4 py-3 font-medium text-foreground max-w-xs truncate">
                    {task.title}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-secondary-foreground">
                      {status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      {renderPriorityIcon(task.priority)}
                      <span>{getPriorityLabel(task.priority)}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[10px] font-medium">
                      <span
                        className="size-1.5 rounded-full"
                        style={{ backgroundColor: task.typeColor || "#0053a5" }}
                      />
                      {task.type}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {task.tag || "General"}
                  </td>
                  <td className="px-4 py-3">
                    {task.assignees.length > 0 ? (
                      <span className="text-foreground font-medium">
                        {task.assignees.map((a) => a.name).join(", ")}
                      </span>
                    ) : (
                      <span className="italic text-muted-foreground">Sin asignar</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {task.isOverdue ? (
                      <span className="inline-flex items-center gap-1 font-medium text-destructive">
                        <Calendar className="size-3" />
                        Vencido
                      </span>
                    ) : (
                      <span className="text-muted-foreground">A tiempo</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

"use client";

import React from "react";
import Image from "next/image";
import {
  ChevronsUp,
  ChevronUp,
  Minus,
  ChevronDown,
  Calendar,
  CheckSquare,
} from "lucide-react";
import { type Task } from "@/lib/kanban-data";

interface KanbanCardProps {
  task: Task;
}

export function KanbanCard({ task }: KanbanCardProps) {
  const renderPriorityIcon = () => {
    switch (task.priority) {
      case "urgent":
        return <ChevronsUp className="size-3.5 shrink-0 text-destructive" />;
      case "high":
        return <ChevronUp className="size-3.5 shrink-0 text-chart-2" />;
      case "medium":
        return <Minus className="size-3.5 shrink-0 text-warning" />;
      case "low":
      default:
        return <ChevronDown className="size-3.5 shrink-0 text-info" />;
    }
  };

  return (
    <div className="group/card relative overflow-hidden rounded-lg border border-border bg-card shadow-xs transition-all hover:shadow-md">
      {/* Priority accent color stripe on left */}
      <div
        className="absolute inset-y-0 left-0 w-1 rounded-l-lg"
        aria-hidden="true"
        style={{ backgroundColor: task.leftBarColor }}
      />

      <div className="p-3 pl-4">
        {/* Top metadata: Priority & Badges */}
        <div className="mb-2 flex items-center gap-1.5">
          {renderPriorityIcon()}
          <div className="flex flex-1 items-center gap-1 overflow-hidden">
            {/* Type badge */}
            <span
              data-slot="badge"
              data-variant="outline"
              className="inline-flex h-[18px] max-w-[100px] shrink-0 items-center justify-center gap-1 truncate rounded-full border border-border px-1.5 text-[10px] font-medium text-foreground whitespace-nowrap"
            >
              <span
                className="mr-1 inline-block size-1.5 shrink-0 rounded-full"
                aria-hidden="true"
                style={{ backgroundColor: task.typeColor || "#3b82f6" }}
              />
              {task.type}
            </span>

            {/* Tag badge */}
            {task.tag && (
              <span
                data-slot="badge"
                data-variant="outline"
                className="inline-flex h-[18px] max-w-[100px] shrink-0 items-center justify-center gap-1 truncate rounded-full border border-border px-1.5 text-[10px] font-medium text-foreground whitespace-nowrap"
              >
                <span
                  className="mr-1 inline-block size-1.5 shrink-0 rounded-full"
                  aria-hidden="true"
                  style={{ backgroundColor: task.tagColor || "#f97316" }}
                />
                {task.tag}
              </span>
            )}

            {/* +1 badge */}
            {task.hasExtraAssignee && (
              <span
                data-slot="badge"
                data-variant="outline"
                className="inline-flex h-[18px] shrink-0 items-center justify-center rounded-full border border-border px-1 text-[10px] font-medium text-muted-foreground"
              >
                +1
              </span>
            )}
          </div>
        </div>

        {/* Task Title */}
        <p className="mb-2 text-sm font-medium leading-snug text-foreground line-clamp-2">
          {task.title}
        </p>

        {/* Bottom row: Key, Subtasks, Overdue & Avatars */}
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-muted-foreground">{task.key}</span>

          {task.subtasks && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <CheckSquare className="size-3" />
              <span>
                {task.subtasks.completed}/{task.subtasks.total}
              </span>
            </span>
          )}

          {task.isOverdue && (
            <span className="inline-flex items-center gap-1 rounded-sm text-[11px] font-medium text-destructive">
              <Calendar className="size-3" />
              <span>Vencida</span>
            </span>
          )}

          <div className="flex-1" />

          {/* Assignees */}
          {task.assignees.length > 0 && (
            <div className="flex -space-x-1.5 overflow-hidden">
              {task.assignees.map((assignee, idx) => (
                <div
                  key={idx}
                  className="relative size-5 overflow-hidden rounded-full border border-background bg-muted"
                  title={assignee.name}
                >
                  {assignee.avatarUrl ? (
                    <Image
                      src={assignee.avatarUrl}
                      alt={assignee.name}
                      width={20}
                      height={20}
                      className="size-full object-cover"
                      unoptimized
                    />
                  ) : (
                    <div className="flex size-full items-center justify-center bg-secondary text-[9px] font-semibold text-secondary-foreground">
                      {assignee.name.slice(0, 1)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

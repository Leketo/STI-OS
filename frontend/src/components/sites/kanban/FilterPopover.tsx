"use client";

import React, { useState } from "react";
import { Funnel, Check } from "lucide-react";
import { useKanban } from "@/lib/kanban-context";
import { type Priority } from "@/lib/kanban-data";
import { cn } from "@/lib/utils";

export function FilterPopover() {
  const [open, setOpen] = useState(false);
  const { filters, setFilters } = useKanban();

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const priorityOptions: { label: string; value: Priority }[] = [
    { label: "Urgente", value: "urgent" },
    { label: "Alta", value: "high" },
    { label: "Media", value: "medium" },
    { label: "Baja", value: "low" },
  ];

  const assigneeOptions = [
    "Coordinación Demo",
    "Diego Ramos",
    "Lucía Benítez",
    "Mario Riquelme",
    "Carlos Mendoza",
  ];

  const togglePriority = (p: Priority) => {
    setFilters((prev) => {
      const exists = prev.priorities.includes(p);
      return {
        ...prev,
        priorities: exists
          ? prev.priorities.filter((item) => item !== p)
          : [...prev.priorities, p],
      };
    });
  };

  const toggleAssignee = (a: string) => {
    setFilters((prev) => {
      const exists = prev.assignees.includes(a);
      return {
        ...prev,
        assignees: exists
          ? prev.assignees.filter((item) => item !== a)
          : [...prev.assignees, a],
      };
    });
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          "inline-flex h-7 items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 text-xs font-medium text-foreground hover:bg-muted transition-colors shadow-2xs",
          open && "bg-muted"
        )}
      >
        <Funnel className="size-3.5 text-muted-foreground" />
        <span>Filter</span>
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
          />
          <div
            data-slot="popover-content"
            className="absolute right-0 top-full z-50 mt-1.5 w-52 rounded-lg border border-border bg-popover p-3 text-sm text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95"
          >
            {/* Priority Section */}
            <p className="mb-2 text-xs font-medium text-muted-foreground">Priority</p>
            <div className="space-y-1.5 mb-3">
              {priorityOptions.map((opt) => {
                const checked = filters.priorities.includes(opt.value);
                return (
                  <label
                    key={opt.value}
                    onClick={() => togglePriority(opt.value)}
                    className="flex items-center gap-2 text-sm cursor-pointer select-none"
                  >
                    <span
                      data-slot="checkbox"
                      data-checked={checked ? "" : undefined}
                      className={cn(
                        "flex size-4 items-center justify-center rounded border transition-colors",
                        checked
                          ? "bg-primary border-primary text-primary-foreground"
                          : "border-input bg-background"
                      )}
                    >
                      {checked && <Check className="size-3 stroke-[3]" />}
                    </span>
                    <span>{opt.label}</span>
                  </label>
                );
              })}
            </div>

            {/* Assignee Section */}
            <p className="mb-2 text-xs font-medium text-muted-foreground">Assignee</p>
            <div className="space-y-1.5">
              {assigneeOptions.map((opt) => {
                const checked = filters.assignees.includes(opt);
                return (
                  <label
                    key={opt}
                    onClick={() => toggleAssignee(opt)}
                    className="flex items-center gap-2 text-sm cursor-pointer select-none"
                  >
                    <span
                      data-slot="checkbox"
                      data-checked={checked ? "" : undefined}
                      className={cn(
                        "flex size-4 items-center justify-center rounded border transition-colors",
                        checked
                          ? "bg-primary border-primary text-primary-foreground"
                          : "border-input bg-background"
                      )}
                    >
                      {checked && <Check className="size-3 stroke-[3]" />}
                    </span>
                    <span>{opt}</span>
                  </label>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

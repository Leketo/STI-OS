"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowLeft,
  LayoutDashboard,
  Kanban,
  List,
} from "lucide-react";
import { PROJECTS } from "@/lib/kanban-data";
import { cn } from "@/lib/utils";

interface ProjectNavProps {
  projectId?: string;
}

export function ProjectNav({ projectId }: ProjectNavProps) {
  const pathname = usePathname();
  const project = PROJECTS.find((p) => p.id === projectId);
  if (!project) return null;

  const tabs = [
    { label: "Vista General", href: `/projects/${project.id}`, icon: LayoutDashboard, exact: true },
    { label: "Tablero", href: `/projects/${project.id}/board`, icon: Kanban },
    { label: "Lista de Órdenes", href: `/projects/${project.id}/list`, icon: List },
  ];

  return (
    <div className="flex flex-col border-b border-border bg-background px-6 pt-4 pb-0">
      {/* Top project banner */}
      <div className="flex items-center gap-3 mb-4">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="size-3.5" />
          <span>Proyectos</span>
        </Link>
        <div className="h-4 w-px bg-border" />
        <div className="flex items-center gap-2">
          <span className="text-xl leading-none">{project.icon}</span>
          <span className="text-lg font-semibold tracking-tight text-foreground">{project.name}</span>
          {project.client && (
            <span className="ml-2 inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
              Cliente: {project.client}
            </span>
          )}
        </div>
      </div>

      {/* Tabs navigation */}
      <div className="flex items-center gap-1 overflow-x-auto no-scrollbar -mb-px">
        {tabs.map((tab) => {
          const isActive = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);
          const Icon = tab.icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "inline-flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors",
                isActive
                  ? "border-primary text-foreground font-semibold"
                  : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
              )}
            >
              <Icon className="size-4 shrink-0" />
              <span>{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChevronsUpDown,
  House,
  ListChecks,
  Inbox,
  Eye,
  Map,
  ChartColumn,
  LayoutTemplate,
  Activity,
  Settings,
  UsersRound,
  X,
  Check,
} from "lucide-react";
import { useKanban } from "@/lib/kanban-context";
import { PROJECTS } from "@/lib/kanban-data";
import { cn } from "@/lib/utils";

export function Sidebar() {
  const pathname = usePathname();
  const { sidebarCollapsed, mobileSidebarOpen, setMobileSidebarOpen } = useKanban();

  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);

  const mainLinks = [
    { label: "Dashboard", href: "/", icon: House },
    { label: "Tablero", href: "/projects/proj-1/board", icon: ListChecks },
    { label: "Órdenes de Servicio", href: "/projects/proj-1/list", icon: Eye },
    { label: "Solicitudes", href: "/inbox", icon: Inbox, badge: "3" },
  ];

  const planningLinks = [
    { label: "Hoja de Ruta", href: "/roadmap", icon: Map },
    { label: "Reportes & Auditoría", href: "/analytics", icon: ChartColumn },
  ];

  const secondaryLinks = [
    { label: "Actividad en Vivo", href: "/activity", icon: Activity },
    { label: "Plantillas de Servicio", href: "/templates", icon: LayoutTemplate },
  ];

  const bottomLinks = [
    { label: "Ajustes", href: "/settings", icon: Settings },
    { label: "Equipo Técnico", href: "/team", icon: UsersRound },
  ];

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  const sidebarContent = (
    <div className="flex h-full flex-col justify-between bg-sidebar text-sidebar-foreground border-r border-sidebar-border select-none">
      <div className="flex flex-col flex-1 overflow-y-auto px-2 py-2">
        {/* Workspace Dropdown: STI-OS */}
        <div className="relative mb-2">
          <button
            type="button"
            onClick={() => setWorkspaceMenuOpen(!workspaceMenuOpen)}
            className="flex w-full items-center gap-2 rounded-lg p-1.5 text-left text-sm hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
          >
            <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground font-black text-[11px] tracking-tight shadow-2xs">
              STI
            </div>
            {!sidebarCollapsed && (
              <>
                <div className="flex flex-col flex-1 min-w-0">
                  <span className="truncate text-sm font-semibold leading-none text-foreground">
                    STI-OS
                  </span>
                  <span className="truncate text-[11px] text-muted-foreground mt-0.5">
                    Cliente: Sallustro
                  </span>
                </div>
                <ChevronsUpDown className="size-4 text-muted-foreground ml-auto" />
              </>
            )}
          </button>

          {workspaceMenuOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setWorkspaceMenuOpen(false)}
              />
              <div className="absolute left-0 top-full z-50 mt-1 w-56 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg animate-in fade-in-0 zoom-in-95">
                <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                  Clientes & Empresas
                </div>
                <button
                  type="button"
                  onClick={() => setWorkspaceMenuOpen(false)}
                  className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-muted font-medium text-foreground"
                >
                  <div className="flex flex-col text-left">
                    <span>Sallustro</span>
                    <span className="text-[10px] text-muted-foreground font-normal">
                      Casa Central, Hering, Aldo
                    </span>
                  </div>
                  <Check className="size-4 text-primary" />
                </button>
                <button
                  type="button"
                  onClick={() => setWorkspaceMenuOpen(false)}
                  className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-muted text-muted-foreground"
                >
                  <div className="flex flex-col text-left">
                    <span>Fit For Life</span>
                    <span className="text-[10px] text-muted-foreground">Local Villa Morra</span>
                  </div>
                </button>
                <div className="my-1 h-px bg-border" />
              </div>
            </>
          )}
        </div>

        {/* Main Items */}
        <nav className="flex flex-col gap-0.5">
          {mainLinks.map((item) => {
            const active = isActive(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileSidebarOpen(false)}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground font-semibold"
                    : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                )}
              >
                <Icon className="size-4 shrink-0" />
                {!sidebarCollapsed && (
                  <>
                    <span className="flex-1 truncate">{item.label}</span>
                    {item.badge && (
                      <span className="flex size-5 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-semibold">
                        {item.badge}
                      </span>
                    )}
                  </>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="my-2 h-px bg-sidebar-border" />

        {/* Planning Section */}
        <div className="flex flex-col gap-0.5">
          {!sidebarCollapsed && (
            <span className="px-2.5 py-1 text-xs font-medium text-muted-foreground">
              Operaciones
            </span>
          )}
          {planningLinks.map((item) => {
            const active = isActive(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileSidebarOpen(false)}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground font-semibold"
                    : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                )}
              >
                <Icon className="size-4 shrink-0" />
                {!sidebarCollapsed && <span className="flex-1 truncate">{item.label}</span>}
              </Link>
            );
          })}
        </div>

        <div className="my-2 h-px bg-sidebar-border" />

        {/* Projects Section */}
        <div className="flex flex-col gap-0.5">
          {!sidebarCollapsed && (
            <span className="px-2.5 py-1 text-xs font-medium text-muted-foreground">
              Locales & Proyectos
            </span>
          )}
          {PROJECTS.map((proj) => {
            const active = pathname.startsWith(`/projects/${proj.id}`);
            return (
              <Link
                key={proj.id}
                href={`/projects/${proj.id}/board`}
                onClick={() => setMobileSidebarOpen(false)}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground font-semibold"
                    : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                )}
              >
                <span className="text-base leading-none shrink-0">{proj.icon}</span>
                {!sidebarCollapsed && <span className="flex-1 truncate">{proj.name}</span>}
              </Link>
            );
          })}
        </div>

        <div className="my-2 h-px bg-sidebar-border" />

        {/* Secondary Links */}
        <div className="flex flex-col gap-0.5">
          {secondaryLinks.map((item) => {
            const active = isActive(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileSidebarOpen(false)}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground font-semibold"
                    : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                )}
              >
                <Icon className="size-4 shrink-0" />
                {!sidebarCollapsed && <span className="flex-1 truncate">{item.label}</span>}
              </Link>
            );
          })}
        </div>

        <div className="my-2 h-px bg-sidebar-border" />

        {/* Bottom Links */}
        <div className="flex flex-col gap-0.5">
          {bottomLinks.map((item) => {
            const active = isActive(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileSidebarOpen(false)}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground font-semibold"
                    : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                )}
              >
                <Icon className="size-4 shrink-0" />
                {!sidebarCollapsed && <span className="flex-1 truncate">{item.label}</span>}
              </Link>
            );
          })}
        </div>
      </div>

      {/* The preview does not authenticate a user. */}
      <div className="relative border-t border-sidebar-border p-2">
        <div className="flex w-full items-center gap-2.5 rounded-lg p-1.5 text-left text-sm">
          <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground font-bold text-xs border border-sidebar-border">
            D
          </div>
          {!sidebarCollapsed && (
            <>
              <div className="flex flex-col flex-1 min-w-0">
                <span className="truncate text-sm font-medium leading-none">Vista de demostración</span>
                <span className="truncate text-xs text-muted-foreground mt-0.5">
                  Sin sesión iniciada
                </span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <aside
        className={cn(
          "hidden md:flex flex-col shrink-0 transition-all duration-300 ease-in-out h-screen sticky top-0 z-30",
          sidebarCollapsed ? "w-14" : "w-60"
        )}
      >
        {sidebarContent}
      </aside>

      {/* Mobile Drawer (Sheet) */}
      {mobileSidebarOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="fixed inset-0 bg-background/80 backdrop-blur-xs transition-opacity animate-in fade-in"
            onClick={() => setMobileSidebarOpen(false)}
          />
          <div className="fixed inset-y-0 left-0 z-50 w-72 bg-sidebar shadow-2xl transition-transform animate-in slide-in-from-left duration-200">
            <div className="absolute right-2 top-2 z-50">
              <button
                type="button"
                onClick={() => setMobileSidebarOpen(false)}
                className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg"
              >
                <X className="size-5" />
              </button>
            </div>
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
}

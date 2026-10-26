"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  PanelLeft,
  ChevronRight,
  Search,
  Sun,
  Moon,
} from "lucide-react";
import { useKanban } from "@/lib/kanban-context";
import { PROJECTS } from "@/lib/kanban-data";

export function Header() {
  const pathname = usePathname();
  const { toggleSidebar, theme, toggleTheme, setCommandPaletteOpen } = useKanban();

  // Find project and sub-page from pathname
  const routeProjectId = pathname.split("/")[1] === "projects" ? pathname.split("/")[2] : null;
  const currentProject = PROJECTS.find((p) => p.id === routeProjectId);

  const getSubpageName = () => {
    if (pathname.includes("/board")) return "Tablero";
    if (pathname.includes("/list")) return "Lista de Órdenes";
    if (pathname.includes("/timeline")) return "Hoja de Ruta";
    if (pathname.includes("/calendar")) return "Calendario";
    if (pathname.includes("/backlog")) return "Solicitudes";
    if (pathname.includes("/cycles")) return "Semanas Operativas";
    if (pathname.includes("/modules")) return "Servicios";
    if (pathname.includes("/pages")) return "Documentación";
    if (pathname.includes("/analytics")) return "Reportes";
    if (pathname.includes("/automations")) return "Automatizaciones";
    if (pathname.includes("/settings")) return "Configuración";
    return null;
  };

  const subpage = getSubpageName();

  return (
    <header className="sticky top-0 z-20 flex h-14 w-full shrink-0 items-center justify-between border-b border-border bg-background px-4">
      {/* Left: Sidebar Toggle + Breadcrumb */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={toggleSidebar}
          aria-label="Toggle Sidebar"
          className="inline-flex size-8 items-center justify-center rounded-lg border border-transparent text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <PanelLeft className="size-4" />
          <span className="sr-only">Toggle Sidebar</span>
        </button>

        <div className="h-4 w-px bg-border mx-1" />

        <nav aria-label="breadcrumb" className="flex items-center text-sm">
          <ol className="flex items-center gap-1.5 text-muted-foreground">
            <li>
              <Link href="/" className="hover:text-foreground transition-colors font-semibold text-foreground">
                STI-OS
              </Link>
            </li>
            {currentProject && <><li aria-hidden="true"><ChevronRight className="size-3.5 text-muted-foreground/60" /></li>
              <li><Link href={`/projects/${currentProject.id}`} className="hover:text-foreground transition-colors font-medium text-foreground">{currentProject.name}</Link></li></>}
            {currentProject && subpage && (
              <>
                <li aria-hidden="true">
                  <ChevronRight className="size-3.5 text-muted-foreground/60" />
                </li>
                <li className="font-medium text-foreground">
                  <span>{subpage}</span>
                </li>
              </>
            )}
          </ol>
        </nav>
      </div>

      {/* Right: Search, Notifications, Theme Toggle */}
      <div className="flex items-center gap-2">
        {/* Command Palette Trigger */}
        <button
          type="button"
          onClick={() => setCommandPaletteOpen(true)}
          className="flex h-8 items-center gap-2 rounded-lg border border-input bg-muted/30 px-2.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors shadow-2xs"
        >
          <Search className="size-3.5" />
          <span className="hidden sm:inline">Buscar órdenes (TAR-14xx)...</span>
          <kbd className="pointer-events-none hidden h-4 select-none items-center gap-0.5 rounded border border-border bg-background px-1.5 font-mono text-[10px] font-medium text-muted-foreground sm:flex">
            ⌘K
          </kbd>
        </button>

        {/* Theme Toggle */}
        <button
          type="button"
          onClick={toggleTheme}
          aria-label="Cambiar tema"
          className="inline-flex size-8 items-center justify-center rounded-lg border border-input bg-background text-muted-foreground hover:bg-muted hover:text-foreground transition-colors shadow-2xs"
        >
          {theme === "dark" ? <Sun className="size-4 text-warning" /> : <Moon className="size-4 text-foreground" />}
        </button>
      </div>
    </header>
  );
}

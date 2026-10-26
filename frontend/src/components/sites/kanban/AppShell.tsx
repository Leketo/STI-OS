"use client";

import React from "react";
import { usePathname } from "next/navigation";
import { KanbanProvider } from "@/lib/kanban-context";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { ProjectNav } from "./ProjectNav";
import { CommandPalette } from "./CommandPalette";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const projectId = pathname.split("/")[2];
  const isProjectRoute = pathname.startsWith("/projects/") && projectId !== "new";

  return (
    <KanbanProvider>
      <div className="flex min-h-screen w-full bg-background text-foreground antialiased font-sans">
        <Sidebar />
        <div className="flex flex-1 flex-col min-w-0 h-screen overflow-hidden">
          <Header />
          {isProjectRoute && <ProjectNav projectId={projectId} />}
          <div className="border-b border-primary/20 bg-primary/5 px-6 py-1.5 text-center text-xs font-medium text-primary">
            DEMO / DATOS FICTICIOS · Solo lectura · Sin órdenes reales ni guardado
          </div>
          <main id="main-content" className="flex flex-1 flex-col min-h-0 overflow-hidden">
            {children}
          </main>
        </div>
        <CommandPalette />
      </div>
    </KanbanProvider>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  Building2,
  ChevronRight,
  FolderKanban,
  LayoutGrid,
  Menu,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import { TaskBoard } from "./task-board";
import { AdminOnboarding } from "./admin-onboarding";
import { LogoutButton } from "./logout-button";
import { ThemeControl, WorkspaceMark } from "./workspace-ui";
import { initials, type Account } from "./task-model";
import { useWorkspaceData } from "./use-workspace-data";

type View = "tasks" | "clients" | "projects" | "users";
const labels = {
  tasks: "Tareas",
  clients: "Clientes",
  projects: "Proyectos",
  users: "Usuarios",
};
const icons = {
  tasks: LayoutGrid,
  clients: Building2,
  projects: FolderKanban,
  users: Users,
};
const roleLabels = {
  ADMIN: "Administrador",
  SUPERVISOR: "Supervisor",
  USUARIO: "Técnico",
  CLIENTE: "Cliente",
};

export function Workspace({ account }: { account: Account }) {
  const data = useWorkspaceData(account);
  const [view, setView] = useState<View>("tasks");
  const [mobileNav, setMobileNav] = useState(false);
  const sidebar = useRef<HTMLElement>(null);
  const [projectFilter, setProjectFilter] = useState("");
  const [newProjectClient, setNewProjectClient] = useState("");
  const views: View[] =
    account.role === "ADMIN"
      ? ["tasks", "clients", "projects", "users"]
      : ["tasks", "clients", "projects"];

  useEffect(() => {
    if (!mobileNav) return;
    const previous = document.activeElement as HTMLElement | null;
    const element = sidebar.current;
    if (!element) return;
    const focusable = () =>
      [
        ...element.querySelectorAll<HTMLElement>(
          "a[href], button:not(:disabled), select:not(:disabled)",
        ),
      ].filter((item) => item.offsetParent !== null);
    focusable()[0]?.focus();
    function keydown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setMobileNav(false);
      }
      if (event.key !== "Tab") return;
      const items = focusable();
      const first = items[0],
        last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      }
      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
    const media = window.matchMedia("(min-width: 761px)");
    const resize = () => {
      if (media.matches) setMobileNav(false);
    };
    document.addEventListener("keydown", keydown);
    media.addEventListener("change", resize);
    return () => {
      document.removeEventListener("keydown", keydown);
      media.removeEventListener("change", resize);
      previous?.focus();
    };
  }, [mobileNav]);

  useEffect(() => {
    function sync() {
      const value = window.location.hash.slice(1) as View;
      if (
        ["tasks", "clients", "projects"].includes(value) ||
        (value === "users" && account.role === "ADMIN")
      )
        setView(value);
      else if (!value || value === "users") setView("tasks");
    }
    sync();
    window.addEventListener("hashchange", sync);
    window.addEventListener("popstate", sync);
    return () => {
      window.removeEventListener("hashchange", sync);
      window.removeEventListener("popstate", sync);
    };
  }, [account.role]);

  function navigate(next: View) {
    setView(next);
    setMobileNav(false);
    setNewProjectClient("");
    if (data.notice?.kind === "success") data.dismissNotice();
    window.history.pushState(null, "", `#${next}`);
  }
  function openProject(id: string) {
    setProjectFilter(id);
    navigate("tasks");
  }

  return (
    <div className="sti-workspace">
      <a className="sti-skip" href="#workspace-content">
        Ir al contenido
      </a>
      {mobileNav && (
        <button
          className="sti-nav-scrim"
          aria-label="Cerrar navegación"
          onClick={() => setMobileNav(false)}
        />
      )}
      <aside
        ref={sidebar}
        className={`sti-sidebar${mobileNav ? " is-open" : ""}`}
        aria-label="Navegación principal"
        role={mobileNav ? "dialog" : undefined}
        aria-modal={mobileNav || undefined}
      >
        <a className="sti-brand" href="/app">
          <WorkspaceMark />
          <span>
            STI<span className="sti-brand-dot">.</span>OS
            <small>Tu operación, en orden.</small>
          </span>
        </a>
        <button
          className="sti-mobile-close sti-icon-button"
          onClick={() => setMobileNav(false)}
          aria-label="Cerrar navegación"
        >
          <X size={20} />
        </button>
        <div className="sti-workspace-label">
          <span className="sti-workspace-avatar">S</span>
          <div>
            STI Sistemas<small>Espacio de trabajo</small>
          </div>
        </div>
        <p className="sti-nav-caption">ESPACIO DE TRABAJO</p>
        <nav>
          {views.map((item) => {
            const Icon = icons[item];
            return (
              <a
                key={item}
                href={`#${item}`}
                className={`sti-nav-item${view === item ? " is-active" : ""}`}
                aria-current={view === item ? "page" : undefined}
                onClick={(event) => {
                  event.preventDefault();
                  navigate(item);
                }}
              >
                <Icon size={18} strokeWidth={1.8} />
                <span>{labels[item]}</span>
                {item === "tasks" && (
                  <span className="sti-nav-count">
                    {
                      data.tasks.filter(
                        (t) =>
                          t.status === "POR_HACER" || t.status === "EN_PROCESO",
                      ).length
                    }
                  </span>
                )}
              </a>
            );
          })}
        </nav>
        <div className="sti-sidebar-note">
          <ShieldCheck size={21} />
          <strong>Cada paso cuenta.</strong>
          <p>Fotos, responsables e historial, juntos en cada tarea.</p>
        </div>
        <div className="sti-sidebar-bottom">
          <ThemeControl />
          <div className="sti-profile">
            <span className="sti-avatar">{initials(account.name)}</span>
            <div>
              <strong>{account.name}</strong>
              <small>{roleLabels[account.role]}</small>
            </div>
          </div>
          <LogoutButton />
        </div>
      </aside>
      <div className="sti-main" inert={mobileNav}>
        <header className="sti-topbar">
          <div className="sti-breadcrumb">
            <button
              className="sti-icon-button sti-mobile-menu"
              aria-label="Abrir navegación"
              aria-expanded={mobileNav}
              onClick={() => setMobileNav(true)}
            >
              <Menu size={21} />
            </button>
            <span>Espacio de trabajo</span>
            <ChevronRight size={14} />
            <strong>{labels[view]}</strong>
          </div>
          <a
            className="sti-demo-link"
            href="/demo"
            target="_blank"
            rel="noreferrer"
          >
            Ver demo pública <ArrowUpRight size={14} />
          </a>
        </header>
        <main id="workspace-content" className="sti-content" tabIndex={-1}>
          {data.notice && (
            <div
              className={`sti-notice ${data.notice.kind}`}
              role={data.notice.kind === "error" ? "alert" : "status"}
            >
              <span>{data.notice.text}</span>
              <button
                className="sti-icon-button"
                aria-label="Cerrar aviso"
                onClick={data.dismissNotice}
              >
                <X size={17} />
              </button>
            </div>
          )}
          {view === "tasks" ? (
            <TaskBoard
              account={account}
              data={data}
              projectFilter={projectFilter}
              onProjectFilter={setProjectFilter}
            />
          ) : (
            <AdminOnboarding
              view={view}
              data={data}
              admin={account.role === "ADMIN"}
              onOpenProject={openProject}
              initialClientId={newProjectClient}
              onCreateProject={(clientId) => {
                navigate("projects");
                setNewProjectClient(clientId);
              }}
            />
          )}
        </main>
        <footer className="sti-footer">
          <span>
            <span className="sti-live-dot" />
            STI Sistemas
          </span>
          <span>Órdenes de servicio · Proyectos · Equipo</span>
        </footer>
      </div>
    </div>
  );
}

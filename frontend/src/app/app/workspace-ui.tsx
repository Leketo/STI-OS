"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { Moon, Sun, X } from "lucide-react";

type Theme = "light" | "dark" | "system";
const themeEvent = "sti-theme-change";
function subscribe(callback: () => void) {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  window.addEventListener("storage", callback);
  window.addEventListener(themeEvent, callback);
  media.addEventListener("change", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(themeEvent, callback);
    media.removeEventListener("change", callback);
  };
}
function getTheme(): Theme {
  try {
    const saved = localStorage.getItem("sti-theme");
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    /* Private browsing can disable storage; system remains available. */
  }
  return "system";
}
function systemDark() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function ThemeControl() {
  const savedTheme = useSyncExternalStore(
    subscribe,
    getTheme,
    () => "system" as Theme,
  );
  const [sessionTheme, setSessionTheme] = useState<Theme | null>(null);
  const theme = sessionTheme ?? savedTheme;
  const dark = useSyncExternalStore(subscribe, systemDark, () => false);
  useEffect(() => {
    const active = theme === "dark" || (theme === "system" && dark);
    document.documentElement.classList.toggle("dark", active);
    document.documentElement.style.colorScheme = active ? "dark" : "light";
  }, [theme, dark]);
  return (
    <div className="sti-theme-control">
      <Sun size={15} aria-hidden="true" />
      <label className="sr-only" htmlFor="sti-theme">
        Apariencia
      </label>
      <select
        id="sti-theme"
        value={theme}
        onChange={(event) => {
          const next = event.target.value as Theme;
          // Apply immediately even when persistent storage is unavailable.
          const active = next === "dark" || (next === "system" && systemDark());
          document.documentElement.classList.toggle("dark", active);
          document.documentElement.style.colorScheme = active
            ? "dark"
            : "light";
          try {
            localStorage.setItem("sti-theme", next);
            setSessionTheme(null);
          } catch {
            setSessionTheme(next);
          }
          window.dispatchEvent(new Event(themeEvent));
        }}
      >
        <option value="light">Día</option>
        <option value="dark">Noche</option>
        <option value="system">Sistema</option>
      </select>
      <Moon size={14} aria-hidden="true" />
    </div>
  );
}

/** Native modal supplies focus containment, background inertness and focus restoration. */
export function Panel({
  title,
  eyebrow,
  children,
  onClose,
  busy = false,
  wide = false,
}: {
  title: string;
  eyebrow?: string;
  children: ReactNode;
  onClose: () => void;
  busy?: boolean;
  wide?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    element.showModal();
    element.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      element.close();
      document.body.style.overflow = previous;
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className={`sti-panel${wide ? " sti-panel-wide" : ""}`}
      aria-labelledby={id}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <header className="sti-panel-head">
        <div>
          {eyebrow && <p className="sti-eyebrow">{eyebrow}</p>}
          <h2 id={id}>{title}</h2>
        </div>
        <button
          type="button"
          className="sti-icon-button"
          aria-label="Cerrar panel"
          disabled={busy}
          onClick={onClose}
        >
          <X size={21} />
        </button>
      </header>
      <div className="sti-panel-body">{children}</div>
    </dialog>
  );
}

export function EmptyState({
  icon,
  title,
  children,
}: {
  icon?: ReactNode;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="sti-empty">
      {icon && (
        <span className="sti-empty-icon" aria-hidden="true">
          {icon}
        </span>
      )}
      <h3>{title}</h3>
      {children && <p>{children}</p>}
    </div>
  );
}

export function WorkspaceMark() {
  return (
    <span className="sti-mark" aria-hidden="true">
      <span />
      <span />
      <span />
    </span>
  );
}

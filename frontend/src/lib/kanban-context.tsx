"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useMemo,
  useSyncExternalStore,
} from "react";
import { INITIAL_COLUMNS, CLIENT_VISIBLE_COLUMN_IDS, type Column, type Priority } from "./kanban-data";

interface FilterState {
  priorities: Priority[];
  assignees: string[];
  searchQuery: string;
}

interface KanbanContextType {
  columns: Column[];
  filteredColumns: Column[];
  theme: "light" | "dark";
  toggleTheme: () => void;
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  mobileSidebarOpen: boolean;
  setMobileSidebarOpen: (open: boolean) => void;
  commandPaletteOpen: boolean;
  setCommandPaletteOpen: (open: boolean) => void;
  filters: FilterState;
  setFilters: React.Dispatch<React.SetStateAction<FilterState>>;
}

const KanbanContext = createContext<KanbanContextType | null>(null);

function subscribeTheme(callback: () => void) {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener("change", callback);
  return () => {
    window.removeEventListener("storage", callback);
    media.removeEventListener("change", callback);
  };
}

function getThemeSnapshot(): "light" | "dark" {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function getServerThemeSnapshot(): "light" | "dark" {
  return "light";
}

export function KanbanProvider({ children }: { children: React.ReactNode }) {
  const columns: Column[] = INITIAL_COLUMNS.filter((column) => CLIENT_VISIBLE_COLUMN_IDS.includes(column.id));
  const theme = useSyncExternalStore(subscribeTheme, getThemeSnapshot, getServerThemeSnapshot);
  const [themeOverride, setThemeOverride] = useState<"light" | "dark" | null>(null);
  const activeTheme = themeOverride ?? theme;

  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState<boolean>(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState<boolean>(false);
  const [filters, setFilters] = useState<FilterState>({
    priorities: ["urgent", "high", "medium", "low"],
    assignees: ["Coordinación Demo", "Diego Ramos", "Lucía Benítez", "Mario Riquelme", "Carlos Mendoza"],
    searchQuery: "",
  });

  // Synchronize HTML class with theme state
  useEffect(() => {
    if (activeTheme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [activeTheme]);

  const toggleTheme = () => {
    setThemeOverride(activeTheme === "light" ? "dark" : "light");
  };

  const toggleSidebar = () => {
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      setMobileSidebarOpen((prev) => !prev);
    } else {
      setSidebarCollapsed((prev) => !prev);
    }
  };

  // Keyboard shortcut for command palette (Cmd+K / Ctrl+K)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCommandPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const filteredColumns = useMemo(() => {
    return columns.map((col) => ({
      ...col,
      tasks: col.tasks.filter((task) => {
        // Priority filter
        if (filters.priorities.length > 0 && !filters.priorities.includes(task.priority)) {
          return false;
        }
        // Assignee filter
        if (filters.assignees.length > 0 && task.assignees.length > 0) {
          const hasSelectedAssignee = task.assignees.some((a) =>
            filters.assignees.includes(a.name)
          );
          if (!hasSelectedAssignee) return false;
        }
        // Search query
        if (filters.searchQuery.trim()) {
          const q = filters.searchQuery.toLowerCase();
          const matchTitle = task.title.toLowerCase().includes(q);
          const matchKey = task.key.toLowerCase().includes(q);
          if (!matchTitle && !matchKey) return false;
        }
        return true;
      }),
    }));
  }, [columns, filters]);

  return (
    <KanbanContext.Provider
      value={{
        columns,
        filteredColumns,
        theme: activeTheme,
        toggleTheme,
        sidebarCollapsed,
        toggleSidebar,
        mobileSidebarOpen,
        setMobileSidebarOpen,
        commandPaletteOpen,
        setCommandPaletteOpen,
        filters,
        setFilters,
      }}
    >
      {children}
    </KanbanContext.Provider>
  );
}

export function useKanban() {
  const context = useContext(KanbanContext);
  if (!context) {
    throw new Error("useKanban must be used within a KanbanProvider");
  }
  return context;
}

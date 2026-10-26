"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, House, Kanban, ListChecks, Settings } from "lucide-react";
import { useKanban } from "@/lib/kanban-context";

const navigationItems = [
  { label: "Panel de control", href: "/", icon: House },
  { label: "Tablero Casa Central", href: "/projects/proj-1/board", icon: Kanban },
  { label: "Lista Casa Central", href: "/projects/proj-1/list", icon: ListChecks },
  { label: "Ajustes de ejemplo", href: "/settings", icon: Settings },
];

export function CommandPalette() {
  const router = useRouter();
  const { commandPaletteOpen, setCommandPaletteOpen } = useKanban();
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!commandPaletteOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setCommandPaletteOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [commandPaletteOpen, setCommandPaletteOpen]);

  if (!commandPaletteOpen) return null;
  const close = () => { setQuery(""); setCommandPaletteOpen(false); };
  const matches = navigationItems.filter((item) => item.label.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-24">
      <div className="fixed inset-0 bg-background/80 backdrop-blur-xs animate-in fade-in duration-150" onClick={close} />
      <div data-slot="dialog-content" className="relative z-50 w-full max-w-lg overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-2xl animate-in fade-in-0 zoom-in-95 duration-150">
        <div className="flex items-center border-b border-border px-3">
          <Search className="size-4 shrink-0 text-muted-foreground mr-2" />
          <input type="text" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar vistas de ejemplo..." autoFocus className="flex h-11 w-full bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground" />
        </div>
        <div className="max-h-80 overflow-y-auto p-2 space-y-1">
          {matches.map((item) => {
            const Icon = item.icon;
            return (
              <button key={item.href} type="button" onClick={() => { close(); router.push(item.href); }} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted text-foreground transition-colors">
                <Icon className="size-4 text-muted-foreground" /> {item.label}
              </button>
            );
          })}
          {matches.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Sin resultados de ejemplo.</p>}
        </div>
      </div>
    </div>
  );
}

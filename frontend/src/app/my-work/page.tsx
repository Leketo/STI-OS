import { GenericPageView } from "@/components/sites/kanban/GenericPageView";
import { ListChecks, ChevronRight } from "lucide-react";
import Link from "next/link";

export default function MyWorkPage() {
  const misOrdenes = [
    {
      key: "TAR-1480",
      title: "Supervisión de peinado e instalación de rack Cat6",
      local: "Casa Central - Sallustro",
      estado: "Por Hacer",
      prioridad: "Alta",
    },
  ];

  return (
    <GenericPageView
      title="Órdenes de ejemplo"
      icon={ListChecks}
      description="Muestra ficticia de órdenes técnicas. No hay usuario autenticado ni asignaciones reales."
    >
      <div className="space-y-4">
        <div className="rounded-xl border border-border bg-card p-5 shadow-2xs">
          <h2 className="text-sm font-semibold text-foreground mb-4">Órdenes Activas de tu Responsabilidad</h2>
          <div className="divide-y divide-border">
            {misOrdenes.map((ord) => (
              <Link
                key={ord.key}
                href="/projects/proj-1/board"
                className="flex items-center justify-between py-3 hover:bg-muted/40 px-2 rounded-lg transition-colors group"
              >
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-primary">{ord.key}</span>
                    <span className="text-xs font-medium text-foreground group-hover:text-primary transition-colors">
                      {ord.title}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">{ord.local} • Prioridad: {ord.prioridad}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-secondary-foreground">
                    {ord.estado}
                  </span>
                  <ChevronRight className="size-4 text-muted-foreground group-hover:text-foreground" />
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </GenericPageView>
  );
}

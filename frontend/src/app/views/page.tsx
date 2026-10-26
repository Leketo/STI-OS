import { GenericPageView } from "@/components/sites/kanban/GenericPageView";
import { Eye, Building } from "lucide-react";
import Link from "next/link";

export default function ViewsPage() {
  const resumenLocales = [
    { local: "Casa Central (Sallustro)", porHacer: 2, enProceso: 1, finalizadas: 1 },
    { local: "Hering", porHacer: 2, enProceso: 1, finalizadas: 1 },
    { local: "Aldo - Paseo La Galería", porHacer: 0, enProceso: 2, finalizadas: 1 },
    { local: "Depósito Logístico", porHacer: 2, enProceso: 1, finalizadas: 0 },
  ];

  return (
    <GenericPageView
      title="Vistas Consolidadas de Asistencias"
      icon={Eye}
      description="Cuadro ilustrativo por local con datos ficticios."
    >
      <div className="space-y-6">
        <div className="rounded-xl border border-border bg-card p-5 shadow-2xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Estado de Asistencias por Local (Cliente: Sallustro)</h2>
              <p className="text-xs text-muted-foreground">Distribución de órdenes de trabajo por punto de servicio</p>
            </div>
            <Link
              href="/projects/proj-1/board"
              className="text-xs font-semibold text-primary hover:underline"
            >
              Ver en Tablero
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-border bg-muted/40 font-medium text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5">Local / Proyecto</th>
                  <th className="px-4 py-2.5 text-center">Por Hacer</th>
                  <th className="px-4 py-2.5 text-center">En Proceso</th>
                  <th className="px-4 py-2.5 text-center">Para Firma</th>
                  <th className="px-4 py-2.5 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {resumenLocales.map((r, i) => (
                  <tr key={i} className="hover:bg-muted/30">
                    <td className="px-4 py-3 font-semibold text-foreground flex items-center gap-2">
                      <Building className="size-3.5 text-muted-foreground" />
                      {r.local}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="rounded-md bg-secondary/20 px-2 py-0.5 font-medium">{r.porHacer}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="rounded-md bg-primary/20 text-primary px-2 py-0.5 font-medium">{r.enProceso}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="rounded-md bg-warning/20 text-warning px-2 py-0.5 font-medium">{r.finalizadas}</span>
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-foreground">
                      {r.porHacer + r.enProceso + r.finalizadas}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </GenericPageView>
  );
}

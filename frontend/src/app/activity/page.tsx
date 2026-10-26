import { GenericPageView } from "@/components/sites/kanban/GenericPageView";
import { Activity } from "lucide-react";
import { RECENT_ACTIVITIES } from "@/lib/kanban-data";

export default function ActivityPage() {
  return (
    <GenericPageView
      title="Actividad y Auditoría"
      icon={Activity}
      description="Actividad ficticia de ejemplo. No se actualiza en tiempo real."
    >
      <div className="rounded-xl border border-border bg-card p-5 shadow-2xs space-y-4">
        {RECENT_ACTIVITIES.map((act, i) => (
          <div key={i} className="flex items-start gap-3 text-xs leading-relaxed border-b border-border pb-3 last:border-0 last:pb-0">
            <div className="size-6 shrink-0 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-[10px]">
              {act.user.split(" ").map((n) => n[0]).join("")}
            </div>
            <div className="flex-1">
              <span className="font-semibold text-foreground">{act.user}</span>{" "}
              <span className="text-muted-foreground">{act.action}</span>{" "}
              <span className="font-medium text-foreground">{act.task}</span>
              {act.from && act.to && (
                <span className="text-muted-foreground">
                  {" "}de <span className="font-medium text-foreground">{act.from}</span> a{" "}
                  <span className="font-medium text-foreground">{act.to}</span>
                </span>
              )}
              <p className="text-[11px] text-muted-foreground mt-0.5">{act.time}</p>
            </div>
          </div>
        ))}
      </div>
    </GenericPageView>
  );
}

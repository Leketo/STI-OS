import { GenericPageView } from "@/components/sites/kanban/GenericPageView";
import { UsersRound, Mail } from "lucide-react";
import { TEAM_MEMBERS } from "@/lib/kanban-data";

export default function TeamPage() {
  return (
    <GenericPageView
      title="Equipo Técnico y Operaciones"
      icon={UsersRound}
      description="Supervisores, técnicos especialistas e instaladores de campo de STI Sistemas."
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {TEAM_MEMBERS.map((member) => (
          <div key={member.name} className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 shadow-2xs">
            <div className="size-10 rounded-full bg-accent text-accent-foreground flex items-center justify-center font-bold text-sm">
              {member.initials}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-foreground truncate">{member.name}</h3>
              <p className="text-xs text-muted-foreground truncate">{member.role}</p>
              <div className="flex items-center gap-1 text-[11px] text-muted-foreground mt-1">
                <Mail className="size-3" />
                <span className="truncate">{member.email}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </GenericPageView>
  );
}

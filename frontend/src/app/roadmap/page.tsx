import { GenericPageView } from "@/components/sites/kanban/GenericPageView";
import { Map } from "lucide-react";

export default function RoadmapPage() {
  return (
    <GenericPageView
      title="Roadmap"
      icon={Map}
      description="Strategic timeline and quarterly milestones."
    />
  );
}

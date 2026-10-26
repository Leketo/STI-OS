import { GenericPageView } from "@/components/sites/kanban/GenericPageView";
import { Target } from "lucide-react";

export default function GoalsPage() {
  return (
    <GenericPageView
      title="Goals"
      icon={Target}
      description="Objectives and key results (OKRs)."
    />
  );
}

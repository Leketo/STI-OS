import { GenericPageView } from "@/components/sites/kanban/GenericPageView";
import { LayoutTemplate } from "lucide-react";

export default function TemplatesPage() {
  return (
    <GenericPageView
      title="Templates"
      icon={LayoutTemplate}
      description="Standardized project blueprints and workflow templates."
    />
  );
}

import { GenericPageView } from "@/components/sites/kanban/GenericPageView";
import { ChartColumn } from "lucide-react";

export default function AnalyticsPage() {
  return (
    <GenericPageView
      title="Analytics"
      icon={ChartColumn}
      description="Cycle time, velocity, and burndown charts."
    />
  );
}

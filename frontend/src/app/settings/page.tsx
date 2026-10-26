import { GenericPageView } from "@/components/sites/kanban/GenericPageView";
import { Settings } from "lucide-react";

export default function SettingsPage() {
  return (
    <GenericPageView
      title="General Settings"
      icon={Settings}
      description="Organization profile, security, and workspace preferences."
    />
  );
}

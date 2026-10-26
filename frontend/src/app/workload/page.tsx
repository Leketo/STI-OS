import { GenericPageView } from "@/components/sites/kanban/GenericPageView";
import { Users } from "lucide-react";

export default function WorkloadPage() {
  return (
    <GenericPageView
      title="Control Horario y Ubicación GPS"
      icon={Users}
      description="Función fuera de esta demostración. No se registran horarios ni ubicaciones."
    />
  );
}

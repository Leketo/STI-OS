import { GenericPageView } from "@/components/sites/kanban/GenericPageView";

const TAB_TITLES: Record<string, string> = {
  timeline: "Cronograma de Trabajos",
  calendar: "Calendario Operativo",
  backlog: "Solicitudes Pendientes",
  cycles: "Semanas Operativas",
  modules: "Servicios y Materiales",
  pages: "Documentación y Planos",
  analytics: "Reportes del Proyecto",
  automations: "Automatizaciones",
  settings: "Configuración del Proyecto",
};

export default async function ProjectSubTabPage({
  params,
}: {
  params: Promise<{ tab: string }>;
}) {
  const { tab } = await params;
  const title = TAB_TITLES[tab] || tab.charAt(0).toUpperCase() + tab.slice(1);

  return (
    <GenericPageView
      title={title}
      description={`Gestión y seguimiento de ${title.toLowerCase()} para Casa Central - Sallustro.`}
    />
  );
}

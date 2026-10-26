import { ProjectOverview } from "@/components/sites/kanban/ProjectOverview";
import { PROJECTS } from "@/lib/kanban-data";
import { notFound } from "next/navigation";

export default async function DynamicProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!PROJECTS.some((project) => project.id === id)) notFound();
  return <ProjectOverview projectId={id} />;
}

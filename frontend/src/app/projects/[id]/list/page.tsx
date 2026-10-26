import { ProjectListView } from "@/components/sites/kanban/ProjectListView";
import { PROJECTS } from "@/lib/kanban-data";
import { notFound } from "next/navigation";

export default async function DynamicListPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!PROJECTS.some((project) => project.id === id)) notFound();
  return <ProjectListView projectId={id} />;
}

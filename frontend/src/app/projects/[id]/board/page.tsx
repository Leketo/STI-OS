import { KanbanBoard } from "@/components/sites/kanban/KanbanBoard";
import { PROJECTS } from "@/lib/kanban-data";
import { notFound } from "next/navigation";

export default async function DynamicBoardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!PROJECTS.some((project) => project.id === id)) notFound();
  return <KanbanBoard projectId={id} />;
}

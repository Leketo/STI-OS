import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { LogoutButton } from "./logout-button";
import { AdminOnboarding } from "./admin-onboarding";
import { TaskBoard } from "./task-board";

type Role = "ADMIN" | "SUPERVISOR" | "USUARIO" | "CLIENTE";
type Account = { id: string; name: string; email: string; role: Role; clientId: string | null };

export const dynamic = "force-dynamic";

export default async function ApplicationHome() {
  const backend = process.env.STI_API_ORIGIN;
  if (!backend) redirect("/login");
  const cookie = (await cookies()).get("STI_SESSION");
  if (!cookie) redirect("/login");
  let account: Account | undefined;
  let denied = false;
  try {
    const response = await fetch(`${backend}/api/auth/me`, {
      headers: { Cookie: `STI_SESSION=${encodeURIComponent(cookie.value)}` },
      cache: "no-store",
    });
    denied = response.status === 401 || response.status === 403;
    if (response.ok) account = await response.json() as Account;
  } catch {
    // Treat network and invalid-response failures as service unavailability.
  }
  if (denied) redirect("/login");
  if (!account || typeof account.name !== "string" || typeof account.email !== "string") {
    return <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-slate-900">
      <section className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl sm:p-9">
        <h1 className="text-xl font-bold">Servicio temporalmente no disponible</h1>
        <p className="mt-3 text-sm text-slate-600">No pudimos comprobar tu sesión. Intentá nuevamente en unos momentos.</p>
        <a href="/app" className="mt-5 inline-block text-sm font-semibold text-blue-700 hover:underline">Reintentar</a>
      </section>
    </main>;
  }
  return (
    <main className="min-h-screen bg-slate-950 px-4 py-10 text-slate-900">
      <section className="mx-auto max-w-5xl rounded-2xl bg-white p-6 shadow-xl sm:p-9">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><p className="text-xs font-bold uppercase tracking-widest text-blue-600">STI-OS</p>
            <h1 className="mt-2 text-2xl font-bold">Hola, {account.name}</h1>
            <p className="mt-1 text-sm text-slate-600">{account.email} · {account.role}</p></div>
          <LogoutButton />
        </div>
        <div className="mt-8 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Las órdenes de abajo son datos reales de tu cuenta. El tablero público enlazado sigue siendo una demostración
          con datos ficticios.
        </div>
        <Link href="/projects/proj-1/board" className="mt-6 inline-block text-sm font-semibold text-blue-700 hover:underline">Abrir tablero de demostración</Link>
        <TaskBoard account={{ id: account.id, role: account.role }} />
        {account.role === "ADMIN" && <AdminOnboarding />}
      </section>
    </main>
  );
}

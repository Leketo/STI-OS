import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Workspace } from "./workspace";
import type { Account } from "./task-model";

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
    if (response.ok) account = (await response.json()) as Account;
  } catch {
    // Treat network and invalid-response failures as service unavailability.
  }
  if (denied) redirect("/login");
  if (
    !account ||
    typeof account.name !== "string" ||
    typeof account.email !== "string"
  ) {
    return (
      <main className="sti-auth">
        <section className="sti-auth-card">
          <h1>Servicio temporalmente no disponible</h1>
          <p>
            No pudimos comprobar tu sesión. Intentá nuevamente en unos momentos.
          </p>
          <a href="/app" className="sti-button secondary">
            Reintentar
          </a>
        </section>
      </main>
    );
  }
  return <Workspace account={account} />;
}

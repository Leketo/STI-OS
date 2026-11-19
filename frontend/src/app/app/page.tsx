import { redirect } from "next/navigation";
import { Workspace } from "./workspace";
import { readAccount } from "./session";

export const dynamic = "force-dynamic";

export default async function ApplicationHome() {
  const session = await readAccount();
  if (session.state === "out") redirect("/login");
  if (session.state === "unavailable") {
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
  // Rule 2 (D-23): with an initial password in force, the only way on is to replace it.
  if (session.account.mustChangePassword) redirect("/primer-ingreso");
  return <Workspace account={session.account} />;
}

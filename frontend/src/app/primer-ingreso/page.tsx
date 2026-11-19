import { redirect } from "next/navigation";
import { readAccount } from "../app/session";
import { FirstSignIn } from "./first-sign-in";

export const dynamic = "force-dynamic";

/** Rule 2 (D-23): the only screen a person with an initial password in force can use, besides leaving. */
export default async function FirstSignInPage() {
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
          <a href="/primer-ingreso" className="sti-button secondary">
            Reintentar
          </a>
        </section>
      </main>
    );
  }
  if (!session.account.mustChangePassword) redirect("/app");
  return <FirstSignIn name={session.account.name} />;
}

"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { LoaderCircle, MailCheck } from "lucide-react";
import { sendWithCsrf } from "../app/api";
import { ThemeControl, WorkspaceMark } from "../app/workspace-ui";

/**
 * Boceto 1.6. The answer is the same for every email, so the screen never says whether there is an account: after
 * sending it always shows the same box. The mail itself comes from the queue, later.
 */
export function RecoverForm() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await sendWithCsrf("POST", "/api/auth/password-recovery", {
        email: email.trim().toLowerCase(),
      });
      if (response.ok) {
        setSent(true);
        return;
      }
      setError(
        response.status === 429
          ? "El sistema está ocupado. Probá de nuevo en unos segundos."
          : "No se pudo enviar el pedido. Intentá nuevamente.",
      );
    } catch {
      setError("No se pudo conectar con el servidor. Intentá nuevamente.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="sti-auth">
      <div className="sti-auth-card">
        <div className="sti-brand">
          <WorkspaceMark />
          <span>
            STI<span className="sti-brand-dot">.</span>OS
            <small>Tu operación, en orden.</small>
          </span>
        </div>
        <p className="sti-eyebrow">RECUPERAR ACCESO</p>
        <h1>¿Olvidaste tu contraseña?</h1>
        {sent ? (
          <>
            <section className="sti-recovery-sent" aria-live="polite">
              <h2>
                <MailCheck size={18} aria-hidden="true" /> Revisá tu correo
              </h2>
              <p>
                Si ese correo tiene una cuenta, te llega un enlace. Sirve una
                sola vez y vence en 30 minutos.
              </p>
            </section>
          </>
        ) : (
          <>
            <p>
              Escribí tu correo y te mandamos un enlace para elegir una nueva.
            </p>
            <form onSubmit={submit} className="sti-form">
              <div className="sti-field">
                <label htmlFor="recover-email">Correo</label>
                <input
                  id="recover-email"
                  type="email"
                  autoComplete="username"
                  required
                  maxLength={254}
                  data-autofocus
                  value={email}
                  disabled={busy}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              {error && (
                <p role="alert" className="sti-inline-message">
                  {error}
                </p>
              )}
              <button type="submit" disabled={busy} className="sti-button primary">
                {busy && <LoaderCircle size={16} className="sti-spin" />}
                {busy ? "Enviando…" : "Enviarme el enlace"}
              </button>
            </form>
          </>
        )}
        <p className="sti-recovery-note">
          ¿No usás correo? Pedile al administrador que te la restablezca.
        </p>
        <div className="sti-auth-footer">
          <Link href="/login">Volver al ingreso</Link>
          <ThemeControl />
        </div>
      </div>
    </main>
  );
}

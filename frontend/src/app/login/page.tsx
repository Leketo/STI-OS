"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ThemeControl, WorkspaceMark } from "../app/workspace-ui";

type Csrf = { token: string; headerName: string };

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const tokenResponse = await fetch("/api/auth/csrf", {
        credentials: "same-origin",
        cache: "no-store",
      });
      if (!tokenResponse.ok) throw new Error("unavailable");
      const csrf = (await tokenResponse.json()) as Csrf;
      const response = await fetch("/api/auth/login", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          [csrf.headerName]: csrf.token,
        },
        body: new URLSearchParams({
          username: email.trim().toLowerCase(),
          password,
        }),
      });
      if (!response.ok) {
        setError(
          response.status === 401
            ? "Correo o contraseña incorrectos."
            : "No se pudo iniciar sesión.",
        );
        return;
      }
      router.replace("/app");
      router.refresh();
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
        <h1>Bienvenido de nuevo.</h1>
        <p>Ingresá para continuar con tu trabajo.</p>
        <form onSubmit={submit} className="sti-form">
          <div className="sti-field">
            <label htmlFor="email">Correo electrónico</label>
            <input
              id="email"
              type="email"
              autoComplete="username"
              required
              value={email}
              disabled={busy}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="sti-field">
            <label htmlFor="password">Contraseña</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              disabled={busy}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error && (
            <p role="alert" className="sti-inline-message">
              {error}
            </p>
          )}
          <button type="submit" disabled={busy} className="sti-button primary">
            {busy ? "Ingresando…" : "Ingresar"}
          </button>
        </form>
        <div className="sti-auth-footer">
          <Link href="/demo">Explorar la demostración pública</Link>
          <ThemeControl />
        </div>
      </div>
    </main>
  );
}

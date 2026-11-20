"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CircleCheck } from "lucide-react";
import { sendWithCsrf } from "../app/api";
import { PasswordForm } from "../app/password-form";
import { ThemeControl, WorkspaceMark } from "../app/workspace-ui";

const TOKEN_SHAPE = /^[A-Za-z0-9_-]{43}$/;
type Phase = "checking" | "form" | "done" | "invalid" | "unavailable";

function Card({ children }: { children: React.ReactNode }) {
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
        {children}
        <div className="sti-auth-footer">
          <Link href="/login">Volver al ingreso</Link>
          <ThemeControl />
        </div>
      </div>
    </main>
  );
}

/**
 * Choosing a new password from the link of the mail. The token is read from the address once, checked before the
 * person types anything, and then kept only in memory: the address bar is cleaned so the link does not stay on
 * screen, in the history or in a capture. A link that is used, expired, tampered with or unknown looks the same.
 */
export function NewPassword() {
  const [phase, setPhase] = useState<Phase>("checking");
  const token = useRef("");

  useEffect(() => {
    let alive = true;
    const candidate = window.location.hash.replace(/^#/, "");
    async function check() {
      if (!TOKEN_SHAPE.test(candidate)) return "invalid" as const;
      try {
        const response = await sendWithCsrf(
          "POST",
          "/api/auth/password-recovery/check",
          { token: candidate },
        );
        if (response.ok) {
          token.current = candidate;
          window.history.replaceState(
            null,
            "",
            window.location.pathname + window.location.search,
          );
          return "form" as const;
        }
        return response.status === 400 ? ("invalid" as const) : ("unavailable" as const);
      } catch {
        return "unavailable" as const;
      }
    }
    void check().then((next) => {
      if (alive) setPhase(next);
    });
    return () => {
      alive = false;
    };
  }, []);

  if (phase === "checking") {
    return (
      <Card>
        <p className="sti-eyebrow">RECUPERAR ACCESO</p>
        <h1>Un momento…</h1>
        <p role="status">Estamos comprobando el enlace.</p>
      </Card>
    );
  }
  if (phase === "invalid") {
    return (
      <Card>
        <p className="sti-eyebrow">RECUPERAR ACCESO</p>
        <h1 role="alert">Este enlace ya no sirve. Pedí uno nuevo.</h1>
        <Link href="/recuperar" className="sti-button primary sti-auth-action">
          Pedir un enlace nuevo
        </Link>
      </Card>
    );
  }
  if (phase === "unavailable") {
    return (
      <Card>
        <p className="sti-eyebrow">RECUPERAR ACCESO</p>
        <h1>Servicio temporalmente no disponible</h1>
        <p>No pudimos comprobar el enlace. Intentá nuevamente en unos momentos.</p>
        <button
          type="button"
          className="sti-button secondary"
          onClick={() => window.location.reload()}
        >
          Reintentar
        </button>
      </Card>
    );
  }
  if (phase === "done") {
    return (
      <Card>
        <p className="sti-eyebrow">RECUPERAR ACCESO</p>
        <h1 role="status">
          <CircleCheck size={22} aria-hidden="true" /> Listo. Ya podés ingresar
          con tu contraseña nueva.
        </h1>
        <Link href="/login" className="sti-button primary sti-auth-action">
          Ir al ingreso
        </Link>
      </Card>
    );
  }
  return (
    <Card>
      <p className="sti-eyebrow">RECUPERAR ACCESO</p>
      <h1>Elegí tu contraseña nueva</h1>
      <PasswordForm
        requireCurrent={false}
        submitLabel="Guardar"
        send={async (newPassword) => {
          const response = await sendWithCsrf(
            "POST",
            "/api/auth/password-recovery/confirm",
            { token: token.current, newPassword },
          );
          // The link can die while the person types (used elsewhere, or the 30 minutes ran out).
          if (response.status === 400) {
            const body = (await response.clone().json().catch(() => null)) as {
              code?: unknown;
            } | null;
            if (body?.code === "ENLACE_INVALIDO") {
              token.current = "";
              setPhase("invalid");
            }
          }
          return response;
        }}
        onDone={() => {
          token.current = "";
          setPhase("done");
        }}
      />
    </Card>
  );
}

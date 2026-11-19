"use client";

import { useRouter } from "next/navigation";
import { LogoutButton } from "../app/logout-button";
import { PasswordForm } from "../app/password-form";
import { ThemeControl, WorkspaceMark } from "../app/workspace-ui";

export function FirstSignIn({ name }: { name: string }) {
  const router = useRouter();
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
        <h1>Elegí tu contraseña</h1>
        <p>
          Hola, {name}. Antes de seguir, cambiá la contraseña inicial por una
          tuya.
        </p>
        <PasswordForm
          requireCurrent={false}
          submitLabel="Guardar y entrar"
          onDone={() => {
            router.replace("/app");
            router.refresh();
          }}
        />
        <p className="sti-form-help">
          La contraseña inicial deja de servir en cuanto guardás la tuya.
        </p>
        <div className="sti-auth-footer">
          <LogoutButton />
          <ThemeControl />
        </div>
      </div>
    </main>
  );
}

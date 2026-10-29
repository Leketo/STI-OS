"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";

export function LogoutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  async function logout() {
    setBusy(true);
    setFailed(false);
    try {
      const response = await fetch("/api/auth/csrf", {
        credentials: "same-origin",
        cache: "no-store",
      });
      if (!response.ok) throw new Error("csrf");
      const token = (await response.json()) as {
        token: string;
        headerName: string;
      };
      const result = await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "same-origin",
        headers: { [token.headerName]: token.token },
      });
      if (!result.ok) throw new Error("logout");
      router.replace("/login");
      router.refresh();
    } catch {
      setFailed(true);
      setBusy(false);
    }
  }
  return (
    <div>
      <button
        type="button"
        disabled={busy}
        onClick={logout}
        className="sti-logout"
      >
        <LogOut size={14} />
        {busy ? "Cerrando sesión…" : "Cerrar sesión"}
      </button>
      {failed && (
        <p role="alert" className="sti-muted">
          No se pudo cerrar la sesión. Intentá otra vez.
        </p>
      )}
    </div>
  );
}

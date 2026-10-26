"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function LogoutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function logout() {
    setBusy(true);
    try {
      const response = await fetch("/api/auth/csrf", { credentials: "same-origin", cache: "no-store" });
      if (!response.ok) throw new Error("csrf");
      const token = await response.json() as { token: string; headerName: string };
      const result = await fetch("/api/auth/logout", {
        method: "POST", credentials: "same-origin", headers: { [token.headerName]: token.token },
      });
      if (!result.ok) throw new Error("logout");
      router.replace("/login");
      router.refresh();
    } catch {
      setBusy(false);
    }
  }
  return <button type="button" disabled={busy} onClick={logout} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold hover:bg-slate-50 disabled:opacity-60">Cerrar sesión</button>;
}

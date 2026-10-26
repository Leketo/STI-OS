"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

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
      const tokenResponse = await fetch("/api/auth/csrf", { credentials: "same-origin", cache: "no-store" });
      if (!tokenResponse.ok) throw new Error("unavailable");
      const csrf = await tokenResponse.json() as Csrf;
      const response = await fetch("/api/auth/login", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/x-www-form-urlencoded", [csrf.headerName]: csrf.token },
        body: new URLSearchParams({ username: email.trim().toLowerCase(), password }),
      });
      if (!response.ok) {
        setError(response.status === 401 ? "Correo o contraseña incorrectos." : "No se pudo iniciar sesión.");
        return;
      }
      router.replace("/app");
      router.refresh();
    } catch {
      setError("No se pudo conectar con el servidor local.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-8 text-slate-900">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl sm:p-9">
        <div className="mb-8 flex items-center gap-3">
          <div className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-black text-white">STI</div>
          <div><h1 className="text-xl font-bold">STI-OS</h1><p className="text-sm text-slate-500">Acceso al sistema</p></div>
        </div>
        <form onSubmit={submit} className="space-y-5">
          <div><label htmlFor="email" className="mb-1 block text-sm font-medium">Correo electrónico</label>
            <input id="email" type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2.5 focus:border-blue-600 focus:outline-none" /></div>
          <div><label htmlFor="password" className="mb-1 block text-sm font-medium">Contraseña</label>
            <input id="password" type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2.5 focus:border-blue-600 focus:outline-none" /></div>
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
          <button type="submit" disabled={busy} className="w-full rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white hover:bg-blue-700 disabled:opacity-60">{busy ? "Ingresando…" : "Ingresar"}</button>
        </form>
        <Link href="/" className="mt-6 block text-center text-sm text-blue-700 hover:underline">Ver la demostración pública</Link>
      </div>
    </main>
  );
}

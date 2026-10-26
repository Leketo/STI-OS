"use client";

import { useEffect, useState } from "react";
import { errorFor, postWithCsrf } from "./api";

type Client = { id: string; name: string };
type Role = "ADMIN" | "SUPERVISOR" | "USUARIO" | "CLIENTE";

const inputClass = "w-full rounded-lg border border-slate-300 px-3 py-2.5 focus:border-blue-600 focus:outline-none";

export function AdminOnboarding() {
  const [clients, setClients] = useState<Client[]>([]);
  const [catalogError, setCatalogError] = useState("");
  const [clientName, setClientName] = useState("");
  const [clientMessage, setClientMessage] = useState("");
  const [clientBusy, setClientBusy] = useState(false);
  const [projectClientId, setProjectClientId] = useState("");
  const [projectName, setProjectName] = useState("");
  const [projectMessage, setProjectMessage] = useState("");
  const [projectBusy, setProjectBusy] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("USUARIO");
  const [clientId, setClientId] = useState("");
  const [accountMessage, setAccountMessage] = useState("");
  const [accountBusy, setAccountBusy] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/clients", { credentials: "same-origin", cache: "no-store" })
      .then(async response => {
        if (!response.ok) throw new Error("catalog");
        return response.json() as Promise<Client[]>;
      })
      .then(data => { if (active) setClients(data); })
      .catch(() => { if (active) setCatalogError("No se pudo cargar la lista de clientes."); });
    return () => { active = false; };
  }, []);

  async function createClient(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setClientMessage("");
    setClientBusy(true);
    try {
      const response = await postWithCsrf("/api/clients", { name: clientName.trim() });
      if (!response.ok) { setClientMessage(errorFor(response)); return; }
      const created = await response.json() as Client;
      setClients(previous => [...previous, created].sort((a, b) => a.name.localeCompare(b.name)));
      setClientId(previous => previous || created.id);
      setClientName("");
      setCatalogError("");
      setClientMessage(`Cliente ${created.name} creado.`);
    } catch {
      setClientMessage("No se pudo confirmar el alta. Revisá la lista de clientes antes de intentar otra vez.");
      try {
        const response = await fetch("/api/clients", { credentials: "same-origin", cache: "no-store" });
        if (response.ok) setClients(await response.json() as Client[]);
      } catch {
        // The outcome is unknown; keep the warning visible.
      }
    } finally {
      setClientBusy(false);
    }
  }

  async function createProject(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProjectMessage("");
    setProjectBusy(true);
    try {
      const response = await postWithCsrf("/api/projects", { clientId: projectClientId, name: projectName.trim() });
      if (!response.ok) { setProjectMessage(errorFor(response)); return; }
      const created = await response.json() as { name: string };
      setProjectName("");
      setProjectMessage(`Proyecto ${created.name} creado. Ya podés crear tareas dentro.`);
    } catch {
      setProjectMessage("No se pudo confirmar el alta. Revisá la lista de proyectos antes de intentar otra vez.");
    } finally {
      setProjectBusy(false);
    }
  }

  async function createAccount(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAccountMessage("");
    setAccountBusy(true);
    try {
      const response = await postWithCsrf("/api/accounts", {
        name: name.trim(), email: email.trim().toLowerCase(), password, role,
        clientId: role === "CLIENTE" ? clientId : null,
      });
      if (!response.ok) { setAccountMessage(errorFor(response)); return; }
      setAccountMessage(`Cuenta ${email.trim().toLowerCase()} creada.`);
      setName("");
      setEmail("");
      setRole("USUARIO");
      setClientId("");
    } catch {
      setAccountMessage("No se pudo conectar con el servidor local.");
    } finally {
      setPassword("");
      setAccountBusy(false);
    }
  }

  return <div className="mt-8 space-y-8 border-t border-slate-200 pt-8">
    <div><h2 className="text-xl font-bold">Administración de accesos</h2>
      <p className="mt-1 text-sm text-slate-600">Creá primero el cliente y después asignale una cuenta con rol CLIENTE.</p></div>
    <form onSubmit={createClient} className="space-y-4 rounded-xl border border-slate-200 p-4 sm:p-5">
      <h3 className="font-semibold">Nuevo cliente</h3>
      <div><label htmlFor="client-name" className="mb-1 block text-sm font-medium">Nombre del cliente</label>
        <input id="client-name" className={inputClass} required maxLength={200} value={clientName} onChange={event => setClientName(event.target.value)} /></div>
      {clientMessage && <p role="status" className="text-sm text-slate-700">{clientMessage}</p>}
      <details className="text-sm text-slate-600"><summary className="cursor-pointer">Ver clientes existentes ({clients.length})</summary>
        <ul className="mt-2 max-h-44 list-inside list-disc overflow-y-auto">{clients.map(client => <li key={client.id}>{client.name}</li>)}</ul>
      </details>
      <button type="submit" disabled={clientBusy} className="rounded-lg bg-blue-600 px-4 py-2.5 font-semibold text-white hover:bg-blue-700 disabled:opacity-60">{clientBusy ? "Guardando…" : "Crear cliente"}</button>
    </form>
    <form onSubmit={createProject} className="space-y-4 rounded-xl border border-slate-200 p-4 sm:p-5">
      <h3 className="font-semibold">Nuevo proyecto</h3>
      <p className="text-sm text-slate-600">Toda tarea vive dentro de un proyecto de un cliente.</p>
      <div><label htmlFor="project-client" className="mb-1 block text-sm font-medium">Cliente</label>
        <select id="project-client" className={inputClass} required value={projectClientId} onChange={event => setProjectClientId(event.target.value)}>
          <option value="">Seleccioná un cliente</option>
          {clients.map(client => <option key={client.id} value={client.id}>{client.name}</option>)}
        </select></div>
      <div><label htmlFor="project-name" className="mb-1 block text-sm font-medium">Nombre del proyecto</label>
        <input id="project-name" className={inputClass} required maxLength={200} value={projectName} onChange={event => setProjectName(event.target.value)} /></div>
      {projectMessage && <p role="status" className="text-sm text-slate-700">{projectMessage}</p>}
      <button type="submit" disabled={projectBusy || !projectClientId} className="rounded-lg bg-blue-600 px-4 py-2.5 font-semibold text-white hover:bg-blue-700 disabled:opacity-60">{projectBusy ? "Guardando…" : "Crear proyecto"}</button>
    </form>
    <form onSubmit={createAccount} className="space-y-4 rounded-xl border border-slate-200 p-4 sm:p-5">
      <h3 className="font-semibold">Nueva cuenta</h3>
      <div><label htmlFor="account-name" className="mb-1 block text-sm font-medium">Nombre</label>
        <input id="account-name" className={inputClass} required maxLength={200} value={name} onChange={event => setName(event.target.value)} /></div>
      <div><label htmlFor="account-email" className="mb-1 block text-sm font-medium">Correo electrónico</label>
        <input id="account-email" type="email" autoComplete="off" className={inputClass} required maxLength={254} value={email} onChange={event => setEmail(event.target.value)} /></div>
      <div><label htmlFor="account-password" className="mb-1 block text-sm font-medium">Contraseña inicial (mínimo 12 caracteres)</label>
        <input id="account-password" type="password" autoComplete="new-password" className={inputClass} required minLength={12} maxLength={1024} value={password} onChange={event => setPassword(event.target.value)} /></div>
      <div><label htmlFor="account-role" className="mb-1 block text-sm font-medium">Rol</label>
        <select id="account-role" className={inputClass} value={role} onChange={event => setRole(event.target.value as Role)}>
          <option value="USUARIO">Usuario</option><option value="SUPERVISOR">Supervisor</option>
          <option value="CLIENTE">Cliente</option><option value="ADMIN">Administrador</option>
        </select></div>
      {role === "CLIENTE" && <div><label htmlFor="account-client" className="mb-1 block text-sm font-medium">Cliente de la cuenta</label>
        <select id="account-client" className={inputClass} required value={clientId} onChange={event => setClientId(event.target.value)}>
          <option value="">Seleccioná un cliente</option>
          {clients.map(client => <option key={client.id} value={client.id}>{client.name}</option>)}
        </select>
        {catalogError && <p role="alert" className="mt-2 text-sm text-red-700">{catalogError}</p>}
      </div>}
      {accountMessage && <p role="status" className="text-sm text-slate-700">{accountMessage}</p>}
      <button type="submit" disabled={accountBusy || (role === "CLIENTE" && !clientId)} className="rounded-lg bg-blue-600 px-4 py-2.5 font-semibold text-white hover:bg-blue-700 disabled:opacity-60">{accountBusy ? "Guardando…" : "Crear cuenta"}</button>
    </form>
  </div>;
}

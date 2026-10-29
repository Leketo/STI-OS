"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { errorFor } from "./api";
import {
  isOperator,
  type Account,
  type Client,
  type Operator,
  type Project,
  type Task,
} from "./task-model";

export function useWorkspaceData(account: Account) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [operators, setOperators] = useState<Operator[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState<{
    kind: "error" | "success";
    text: string;
  } | null>(null);
  const pending = useRef(false);
  const refreshRequired = useRef(false);
  const mutationError = useRef("");
  const operator = isOperator(account.role);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      async function read<T>(path: string): Promise<T> {
        const response = await fetch(path, {
          credentials: "same-origin",
          cache: "no-store",
          signal,
        });
        if (!response.ok) throw new Error(errorFor(response));
        return response.json() as Promise<T>;
      }
      const [nextTasks, nextProjects, nextClients, nextOperators] =
        await Promise.all([
          read<Task[]>("/api/tasks"),
          read<Project[]>("/api/projects"),
          read<Client[]>("/api/clients"),
          operator ? read<Operator[]>("/api/operators") : Promise.resolve([]),
        ]);
      if (signal?.aborted) return;
      setTasks(nextTasks);
      setProjects(nextProjects);
      setClients(nextClients);
      setOperators(nextOperators);
      setHasLoaded(true);
    },
    [operator],
  );

  useEffect(() => {
    const controller = new AbortController();
    Promise.resolve()
      .then(() => load(controller.signal))
      .catch((error) => {
        if (!controller.signal.aborted)
          setNotice({
            kind: "error",
            text:
              error instanceof Error
                ? error.message
                : "No se pudieron cargar los datos.",
          });
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [load]);

  async function refresh() {
    if (pending.current) return;
    pending.current = true;
    setBusy("refresh");
    setLoading(true);
    setNotice(null);
    try {
      await load();
      refreshRequired.current = false;
    } catch {
      setNotice({
        kind: "error",
        text: "No se pudieron actualizar los datos. Intentá nuevamente.",
      });
    } finally {
      pending.current = false;
      setBusy("");
      setLoading(false);
    }
  }

  /** The lock starts before GPS/CSRF, preventing double writes while those requests are pending. */
  async function mutate(
    key: string,
    write: () => Promise<Response>,
    success: string,
    failure = errorFor,
  ): Promise<boolean> {
    if (pending.current) return false;
    if (refreshRequired.current) {
      mutationError.current =
        "Actualizá la vista antes de continuar: hay una operación cuyo resultado necesita comprobarse.";
      setNotice({ kind: "error", text: mutationError.current });
      return false;
    }
    mutationError.current = "";
    pending.current = true;
    setBusy(key);
    setNotice(null);
    try {
      const response = await write();
      if (!response.ok) {
        mutationError.current = failure(response);
        setNotice({ kind: "error", text: mutationError.current });
        return false;
      }
      // Keep a confirmed status change visible even if the subsequent collection reload fails.
      const saved = (await response.json().catch(() => null)) as Task | null;
      if (
        saved &&
        typeof saved.id === "string" &&
        typeof saved.status === "string" &&
        typeof saved.title === "string"
      ) {
        setTasks((previous) =>
          previous.some((t) => t.id === saved.id)
            ? previous.map((t) => (t.id === saved.id ? saved : t))
            : [saved, ...previous],
        );
      }
      setNotice({ kind: "success", text: success });
      try {
        await load();
      } catch {
        refreshRequired.current = true;
        setNotice({
          kind: "error",
          text: `${success} No pudimos actualizar la vista; usá Actualizar antes de continuar.`,
        });
      }
      return true;
    } catch {
      refreshRequired.current = true;
      mutationError.current =
        "No pudimos confirmar el resultado. Cerrá el panel y actualizá la vista antes de intentar la acción nuevamente.";
      setNotice({ kind: "error", text: mutationError.current });
      return false;
    } finally {
      pending.current = false;
      setBusy("");
    }
  }

  return {
    tasks,
    projects,
    clients,
    operators,
    loading,
    hasLoaded,
    busy,
    notice,
    refresh,
    mutate,
    mutationError,
    dismissNotice: () => setNotice(null),
  };
}
export type WorkspaceData = ReturnType<typeof useWorkspaceData>;

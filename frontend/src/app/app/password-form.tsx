"use client";

import { useId, useState, type FormEvent } from "react";
import { Check, LoaderCircle, X } from "lucide-react";
import { leaveIfSessionEnded, sendWithCsrf } from "./api";
import { MIN_PASSWORD, passwordProblem } from "./task-model";

/** The text the server chose for a refusal, or a fixed one. It never carries a password. */
export async function refusalMessage(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as {
    message?: unknown;
  } | null;
  if (body && typeof body.message === "string") return body.message;
  if (response.status === 403)
    return "Tu sesión o tus permisos cambiaron. Volvé a ingresar.";
  if (response.status === 404) return "Esa persona ya no está disponible.";
  if (response.status === 400) return "Revisá los datos ingresados.";
  return "No se pudo completar la operación. Intentá nuevamente.";
}

/**
 * The person's own password (rules 2 and 3). On the first sign-in the initial password is not asked again; from
 * "Mi contraseña" the current one is. The fields are emptied after every attempt that reached the server.
 */
export function PasswordForm({
  requireCurrent,
  submitLabel,
  onDone,
  onCancel,
  send,
}: {
  requireCurrent: boolean;
  submitLabel: string;
  onDone: () => void;
  onCancel?: () => void;
  /**
   * Another way to send the new password. The screen reached from the recovery link has no session and sends it
   * together with the link's token to its own address. Without it the form changes the signed-in person's password.
   */
  send?: (newPassword: string) => Promise<Response>;
}) {
  const id = useId();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeated, setRepeated] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const problem = passwordProblem(next, repeated);
  const ready = !problem && (!requireCurrent || !!current);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    setError("");
    try {
      const response = send
        ? await send(next)
        : await sendWithCsrf(
            "POST",
            "/api/auth/password",
            requireCurrent
              ? { currentPassword: current, newPassword: next }
              : { newPassword: next },
          );
      if (!send && leaveIfSessionEnded(response)) return;
      setCurrent("");
      if (!response.ok) {
        setError(await refusalMessage(response));
        return;
      }
      setNext("");
      setRepeated("");
      onDone();
    } catch {
      setError("No se pudo conectar con el servidor. Intentá nuevamente.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="sti-form" onSubmit={submit}>
      {requireCurrent && (
        <div className="sti-field">
          <label htmlFor={`${id}-current`}>
            Contraseña actual <span>*</span>
          </label>
          <input
            id={`${id}-current`}
            type="password"
            autoComplete="current-password"
            data-autofocus
            required
            maxLength={1024}
            value={current}
            disabled={busy}
            onChange={(e) => setCurrent(e.target.value)}
          />
        </div>
      )}
      <div className="sti-field">
        <label htmlFor={`${id}-next`}>
          Contraseña nueva <span>*</span>
        </label>
        <input
          id={`${id}-next`}
          type="password"
          autoComplete="new-password"
          data-autofocus={!requireCurrent || undefined}
          required
          minLength={MIN_PASSWORD}
          maxLength={1024}
          value={next}
          disabled={busy}
          aria-describedby={`${id}-next-help`}
          onChange={(e) => setNext(e.target.value)}
        />
        <p id={`${id}-next-help`}>12 caracteres como mínimo.</p>
      </div>
      <div className="sti-field">
        <label htmlFor={`${id}-repeat`}>
          Repetila <span>*</span>
        </label>
        <input
          id={`${id}-repeat`}
          type="password"
          autoComplete="new-password"
          required
          maxLength={1024}
          value={repeated}
          disabled={busy}
          aria-describedby={`${id}-match`}
          onChange={(e) => setRepeated(e.target.value)}
        />
        <p id={`${id}-match`} className="sti-match" aria-live="polite">
          {repeated &&
            (repeated === next ? (
              <span className="is-ok">
                <Check size={14} aria-hidden="true" /> Coinciden.
              </span>
            ) : (
              <span className="is-wrong">
                <X size={14} aria-hidden="true" /> No coinciden.
              </span>
            ))}
        </p>
      </div>
      {error && (
        <p role="alert" className="sti-inline-message">
          {error}
        </p>
      )}
      <div className="sti-form-actions">
        {onCancel && (
          <button
            type="button"
            className="sti-button secondary"
            disabled={busy}
            onClick={onCancel}
          >
            Cancelar
          </button>
        )}
        <button
          type="submit"
          className="sti-button primary"
          disabled={!ready || busy}
        >
          {busy && <LoaderCircle size={16} className="sti-spin" />}
          {busy ? "Guardando…" : submitLabel}
        </button>
      </div>
    </form>
  );
}

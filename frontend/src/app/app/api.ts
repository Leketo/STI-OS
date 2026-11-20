/** Same-origin writes against the local backend. Each write asks for a fresh CSRF token. */
export async function sendWithCsrf(method: string, path: string, body?: object): Promise<Response> {
  const tokenResponse = await fetch("/api/auth/csrf", { credentials: "same-origin", cache: "no-store" });
  if (!tokenResponse.ok) throw new Error("unavailable");
  const csrf = await tokenResponse.json() as { token: string; headerName: string };
  return fetch(path, {
    method,
    credentials: "same-origin",
    cache: "no-store",
    headers: { "Content-Type": "application/json", [csrf.headerName]: csrf.token },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export function postWithCsrf(path: string, body: object): Promise<Response> {
  return sendWithCsrf("POST", path, body);
}

/** Multipart upload. The browser sets its own Content-Type with the boundary, so we must not. */
export async function uploadWithCsrf(path: string, file: File): Promise<Response> {
  const tokenResponse = await fetch("/api/auth/csrf", { credentials: "same-origin", cache: "no-store" });
  if (!tokenResponse.ok) throw new Error("unavailable");
  const csrf = await tokenResponse.json() as { token: string; headerName: string };
  const body = new FormData();
  body.append("file", file);
  return fetch(path, {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: { [csrf.headerName]: csrf.token },
    body,
  });
}

/**
 * A 401 means the session is over: it expired after 30 minutes without use, or was closed elsewhere. Nothing
 * on this screen can succeed any more, so every read and write sends the person to sign in again (N-15)
 * instead of showing an error over stale data.
 */
export function leaveIfSessionEnded(
  response: Pick<Response, "status">,
  go: (path: string) => void = (path) => window.location.assign(path),
): boolean {
  if (response.status !== 401) return false;
  go("/login");
  return true;
}

/**
 * What the sign-in screen says when the server refuses. A 429 is either the sign-in block (N-30) or a server too
 * busy to check one more password (rule 14): when the application answered, its words are shown as they come.
 * When the web server in front answered instead (an HTML page, no JSON of the application), N-45: a fixed text.
 */
export function signInRefusal(status: number, body: unknown): string {
  if (status === 401) return "Correo o contraseña incorrectos.";
  if (status === 429) {
    const message = (body as { message?: unknown } | null)?.message;
    return typeof message === "string" && message.trim()
      ? message
      : "Demasiados intentos. Esperá un minuto y probá de nuevo.";
  }
  return "No se pudo iniciar sesión.";
}

export function errorFor(response: Response): string {
  if (response.status === 400) return "Revisá los datos ingresados.";
  if (response.status === 404) return "La tarea ya no está disponible para tu cuenta.";
  if (response.status === 409) return "Ese correo ya está registrado.";
  if (response.status === 401 || response.status === 403) return "Tu sesión o tus permisos cambiaron. Volvé a ingresar.";
  return "No se pudo completar la operación. Intentá nuevamente.";
}

export type DeviceLocation = { latitude: number; longitude: number; accuracyM: number } | { absentReason: string };

/**
 * GPS is required at every step, but a device that cannot obtain a fix records the reason instead of
 * blocking the work. The reason is kept short because the backend stores at most 200 characters.
 *
 * Ten seconds is the ceiling on waiting for a fix, chosen because a cold GPS rarely answers faster
 * and the traceability is worth the wait. A minute of cached position is accepted so a device that
 * already has a fix answers instantly: a person does not move far in a minute, and the alternative
 * is waiting out the timeout for nothing.
 */
export function deviceLocation(): Promise<DeviceLocation> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return Promise.resolve({ absentReason: "El dispositivo no ofrece ubicación." });
  }
  return new Promise(resolve => {
    navigator.geolocation.getCurrentPosition(
      position => resolve({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracyM: position.coords.accuracy,
      }),
      error => resolve({ absentReason: `Sin ubicación del dispositivo: ${error.message}`.slice(0, 200) }),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  });
}

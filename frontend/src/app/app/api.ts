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
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  });
}

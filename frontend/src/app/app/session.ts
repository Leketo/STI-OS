import { cookies } from "next/headers";
import type { Account } from "./task-model";

/**
 * The signed-in account, read on the server. "out" sends to sign in; "unavailable" means the backend could not
 * be asked, which is not the same as being signed out.
 */
export async function readAccount(): Promise<
  { state: "in"; account: Account } | { state: "out" } | { state: "unavailable" }
> {
  const backend = process.env.STI_API_ORIGIN;
  if (!backend) return { state: "out" };
  const cookie = (await cookies()).get("STI_SESSION");
  if (!cookie) return { state: "out" };
  try {
    const response = await fetch(`${backend}/api/auth/me`, {
      headers: { Cookie: `STI_SESSION=${encodeURIComponent(cookie.value)}` },
      cache: "no-store",
    });
    if (response.status === 401 || response.status === 403) return { state: "out" };
    if (!response.ok) return { state: "unavailable" };
    const account = (await response.json()) as Account;
    if (typeof account.name !== "string" || typeof account.email !== "string")
      return { state: "unavailable" };
    return { state: "in", account };
  } catch {
    // Network and invalid-response failures are service unavailability.
    return { state: "unavailable" };
  }
}

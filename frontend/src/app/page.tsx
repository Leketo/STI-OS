import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * The root is the front door of the real system, not of the demo. Someone with a session lands on
 * their board; everyone else lands on the login screen. The fictitious dashboard that used to live
 * here is still reachable at /demo while its design is being reused.
 */
export default async function Root() {
  const session = (await cookies()).get("STI_SESSION");
  redirect(session ? "/app" : "/login");
}

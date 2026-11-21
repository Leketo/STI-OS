import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * The root is the front door of the real system. Someone with a session lands on their board;
 * everyone else lands on the login screen. The old public prototype was removed in corte 3B (N-53).
 */
export default async function Root() {
  const session = (await cookies()).get("STI_SESSION");
  redirect(session ? "/app" : "/login");
}

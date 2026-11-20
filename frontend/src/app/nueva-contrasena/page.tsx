import type { Metadata } from "next";
import { NewPassword } from "./new-password";

/**
 * Where the recovery link lands. The token travels after the # of the address, so it never reaches a server log.
 * This page loads nothing from outside and sends no referrer (rule 4); the same policy is also set as a header in
 * next.config.ts, so it holds even before the page's own markup is read.
 */
export const metadata: Metadata = {
  title: "Contraseña nueva · STI-OS",
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

export default function NewPasswordPage() {
  return <NewPassword />;
}

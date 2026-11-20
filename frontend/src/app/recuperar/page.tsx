import type { Metadata } from "next";
import { RecoverForm } from "./recover-form";

export const metadata: Metadata = { title: "Recuperar acceso · STI-OS" };

/** Rule 12, boceto 1.6: asking for the link that lets a person choose a new password. No session needed. */
export default function RecoverPage() {
  return <RecoverForm />;
}

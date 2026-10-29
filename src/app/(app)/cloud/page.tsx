"use client";

import { redirect } from "next/navigation";

/** Les anciens modules sont regroupés dans l'interface Chat/Codex. */
export default function LegacyModuleRedirect() {
  redirect("/ai");
}

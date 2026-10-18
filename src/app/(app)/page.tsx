import { redirect } from "next/navigation";

/**
 * BCX uses one unified ChatGPT-style interface as its home screen.
 * The legacy VS Code workspace is no longer the default experience.
 * The editor can remain available as a separate feature without replacing the AI chat.
 */
export default function HomePage() {
  redirect("/ai");
}

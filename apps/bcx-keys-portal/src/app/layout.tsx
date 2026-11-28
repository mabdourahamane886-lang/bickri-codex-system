import type { ReactNode } from "react";
export const metadata = { title: "BCX Developer Portal", description: "Gestion sécurisée des clés API BICKRI CODEX SYSTEM" };
export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="fr"><body style={{ margin: 0, color: "#eef4ff", background: "#0b1220", fontFamily: "Arial, sans-serif" }}>{children}</body></html>;
}

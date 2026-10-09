import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "BICKRI CODEX SYSTEM", description: "Registre officiel des identifiants BICKRI CODEX" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="fr"><body>{children}</body></html>; }

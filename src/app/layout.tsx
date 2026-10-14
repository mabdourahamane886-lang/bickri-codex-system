import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { SessionProvider } from "@/components/providers/SessionProvider";
import { ToastProvider } from "@/components/ui/Toast";
import { themeScript } from "@/components/providers/ThemeToggle";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "BICKRI CODEX SYSTEM", template: "%s · BCX" },
  description: "Registre officiel des identifiants BICKRI CODEX, studio de code et assistant de programmation Bickri Code AI.",
  applicationName: "BICKRI CODEX SYSTEM",
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = {
  themeColor: [{ media: "(prefers-color-scheme: dark)", color: "#0a0d13" }, { media: "(prefers-color-scheme: light)", color: "#f6f7f9" }],
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr" data-theme="dark" className={`${GeistSans.variable} ${GeistMono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <SessionProvider>
          <ToastProvider>{children}</ToastProvider>
        </SessionProvider>
      </body>
    </html>
  );
}

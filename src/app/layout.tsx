import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { SessionProvider } from "@/components/providers/SessionProvider";
import { ToastProvider } from "@/components/ui/Toast";
import { themeScript } from "@/components/providers/ThemeToggle";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://bickri-codex-system.vercel.app"),
  title: { default: "BICKRI CODEX SYSTEM (BCX) — Studio de code & IA", template: "%s · BCX" },
  description: "BICKRI CODEX SYSTEM : environnement de développement, assistant IA Bickri Code AI, outils de programmation et registre officiel des identifiants BCX.",
  applicationName: "BICKRI CODEX SYSTEM",
  keywords: ["BICKRI CODEX SYSTEM", "BCX", "Bickri Code AI", "assistant IA", "programmation", "IDE en ligne", "développement logiciel", "TypeScript", "Next.js", "GitHub"],
  category: "technology",
  creator: "Bickri Service Agency",
  publisher: "Bickri Service Agency",
  referrer: "strict-origin-when-cross-origin",
  alternates: { canonical: "/" },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 } },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "BICKRI CODEX SYSTEM",
    title: "BICKRI CODEX SYSTEM (BCX) — Studio de code & IA",
    description: "Code, conçois et développe avec Bickri Code AI, l’assistant IA de BCX.",
    locale: "fr_FR",
  },
  twitter: {
    card: "summary_large_image",
    title: "BICKRI CODEX SYSTEM (BCX)",
    description: "Studio de développement et assistant IA Bickri Code AI.",
  },
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

"use client";

import { useEffect, useState } from "react";
import { Download } from "lucide-react";

interface InstallPrompt extends Event {
  prompt(): Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function InstallApp() {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [installed, setInstalled] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    const display = window.matchMedia("(display-mode: standalone)");
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPrompt);
    };
    const onInstalled = () => {
      setInstalled(true);
      setPrompt(null);
      setShowHelp(false);
    };
    setInstalled(display.matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed) return <p className="muted">BCX est déjà ouvert comme application.</p>;

  async function install() {
    if (!prompt) {
      setShowHelp((visible) => !visible);
      return;
    }
    setPrompt(null);
    try {
      const result = await prompt.prompt();
      if (result.outcome === "accepted") setInstalled(true);
    } catch {
      setShowHelp(true);
    }
  }

  return (
    <div className="bcx-install">
      <button type="button" className="btn btn-primary" aria-expanded={showHelp} onClick={() => void install()}>
        <Download size={17} /> Installer BCX
      </button>
      {showHelp && (
        <p className="bcx-install-help" role="status">
          Dans le menu du navigateur, choisis « Installer l’application ». Sur iPhone ou iPad, ouvre Safari, puis touche Partager et « Sur l’écran d’accueil ».
        </p>
      )}
    </div>
  );
}

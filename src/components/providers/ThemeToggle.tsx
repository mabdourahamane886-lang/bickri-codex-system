"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

export const THEME_KEY = "bcx_theme";

/** Script exécuté avant le rendu pour éviter un flash de thème. */
export const themeScript = `(function(){try{var t=localStorage.getItem("${THEME_KEY}");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t;}catch(e){}})();`;

export function ThemeToggle({ className = "btn btn-ghost btn-icon" }: { className?: string }) {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  useEffect(() => {
    setTheme(document.documentElement.dataset.theme === "light" ? "light" : "dark");
  }, []);
  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem(THEME_KEY, next); } catch { /* ignoré */ }
    setTheme(next);
  }
  return (
    <button type="button" className={className} onClick={toggle} aria-label={theme === "dark" ? "Passer au thème clair" : "Passer au thème sombre"} title="Changer de thème">
      {theme === "dark" ? <Sun /> : <Moon />}
    </button>
  );
}

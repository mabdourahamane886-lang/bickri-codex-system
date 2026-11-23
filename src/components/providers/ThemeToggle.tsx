"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

import { setThemePreference, THEME_EVENT } from "./theme";

export function ThemeToggle({ className = "btn btn-ghost btn-icon" }: { className?: string }) {
  const [theme, setTheme] = useState<"dark" | "light">("light");

  useEffect(() => {
    const update = () => setTheme(document.documentElement.dataset.theme === "dark" ? "dark" : "light");
    update();
    window.addEventListener(THEME_EVENT, update);
    return () => window.removeEventListener(THEME_EVENT, update);
  }, []);

  function toggle() {
    setThemePreference(theme === "dark" ? "light" : "dark");
  }

  return (
    <button
      type="button"
      className={className}
      onClick={toggle}
      aria-label={theme === "dark" ? "Passer au thème clair" : "Passer au thème sombre"}
      title={theme === "dark" ? "Thème sombre — passer au clair" : "Thème clair — passer au sombre"}
    >
      {theme === "dark" ? <Sun /> : <Moon />}
    </button>
  );
}

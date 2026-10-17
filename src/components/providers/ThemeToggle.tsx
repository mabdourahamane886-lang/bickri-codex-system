"use client";

import { useEffect, useState } from "react";
import { Moon, Sun, Palette, Check } from "lucide-react";

export const THEME_KEY = "bcx_theme";
export const ACCENT_KEY = "bcx_accent";

const ACCENTS = [
  { name: "Cyan", value: "#5ad8e6" },
  { name: "Bleu", value: "#5b8cff" },
  { name: "Violet", value: "#a78bfa" },
  { name: "Vert", value: "#4fd09a" },
  { name: "Orange", value: "#fb923c" },
  { name: "Rose", value: "#f472b6" },
  { name: "Or", value: "#e2bf6d" },
];

export function applyAccent(value: string) {
  const accent = ACCENTS.find((item) => item.value === value)?.value ?? ACCENTS[0].value;
  const root = document.documentElement;
  root.style.setProperty("--accent", accent);
  root.style.setProperty("--accent-hover", `color-mix(in srgb, ${accent} 78%, white)`);
  root.style.setProperty("--accent-fg", "#071018");
  root.style.setProperty("--accent-soft", `color-mix(in srgb, ${accent} 11%, transparent)`);
  root.style.setProperty("--accent-ring", `color-mix(in srgb, ${accent} 36%, transparent)`);
  try { localStorage.setItem(ACCENT_KEY, accent); } catch { /* ignoré */ }
}

/** Script exécuté avant le rendu pour éviter un flash de thème ou de couleur. */
export const themeScript = `(function(){try{var t=localStorage.getItem("${THEME_KEY}");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t;var a=localStorage.getItem("${ACCENT_KEY}");var allowed=["#5ad8e6","#5b8cff","#a78bfa","#4fd09a","#fb923c","#f472b6","#e2bf6d"];if(allowed.indexOf(a)>=0){var r=document.documentElement;r.style.setProperty("--accent",a);r.style.setProperty("--accent-hover","color-mix(in srgb, "+a+" 78%, white)");r.style.setProperty("--accent-fg","#071018");r.style.setProperty("--accent-soft","color-mix(in srgb, "+a+" 11%, transparent)");r.style.setProperty("--accent-ring","color-mix(in srgb, "+a+" 36%, transparent)");}}catch(e){}})();`;

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

export function AccentColorPicker({ compact = false }: { compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(ACCENTS[0].value);
  useEffect(() => {
    const saved = localStorage.getItem(ACCENT_KEY);
    if (saved && ACCENTS.some((item) => item.value === saved)) setSelected(saved);
  }, []);
  function choose(value: string) {
    applyAccent(value);
    setSelected(value);
    setOpen(false);
  }
  return (
    <div className="bcx-accent-picker" style={{ position: "relative", display: "inline-flex" }}>
      <button type="button" className={compact ? "btn btn-ghost btn-icon" : "btn btn-ghost"} onClick={() => setOpen((value) => !value)} aria-label="Choisir la couleur de l’interface" aria-expanded={open} title="Couleurs de l’interface">
        <Palette size={17} />{!compact && <span>Couleurs</span>}
      </button>
      {open && (
        <div role="dialog" aria-label="Couleurs de l’interface" className="card" style={{ position: "absolute", top: "calc(100% + 8px)", right: 0, zIndex: 120, width: 224, padding: 12, boxShadow: "var(--shadow-lg)", display: "grid", gap: 8 }}>
          <strong style={{ fontSize: 13 }}>Couleur d’accentuation</strong>
          {ACCENTS.map((item) => (
            <button key={item.value} type="button" onClick={() => choose(item.value)} aria-pressed={selected === item.value} className="btn btn-ghost" style={{ justifyContent: "flex-start", width: "100%", gap: 10, borderColor: selected === item.value ? "var(--accent)" : "transparent" }}>
              <span aria-hidden="true" style={{ width: 16, height: 16, borderRadius: "50%", background: item.value, border: "1px solid #ffffff55", display: "inline-block" }} />
              <span style={{ flex: 1, textAlign: "left" }}>{item.name}</span>
              {selected === item.value && <Check size={15} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

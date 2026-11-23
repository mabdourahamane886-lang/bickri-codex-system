export const THEME_KEY = "bcx_theme_v2";
export const THEME_EVENT = "bcx:theme";
export const SYSTEM_THEME_QUERY = "(prefers-color-scheme: dark)";
export type ThemePreference = "light" | "dark" | "system";

export function setThemePreference(preference: ThemePreference) {
  document.documentElement.dataset.themePreference = preference;
  document.documentElement.dataset.theme = preference === "system"
    ? (window.matchMedia(SYSTEM_THEME_QUERY).matches ? "dark" : "light")
    : preference;
  try { localStorage.setItem(THEME_KEY, preference); } catch { /* stockage indisponible */ }
  window.dispatchEvent(new Event(THEME_EVENT));
}

export const themeScript = `(function(){
  var preference = "light";
  try {
    var saved = localStorage.getItem("${THEME_KEY}");
    if (saved === "light" || saved === "dark" || saved === "system") preference = saved;
  } catch (e) {}
  var root = document.documentElement;
  var system = window.matchMedia("${SYSTEM_THEME_QUERY}");
  root.dataset.themePreference = preference;
  root.dataset.theme = preference === "system" ? (system.matches ? "dark" : "light") : preference;
  system.addEventListener("change", function(event) {
    if (root.dataset.themePreference === "system") {
      root.dataset.theme = event.matches ? "dark" : "light";
      window.dispatchEvent(new Event("${THEME_EVENT}"));
    }
  });
})();`;

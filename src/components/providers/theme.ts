export const THEME_KEY = "bcx_theme_v2";

/** Le thème clair est le choix initial ; un choix explicite de l'utilisateur est conservé. */
export const themeScript = `(function(){try{var t=localStorage.getItem("${THEME_KEY}");document.documentElement.dataset.theme=(t==="dark"||t==="light")?t:"light";}catch(e){document.documentElement.dataset.theme="light";}})();`;

"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowUpRight, Brain, Database, LogIn, LogOut, Monitor, Plug, Trash2, UserRound } from "lucide-react";
import { InstallApp } from "@/components/shell/InstallApp";
import { Badge } from "@/components/ui/Badge";
import { useSession } from "@/components/providers/SessionProvider";
import { setThemePreference, THEME_EVENT, type ThemePreference } from "@/components/providers/theme";
import { useToast } from "@/components/ui/Toast";
import { useConfig } from "@/hooks/useConfig";

const sections = [
  { id: "general", title: "Général", icon: Monitor },
  { id: "personalisation", title: "Personnalisation", icon: Brain },
  { id: "donnees", title: "Données", icon: Database },
  { id: "integrations", title: "Intégrations", icon: Plug },
  { id: "compte", title: "Compte", icon: UserRound },
] as const;

type Section = typeof sections[number];

function SettingRow({ title, detail, children }: { title: string; detail?: string; children: ReactNode }) {
  return (
    <div className="bcx-setting-row">
      <div><h3>{title}</h3>{detail && <p>{detail}</p>}</div>
      {children}
    </div>
  );
}

export default function SettingsPage() {
  const [section, setSection] = useState<Section>(sections[0]);
  const [theme, setTheme] = useState<ThemePreference>("light");
  const { config, error } = useConfig();
  const { user, loading, configured, signOut } = useSession();
  const { notify } = useToast();

  useEffect(() => {
    const update = () => {
      const preference = document.documentElement.dataset.themePreference;
      setTheme(preference === "dark" || preference === "system" ? preference : "light");
    };
    update();
    window.addEventListener(THEME_EVENT, update);
    return () => window.removeEventListener(THEME_EVENT, update);
  }, []);

  function clearProject() {
    if (!window.confirm("Effacer définitivement le projet Codex Studio sur cet appareil ?")) return;
    try {
      localStorage.removeItem("bcx_studio_workspace_v1");
      notify("Projet local effacé.", "success");
    } catch {
      notify("Le navigateur n’a pas permis de supprimer le projet.", "error");
    }
  }

  return (
    <main className="content bcx-preferences">
      <h1>Paramètres</h1>
      <div className="bcx-preferences-layout">
        <nav className="bcx-preferences-nav" aria-label="Rubriques des paramètres">
          {sections.map((entry) => (
            <button key={entry.id} type="button" aria-pressed={section.id === entry.id} aria-controls="bcx-preferences-panel" onClick={() => setSection(entry)}>
              <entry.icon size={18} aria-hidden="true" /> {entry.title}
            </button>
          ))}
        </nav>
        <section className="bcx-preferences-panel" id="bcx-preferences-panel" aria-labelledby="bcx-preferences-title">
          <h2 id="bcx-preferences-title">{section.title}</h2>
          {section.id === "general" && <>
            <SettingRow title="Apparence" detail="Choisis le thème utilisé sur cet appareil.">
              <select className="select" aria-label="Thème de BCX" value={theme} onChange={(event) => setThemePreference(event.target.value as ThemePreference)}>
                <option value="light">Clair</option>
                <option value="dark">Sombre</option>
                <option value="system">Système</option>
              </select>
            </SettingRow>
            <SettingRow title="Application BCX" detail="Ajoute BCX à ton écran d’accueil ou à ton ordinateur."><InstallApp /></SettingRow>
          </>}
          {section.id === "personalisation" && (
            <SettingRow title="Mémoire de Bickri AI" detail="Consulte, modifie ou supprime les informations mémorisées.">
              <Link className="btn" href={configured && !loading && !user ? "/login" : "/ai/memories"}>
                {configured && !loading && !user ? "Se connecter" : "Gérer la mémoire"} <ArrowUpRight size={16} />
              </Link>
            </SettingRow>
          )}
          {section.id === "donnees" && <>
            <SettingRow title="Conversations" detail="Retrouve tes chats et leurs archives. Chaque conversation peut être exportée depuis le menu de saisie.">
              <Link className="btn" href="/ai">Ouvrir le chat <ArrowUpRight size={16} /></Link>
            </SettingRow>
            <SettingRow title="Projet Codex Studio" detail="Supprime la copie du projet enregistrée dans ce navigateur.">
              <button type="button" className="btn btn-danger" onClick={clearProject}><Trash2 size={16} /> Effacer le projet</button>
            </SettingRow>
          </>}
          {section.id === "integrations" && <>
            <SettingRow title="Plugins" detail="Explore GitHub et les intégrations disponibles dans BCX.">
              <Link className="btn" href="/plugins">Ouvrir le catalogue <ArrowUpRight size={16} /></Link>
            </SettingRow>
            {error && <p role="status" className="muted">Impossible de vérifier l’état des services.</p>}
            {config && <>
              <SettingRow title="Assistant IA"><Badge tone={config.ai ? "success" : "neutral"}>{config.ai ? "Configuré" : "À configurer"}</Badge></SettingRow>
              <SettingRow title="GitHub MCP"><Badge tone={config.githubMcp ? "success" : "neutral"}>{config.githubMcp ? "Configuré" : "À configurer"}</Badge></SettingRow>
            </>}
          </>}
          {section.id === "compte" && (
            <SettingRow title={loading ? "Chargement du compte…" : user?.email ?? "Session BCX"} detail={loading ? undefined : user ? "Compte connecté" : configured ? "Connecte-toi pour retrouver ta mémoire et ton historique synchronisé." : "BCX fonctionne en mode local sur cet appareil."}>
              {!loading && (user
                ? <button type="button" className="btn" onClick={() => void signOut()}><LogOut size={16} /> Se déconnecter</button>
                : configured && <Link className="btn btn-primary" href="/login"><LogIn size={16} /> Se connecter</Link>)}
            </SettingRow>
          )}
        </section>
      </div>
    </main>
  );
}

"use client";

import { ArrowLeft, CircleAlert, CircleCheck, CircleDashed, HardDrive, LogIn, LogOut, Settings2, Trash2 } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { ThemeToggle } from "@/components/providers/ThemeToggle";
import { useSession } from "@/components/providers/SessionProvider";
import { useToast } from "@/components/ui/Toast";
import { useConfig } from "@/hooks/useConfig";

const LOCAL_KEYS = [
  { key: "bcx_registry_v1", label: "Registre local" },
  { key: "bcx_studio_workspace_v1", label: "Projet du studio" },
];

export default function SettingsPage() {
  const { config, error } = useConfig();
  const { user, configured, signOut } = useSession();
  const { notify } = useToast();

  const rows = [
    { name: "Supabase (authentification et registre)", vars: "NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", ok: config?.supabase, required: true },
    { name: "Bickri Code AI (Gemini)", vars: "GEMINI_API_KEY, GEMINI_MODEL, GEMINI_FALLBACK_MODEL", ok: config?.ai, required: true },
    { name: "Studio d’images IA", vars: "GEMINI_API_KEY, GEMINI_IMAGE_MODEL (optionnel)", ok: config?.imageGeneration, required: false },
    { name: "GitHub MCP (contexte de dépôt)", vars: "GITHUB_MCP_URL, GITHUB_MCP_BEARER_TOKEN", ok: config?.githubMcp, required: false },
  ];

  function clearLocal(key: string, label: string) {
    if (!window.confirm(`Effacer « ${label} » de cet appareil ? Cette action est définitive.`)) return;
    localStorage.removeItem(key);
    notify(`${label} effacé. Recharge la page pour repartir de zéro.`, "success");
  }

  return (
    <main className="content" style={{ maxWidth: 960 }}>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap" }}>
        <Link href="/ai" className="btn btn-ghost"><ArrowLeft size={17} /> Retour au chat</Link>
        <span className="settings-page-mark" aria-hidden="true"><Settings2 size={18} /></span>
      </div>
      <PageHeader title="Paramètres" description="Gère la configuration, ton compte, l’apparence et les données locales de BCX depuis cette page dédiée." />

      <div className="stack" style={{ gap: 20 }}>
        <section className="card" aria-labelledby="cfg-title">
          <div className="card-head"><div><h2 id="cfg-title">Configuration du serveur</h2><p>Variables d&apos;environnement à définir dans Vercel. Les valeurs ne sont jamais affichées.</p></div></div>
          {error && <div className="card-body"><div className="alert alert-danger"><CircleAlert /><span>Impossible de lire l&apos;état du serveur.</span></div></div>}
          <div>
            {rows.map((r) => (
              <div className="check-row" key={r.name}>
                <span className="status-icon">{r.ok === undefined ? <CircleDashed /> : r.ok ? <CircleCheck style={{ color: "var(--success)" }} /> : <CircleAlert style={{ color: r.required ? "var(--warning)" : "var(--text-faint)" }} />}</span>
                <div style={{ minWidth: 0 }}><b>{r.name}</b><code style={{ overflowWrap: "anywhere" }}>{r.vars}</code></div>
                <Badge tone={r.ok === undefined ? "neutral" : r.ok ? "success" : r.required ? "warning" : "neutral"}>{r.ok === undefined ? "…" : r.ok ? "Configuré" : r.required ? "Manquant" : "Optionnel"}</Badge>
              </div>
            ))}
          </div>
          <div className="card-foot"><span>Après une modification dans Vercel, redéploie le projet.</span>{config && <span className="mono">{config.aiModel}</span>}</div>
        </section>

        <section className="card" aria-labelledby="acc-title">
          <div className="card-head"><div><h2 id="acc-title">Compte</h2><p>{configured ? "Connexion par e-mail et mot de passe via Supabase." : "Supabase n'est pas configuré : l'application fonctionne en mode local."}</p></div></div>
          <div className="card-body row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
            <div><b style={{ fontWeight: 500 }}>{user?.email ?? "Non connecté"}</b><p className="faint" style={{ fontSize: "var(--text-xs)" }}>{user ? "Rôle par défaut : lecteur. Les rôles élevés sont attribués par un administrateur." : "Connecte-toi pour utiliser le registre partagé."}</p></div>
            {user ? <button className="btn" onClick={signOut}><LogOut /> Se déconnecter</button> : <Link className="btn btn-primary" href="/login"><LogIn /> Se connecter</Link>}
          </div>
        </section>

        <section className="card" aria-labelledby="app-title">
          <div className="card-head"><div><h2 id="app-title">Apparence</h2><p>Thème sombre ou clair, mémorisé sur cet appareil.</p></div><ThemeToggle className="btn btn-icon" /></div>
        </section>

        <section className="card" aria-labelledby="data-title">
          <div className="card-head"><div><h2 id="data-title">Données locales</h2><p>Stockées uniquement dans ce navigateur.</p></div></div>
          {LOCAL_KEYS.map((k) => (
            <div className="check-row" key={k.key}>
              <span className="status-icon"><HardDrive /></span>
              <div><b>{k.label}</b><code>{k.key}</code></div>
              <button className="btn btn-sm btn-danger" onClick={() => clearLocal(k.key, k.label)}><Trash2 /> Effacer</button>
            </div>
          ))}
        </section>
      </div>
    </main>
  );
}

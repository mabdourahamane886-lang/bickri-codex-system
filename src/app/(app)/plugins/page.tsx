"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, CircleAlert, CircleDashed, Cloud, Fingerprint, Github, Globe, HardDrive, Plug, RefreshCw, Search, Share2, SlidersHorizontal } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/Badge";

type PluginStatus = { id: string; name: string; description: string; available: boolean; reason?: string; tools: number; writeTools: number };
const PLUGINS_KEY = "bcx_ai_plugins_v1";
const CATEGORIES: Record<string, string> = { github: "Développement", registry: "Outils BCX", web: "Recherche web", deployments: "Déploiement", social: "Réseaux sociaux", "google-drive": "Productivité", notion: "Productivité" };

function PluginLogo({ id }: { id: string }) {
  if (id === "google-drive") {
    return <span className="plugin-brand-logo" style={{ background: "#fff" }} aria-label="Logo Google Drive">
      <svg viewBox="0 0 48 42" width="29" height="26" role="img" aria-hidden="true">
        <path fill="#00832d" d="M15.7 1.8h12.1L11.9 29.3H0z" />
        <path fill="#0066da" d="M15.7 1.8h12.1L44 29.3H31.8z" />
        <path fill="#ffba00" d="M0 29.3h31.8l-6.1 10.5H6.1z" />
        <path fill="#2684fc" d="M31.8 29.3H44l-6.1 10.5H25.7z" />
        <path fill="#00ac47" d="M0 29.3l6.1 10.5h13.1l-6.1-10.5z" />
      </svg>
    </span>;
  }
  if (id === "notion") {
    return <span className="plugin-brand-logo notion-logo" aria-label="Logo Notion">N</span>;
  }
  const common = { size: 25, strokeWidth: 1.8 };
  if (id === "github") return <span className="plugin-brand-logo github-logo"><Github {...common} /></span>;
  if (id === "deployments") return <span className="plugin-brand-logo"><Cloud {...common} /></span>;
  if (id === "registry") return <span className="plugin-brand-logo"><Fingerprint {...common} /></span>;
  if (id === "web") return <span className="plugin-brand-logo"><Globe {...common} /></span>;
  if (id === "social") return <span className="plugin-brand-logo"><Share2 {...common} /></span>;
  return <span className="plugin-brand-logo"><Plug {...common} /></span>;
}

export default function PluginsPage() {
  const [plugins, setPlugins] = useState<PluginStatus[] | null>(null);
  const [enabled, setEnabled] = useState<string[]>(["github", "registry", "web"]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "available">("all");

  const loadPlugins = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/ai/agent", { cache: "no-store" });
      if (!response.ok) throw new Error("Impossible de récupérer la liste des plugins.");
      const data = await response.json();
      setPlugins(Array.isArray(data.plugins) ? data.plugins : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de chargement des plugins.");
      setPlugins([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(PLUGINS_KEY) || "null");
      if (Array.isArray(saved)) setEnabled(saved);
    } catch { /* ignore invalid local settings */ }
    void loadPlugins();
  }, [loadPlugins]);

  useEffect(() => {
    try { localStorage.setItem(PLUGINS_KEY, JSON.stringify(enabled)); } catch { /* storage unavailable */ }
  }, [enabled]);

  function toggle(id: string) {
    setEnabled((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  const availableCount = (plugins ?? []).filter((plugin) => plugin.available).length;
  const activeCount = (plugins ?? []).filter((plugin) => plugin.available && enabled.includes(plugin.id)).length;
  const filteredPlugins = (plugins ?? []).filter((plugin) => {
    const matchesQuery = `${plugin.name} ${plugin.description} ${CATEGORIES[plugin.id] ?? ""}`.toLowerCase().includes(query.trim().toLowerCase());
    const isActive = plugin.available && enabled.includes(plugin.id);
    const matchesFilter = filter === "all" || (filter === "active" ? isActive : plugin.available);
    return matchesQuery && matchesFilter;
  });


  return (
    <main className="content" style={{ maxWidth: 1120 }}>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap" }}>
        <Link href="/ai" className="btn btn-ghost"><ArrowLeft size={17} /> Retour au chat</Link>
        <button className="btn btn-ghost" onClick={() => void loadPlugins()} disabled={loading}><RefreshCw size={16} className={loading ? "spin" : ""} /> Actualiser</button>
      </div>
      <PageHeader title="Plugins" description="Connecte tes outils à Bickri AI. Active les intégrations que tu souhaites utiliser dans le chat." />
      <section className="card" style={{ marginBottom: 20 }}>
        <div className="card-body row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div><b>{activeCount} plugin(s) actif(s)</b><p className="muted" style={{ marginTop: 4 }}>Disponibles : {availableCount} sur {plugins?.length ?? 0}</p></div>
          <Badge tone={activeCount ? "success" : "neutral"}>{activeCount ? "Prêts pour le chat" : "Aucun plugin actif"}</Badge>
        </div>
      </section>
      {error && <div className="alert alert-danger"><CircleAlert /><span>{error}</span></div>}
      {loading && !plugins && <div className="card card-body row"><CircleDashed className="spin" /><span>Chargement des plugins…</span></div>}
      {plugins?.length === 0 && !loading && !error && <div className="card card-body">Aucun plugin n’est actuellement fourni par le serveur.</div>}
      <section className="card" style={{ marginBottom: 22 }}>
        <div className="card-body" style={{ display: "grid", gap: 12 }}>
          <div className="row" style={{ gap: 8 }}><Search size={17} aria-hidden="true" /><input className="input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher un plugin…" aria-label="Rechercher un plugin" /></div>
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }} aria-label="Filtrer les plugins">
            <SlidersHorizontal size={16} aria-hidden="true" />
            {([{ id: "all", label: "Tous" }, { id: "active", label: "Actifs" }, { id: "available", label: "Disponibles" }] as const).map((item) => <button key={item.id} type="button" className={filter === item.id ? "btn btn-primary btn-sm" : "btn btn-sm"} onClick={() => setFilter(item.id)} aria-pressed={filter === item.id}>{item.label}</button>)}
            <span className="muted" style={{ marginLeft: "auto", fontSize: 12 }}>{filteredPlugins.length} résultat(s)</span>
          </div>
        </div>
      </section>

      <div className="plugin-grid">
        {filteredPlugins.map((plugin) => {
          const isOn = enabled.includes(plugin.id) && plugin.available;
          return (
            <article className="card plugin-card" key={plugin.id}>
              <div className="card-body plugin-card-body">
                <div className="plugin-card-top">
                  <PluginLogo id={plugin.id} />
                  <Badge tone={plugin.available ? "success" : "neutral"}>{plugin.available ? "Disponible" : "Configuration requise"}</Badge>
                </div>
                <h2 className="plugin-card-title">{plugin.name}</h2>
                <p className="plugin-card-description">{plugin.available ? plugin.description : (plugin.reason || "Ce plugin n’est pas configuré sur le serveur.")}</p>
                <p className="muted plugin-card-category">{CATEGORIES[plugin.id] ?? "Intégration"} · {plugin.tools} outil(s)</p>
                <div className="plugin-card-footer">
                  <span className={isOn ? "plugin-state is-on" : "plugin-state"}>{isOn ? <><Check size={14} /> Activé</> : plugin.available ? "Désactivé" : "Indisponible"}</span>
                  <button type="button" role="switch" aria-checked={isOn} aria-label={`Activer le plugin ${plugin.name}`} className="switch" disabled={!plugin.available} onClick={() => toggle(plugin.id)}><i /></button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
      {filteredPlugins.length === 0 && !loading && <div className="card card-body" style={{ marginTop: 12 }}><p>Aucun plugin ne correspond à cette recherche ou à ce filtre.</p><button className="btn btn-ghost btn-sm" style={{ marginTop: 10, justifySelf: "start" }} onClick={() => { setQuery(""); setFilter("all"); }}>Effacer les filtres</button></div>}

      <p className="muted" style={{ marginTop: 20, fontSize: 13 }}>Les préférences sont enregistrées sur cet appareil et partagées avec le chat BCX. Les actions sensibles conservent leurs contrôles de sécurité.</p>
    </main>
  );
}

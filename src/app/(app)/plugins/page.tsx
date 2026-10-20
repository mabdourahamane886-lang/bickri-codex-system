"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CircleAlert, CircleDashed, Fingerprint, GitBranch, Globe, Plug, RefreshCw, Search, Sparkles, SlidersHorizontal } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/Badge";

type PluginStatus = { id: string; name: string; description: string; available: boolean; reason?: string; tools: number; writeTools: number };
const PLUGINS_KEY = "bcx_ai_plugins_v1";
const ICONS: Record<string, typeof GitBranch> = { github: GitBranch, registry: Fingerprint, web: Globe, deployments: Globe, social: Globe };
const CATEGORIES: Record<string, string> = { github: "Développement", deployments: "Déploiement", registry: "Outils BCX", web: "Recherche", social: "Réseaux sociaux", "google-drive": "Productivité", notion: "Productivité" };
const FUTURE_INTEGRATIONS = [
  { name: "Slack", category: "Communication", description: "Rechercher des messages et résumer des échanges." },
  { name: "Figma", category: "Design", description: "Consulter des fichiers de conception et leurs détails." },
  { name: "Discord", category: "Communication", description: "Rechercher des discussions et informations de communauté." },
  { name: "Google Calendar", category: "Productivité", description: "Consulter les événements et préparer les réunions." },
];

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
    <main className="content" style={{ maxWidth: 1000 }}>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap" }}>
        <Link href="/ai" className="btn btn-ghost"><ArrowLeft size={17} /> Retour au chat</Link>
        <button className="btn btn-ghost" onClick={() => void loadPlugins()} disabled={loading}><RefreshCw size={16} className={loading ? "spin" : ""} /> Actualiser</button>
      </div>
      <PageHeader title="Plugins" description="Connecte des outils à Bickri AI pour l’aider à rechercher, analyser et agir dans les services disponibles." />
      <section className="card" style={{ marginBottom: 20 }}>
        <div className="card-body row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
          <div><b>{activeCount} plugin(s) actif(s)</b><p className="muted" style={{ marginTop: 4 }}>Disponibles : {availableCount} sur {plugins?.length ?? 0}</p></div>
          <Badge tone={activeCount ? "success" : "neutral"}>{activeCount ? "Prêts pour le chat" : "Aucun plugin actif"}</Badge>
        </div>
      </section>
      {error && <div className="alert alert-danger"><CircleAlert /><span>{error}</span></div>}
      {loading && !plugins && <div className="card card-body row"><CircleDashed className="spin" /><span>Chargement des plugins…</span></div>}
      {plugins?.length === 0 && !loading && !error && <div className="card card-body">Aucun plugin n’est actuellement fourni par le serveur.</div>}
      <section className="card" style={{ marginBottom: 18 }}>
        <div className="card-body" style={{ display: "grid", gap: 12 }}>
          <div className="row" style={{ gap: 8 }}><Search size={17} aria-hidden="true" /><input className="input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher un plugin ou une intégration…" aria-label="Rechercher un plugin" /></div>
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }} aria-label="Filtrer les plugins">
            <SlidersHorizontal size={16} aria-hidden="true" />
            {([{ id: "all", label: "Tous" }, { id: "active", label: "Actifs" }, { id: "available", label: "Disponibles" }] as const).map((item) => <button key={item.id} type="button" className={filter === item.id ? "btn btn-primary btn-sm" : "btn btn-sm"} onClick={() => setFilter(item.id)} aria-pressed={filter === item.id}>{item.label}</button>)}
            <span className="muted" style={{ marginLeft: "auto", fontSize: 12 }}>{filteredPlugins.length} résultat(s)</span>
          </div>
        </div>
      </section>
      <div className="stack" style={{ gap: 12 }}>
        {filteredPlugins.map((plugin) => {
          const Icon = ICONS[plugin.id] ?? Plug;
          const isOn = enabled.includes(plugin.id) && plugin.available;
          return (
            <article className="card" key={plugin.id}>
              <div className="card-body row" style={{ alignItems: "flex-start", gap: 14 }}>
                <span className="plugin-icon" aria-hidden="true"><Icon size={22} /></span>
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
                    <h2 style={{ fontSize: "var(--text-md)", margin: 0 }}>{plugin.name}</h2>
                    <Badge tone={plugin.available ? "success" : "neutral"}>{plugin.available ? "Disponible" : "Indisponible"}</Badge>
                    {plugin.available && plugin.writeTools > 0 && <Badge tone="gold">Écriture validée</Badge>}
                  </div>
                  <p style={{ marginTop: 8 }}>{plugin.available ? plugin.description : (plugin.reason || "Ce plugin n’est pas configuré sur le serveur.")}</p>
                  <p className="muted" style={{ fontSize: 12, marginTop: 5 }}>Catégorie : {CATEGORIES[plugin.id] ?? "Intégration"}</p>
                  <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>{plugin.tools} outil(s) · {plugin.writeTools} action(s) d’écriture</p>
                </div>
                <button type="button" role="switch" aria-checked={isOn} aria-label={`Activer le plugin ${plugin.name}`} className="switch" disabled={!plugin.available} onClick={() => toggle(plugin.id)}><i /></button>
              </div>
            </article>
          );
        })}
        {filteredPlugins.length === 0 && !loading && <div className="card card-body"><p>Aucun plugin ne correspond à cette recherche ou à ce filtre.</p><button className="btn btn-ghost btn-sm" style={{ marginTop: 10, justifySelf: "start" }} onClick={() => { setQuery(""); setFilter("all"); }}>Effacer les filtres</button></div>}
      </div>
      <section style={{ marginTop: 30 }}>
        <div className="row" style={{ gap: 10, marginBottom: 12 }}><Sparkles size={19} aria-hidden="true" /><div><h2 style={{ fontSize: "var(--text-lg)" }}>Explorer d’autres intégrations</h2><p className="muted" style={{ marginTop: 4 }}>Pistes pour enrichir BCX. Elles ne sont pas encore connectées et ne peuvent pas être activées pour le moment.</p></div></div>
        <div className="stack" style={{ gap: 10 }}>
          {FUTURE_INTEGRATIONS.filter((item) => `${item.name} ${item.category} ${item.description}`.toLowerCase().includes(query.trim().toLowerCase())).map((item) => <article className="card" key={item.name}><div className="card-body row" style={{ alignItems: "flex-start", gap: 12 }}><span className="plugin-icon" aria-hidden="true"><Plug size={20} /></span><div className="grow" style={{ minWidth: 0 }}><div className="row" style={{ gap: 8, flexWrap: "wrap" }}><h3 style={{ fontSize: "var(--text-md)" }}>{item.name}</h3><Badge tone="neutral">À intégrer</Badge></div><p style={{ marginTop: 6 }}>{item.description}</p><p className="muted" style={{ fontSize: 12, marginTop: 6 }}>Catégorie : {item.category}</p></div></div></article>)}
        </div>
      </section>
      <p className="muted" style={{ marginTop: 20, fontSize: 13 }}>Les préférences sont enregistrées sur cet appareil et partagées avec le chat BCX. Les actions d’écriture sensibles continuent de demander une validation lorsqu’elle est nécessaire.</p>
    </main>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CircleAlert, CircleCheck, CircleDashed, Fingerprint, GitBranch, Globe, Plug, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/Badge";

type PluginStatus = { id: string; name: string; description: string; available: boolean; reason?: string; tools: number; writeTools: number };
const PLUGINS_KEY = "bcx_ai_plugins_v1";
const ICONS: Record<string, typeof GitBranch> = { github: GitBranch, registry: Fingerprint, web: Globe };

export default function PluginsPage() {
  const [plugins, setPlugins] = useState<PluginStatus[] | null>(null);
  const [enabled, setEnabled] = useState<string[]>(["github", "registry", "web"]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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
      <div className="stack" style={{ gap: 12 }}>
        {(plugins ?? []).map((plugin) => {
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
                  <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>{plugin.tools} outil(s) · {plugin.writeTools} action(s) d’écriture</p>
                </div>
                <button type="button" role="switch" aria-checked={isOn} aria-label={`Activer le plugin ${plugin.name}`} className="switch" disabled={!plugin.available} onClick={() => toggle(plugin.id)}><i /></button>
              </div>
            </article>
          );
        })}
      </div>
      <p className="muted" style={{ marginTop: 20, fontSize: 13 }}>Les préférences sont enregistrées sur cet appareil et partagées avec le chat BCX. Les actions d’écriture sensibles continuent de demander une validation lorsqu’elle est nécessaire.</p>
    </main>
  );
}

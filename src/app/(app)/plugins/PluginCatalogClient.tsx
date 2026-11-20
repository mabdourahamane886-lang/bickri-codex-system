"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight, CircleAlert, Plug, Search, ShieldCheck } from "lucide-react";
import type { PluginCatalogItem } from "@/lib/plugin-catalog";

type CatalogItem = PluginCatalogItem & { iconPath: string; iconColor: string };
type RuntimePlugin = { id: string; name: string; available: boolean; reason?: string; tools: number; writeTools: number };
type RuntimeState = { signedIn: boolean; plugins: RuntimePlugin[] };
type Filter = "all" | "integrated" | "planned";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "Tous" },
  { id: "integrated", label: "Connecteurs BCX" },
  { id: "planned", label: "À venir" },
];

export function PluginCatalogClient({ items }: { items: CatalogItem[] }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Tous");
  const [filter, setFilter] = useState<Filter>("all");
  const [runtime, setRuntime] = useState<RuntimeState | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusError, setStatusError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/ai/agent", { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Impossible de vérifier les connecteurs (HTTP ${response.status}).`);
        const data = await response.json() as RuntimeState;
        if (!Array.isArray(data.plugins) || typeof data.signedIn !== "boolean") {
          throw new Error("Le serveur a renvoyé un état de connecteurs invalide.");
        }
        setRuntime(data);
        setStatusError("");
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setStatusError(error instanceof Error ? error.message : "Impossible de vérifier les connecteurs.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  const categories = useMemo(() => ["Tous", ...Array.from(new Set(items.map((item) => item.category))).sort((a, b) => a.localeCompare(b, "fr"))], [items]);
  const integratedCount = useMemo(() => items.filter((item) => item.pluginId).length, [items]);
  const pluginCount = useMemo(() => new Set(items.flatMap((item) => item.pluginId ? [item.pluginId] : [])).size, [items]);
  const filteredItems = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("fr");
    return items.filter((item) => {
      if (filter === "integrated" && !item.pluginId) return false;
      if (filter === "planned" && item.pluginId) return false;
      if (category !== "Tous" && item.category !== category) return false;
      return !normalized || `${item.name} ${item.category} ${item.description}`.toLocaleLowerCase("fr").includes(normalized);
    });
  }, [category, filter, items, query]);
  const runtimePlugins = useMemo(() => new Map((runtime?.plugins ?? []).map((plugin) => [plugin.id, plugin])), [runtime]);

  function getStatus(item: CatalogItem) {
    if (!item.pluginId) return { text: "Bientôt", kind: "planned" as const };
    if (loading) return { text: "Vérification…", kind: "checking" as const };
    if (statusError) return { text: "État inconnu", kind: "unknown" as const };
    const plugin = runtimePlugins.get(item.pluginId);
    if (plugin?.available) return { text: "Connecteur prêt", kind: "ready" as const };
    if (!runtime?.signedIn) return { text: "Connexion requise", kind: "setup" as const };
    return { text: "Configuration requise", kind: "setup" as const };
  }

  return (
    <main className="content plugin-catalog-page">
      <Link href="/ai" className="plugin-back-link"><ArrowLeft size={16}/> Retour au chat</Link>

      <header className="plugin-catalog-header">
        <div>
          <div className="plugin-catalog-eyebrow"><Plug size={13}/> BCX CONNECT</div>
          <h1>Plugins et intégrations</h1>
          <p>Explore 100 services avec leurs logos de marque. Les connecteurs déjà présents dans BCX sont signalés; les autres sont prévus et ne sont pas encore activables.</p>
        </div>
        <div className="plugin-catalog-count" aria-label={`${items.length} services catalogués`}>
          <strong>{items.length}</strong><span>services</span>
        </div>
      </header>

      <div className="plugin-catalog-notice">
        <ShieldCheck size={17}/>
        <span>{integratedCount} services sont reliés à {pluginCount} connecteurs BCX. Leur disponibilité dépend de la connexion au compte et des identifiants configurés.</span>
      </div>

      {statusError && <div className="plugin-catalog-error" role="status"><CircleAlert size={16}/><span>{statusError}</span></div>}

      <section className="plugin-catalog-controls" aria-label="Filtres du catalogue">
        <label className="plugin-catalog-search">
          <Search size={16}/>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher un service…" aria-label="Rechercher un plugin"/>
        </label>
        <div className="plugin-catalog-filters" role="group" aria-label="Filtrer par disponibilité">
          {FILTERS.map((item) => (
            <button key={item.id} type="button" className={filter === item.id ? "is-selected" : ""} aria-pressed={filter === item.id} onClick={() => setFilter(item.id)}>
              {item.label}{item.id === "all" ? ` ${items.length}` : item.id === "integrated" ? ` ${integratedCount}` : ` ${items.length - integratedCount}`}
            </button>
          ))}
        </div>
      </section>

      <nav className="plugin-catalog-categories" aria-label="Catégories">
        {categories.map((item) => (
          <button key={item} type="button" className={category === item ? "is-selected" : ""} aria-pressed={category === item} onClick={() => setCategory(item)}>{item}</button>
        ))}
      </nav>

      <section className="plugin-catalog-grid" aria-live="polite" aria-label={`${filteredItems.length} plugins affichés`}>
        {filteredItems.map((item) => {
          const status = getStatus(item);
          const runtimePlugin = item.pluginId ? runtimePlugins.get(item.pluginId) : undefined;
          const destination = item.pluginId && runtime?.signedIn === false ? "/login" : "/ai";
          return (
            <article key={item.id} className="plugin-catalog-card">
              <div className="plugin-catalog-card-top">
                <span className="plugin-catalog-logo" style={{ backgroundColor: `#${item.iconColor}18` }}>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path fill={`#${item.iconColor}`} d={item.iconPath}/></svg>
                </span>
                <span className={`plugin-catalog-status is-${status.kind}`} title={runtimePlugin?.reason ?? undefined}>{status.text}</span>
              </div>
              <h2>{item.name}</h2>
              <span className="plugin-catalog-category">{item.category}</span>
              <p>{item.description}</p>
              {item.pluginId ? (
                <Link href={destination} className="plugin-catalog-action">
                  {destination === "/login" ? "Se connecter" : "Utiliser dans le chat"}<ArrowUpRight size={14}/>
                </Link>
              ) : (
                <span className="plugin-catalog-action is-disabled">Pas encore disponible</span>
              )}
            </article>
          );
        })}
        {filteredItems.length === 0 && <div className="plugin-catalog-empty">Aucun service ne correspond à cette recherche.</div>}
      </section>

      <footer className="plugin-catalog-footer">Logos de marque fournis par Simple Icons. Chaque marque reste la propriété de son détenteur.</footer>
    </main>
  );
}

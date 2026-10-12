"use client";

import { useEffect, useMemo, useState } from "react";
import { CATEGORIES, GREEK_LETTERS } from "@/lib/codex";
import { createClient } from "@/lib/supabase/client";

type Entry = { id: string; name: string; category: string; greek: string; version: string; status: "Actif" | "Brouillon"; createdAt: string };
const STORE = "bcx_registry_v1";
const starter: Entry[] = [
  { id: "BCX-AI-THETA-001", name: "Bickri AI", category: "AI", greek: "THETA", version: "1.0.0", status: "Actif", createdAt: "2026-10-09" },
  { id: "BCX-WEB-ZETA-001", name: "Bickri Service Agency", category: "WEB", greek: "ZETA", version: "1.0.0", status: "Actif", createdAt: "2026-10-09" },
];
const slug = (v: string) => v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "");

export default function Home() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [ready, setReady] = useState(false);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("AI");
  const [greek, setGreek] = useState("THETA");
  const [name, setName] = useState("");
  const [version, setVersion] = useState("1.0.0");
  const [filter, setFilter] = useState("Tous");
  const [notice, setNotice] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORE);
      const parsed: unknown = raw ? JSON.parse(raw) : starter;
      setEntries(Array.isArray(parsed) && parsed.every((item) => item && typeof item.id === "string" && typeof item.name === "string") ? parsed as Entry[] : starter);
    } catch { setEntries(starter); }
    setReady(true);
  }, []);
  useEffect(() => { if (ready) localStorage.setItem(STORE, JSON.stringify(entries)); }, [entries, ready]);

  const visible = useMemo(() => entries.filter(e => {
    const matches = (e.id + " " + e.name + " " + e.category + " " + e.greek).toLowerCase().includes(query.toLowerCase());
    return matches && (filter === "Tous" || e.status === filter);
  }), [entries, query, filter]);
  const nextId = useMemo(() => {
    const prefix = `BCX-${category}-${greek}-`;
    const max = entries.filter(e => e.id.startsWith(prefix)).reduce((n, e) => Math.max(n, Number(e.id.split("-").at(-1)) || 0), 0);
    return prefix + String(max + 1).padStart(3, "0");
  }, [entries, category, greek]);

  async function createEntry(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (creating) return;
    const cleanName = name.trim();
    const cleanVersion = version.trim() || "1.0.0";
    if (!cleanName) { setNotice("Ajoute un nom de projet pour continuer."); return; }
    if (!/^[0-9]+\\.[0-9]+\\.[0-9]+$/.test(cleanVersion)) {
      setNotice("Version invalide. Utilise le format X.Y.Z, par exemple 1.0.0.");
      return;
    }

    setCreating(true);
    setNotice("");
    try {
      // If Supabase is configured and the user is signed in, persist the identifier
      // centrally. The database unique constraints remain the final collision guard.
      let supabase: ReturnType<typeof createClient> | null = null;
      try { supabase = createClient(); } catch { /* Local-only mode when env vars are absent. */ }

      if (supabase) {
        const { data: authData, error: authError } = await supabase.auth.getUser();
        if (authError) throw new Error("Impossible de vérifier la session. Reconnecte-toi puis réessaie.");
        if (authData.user) {
          const { data: greekRow, error: greekError } = await supabase
            .from("bcx_greek_generations").select("id").eq("name", greek).eq("cycle", 1).maybeSingle();
          if (greekError) throw new Error("Impossible de lire les séries grecques Supabase. Vérifie que les migrations BCX ont été appliquées.");
          if (!greekRow) throw new Error("Série grecque introuvable dans Supabase. Applique les migrations BCX puis réessaie.");

          const { data: latestRows, error: latestError } = await supabase
            .from("bcx_products").select("serial_number")
            .eq("category_code", category).eq("greek_generation_id", greekRow.id)
            .order("serial_number", { ascending: false }).limit(1);
          if (latestError) throw new Error("Impossible de consulter le registre Supabase. Vérifie les permissions de ton compte.");
          let serial = Math.max(Number(latestRows?.[0]?.serial_number) || 0,
            ...entries.filter(item => item.category === category && item.greek === greek)
              .map(item => Number(item.id.split("-").at(-1)) || 0)) + 1;

          for (let attempt = 0; attempt < 3; attempt++, serial++) {
            const identifier = `BCX-${category}-${greek}-${String(serial).padStart(3, "0")}`;
            const { error: insertError } = await supabase.from("bcx_products").insert({
              identifier, name: cleanName, category_code: category, greek_generation_id: greekRow.id,
              serial_number: serial, technical_version: cleanVersion, status: "active", owner_user_id: authData.user.id,
            });
            if (!insertError) {
              const entry: Entry = { id: identifier, name: cleanName, category, greek, version: cleanVersion, status: "Actif", createdAt: new Date().toISOString().slice(0, 10) };
              setEntries(old => [entry, ...old.filter(item => item.id !== identifier)]);
              setName("");
              setNotice(`Identifiant ${identifier} créé et enregistré dans Supabase.`);
              return;
            }
            if (insertError.code !== "23505") {
              throw new Error(insertError.message.includes("row-level security")
                ? "Ton compte n’a pas l’autorisation d’enregistrer cet identifiant. Vérifie le rôle et les règles d’accès BCX."
                : `Échec de l’enregistrement Supabase : ${insertError.message}`);
            }
          }
          throw new Error("Impossible de réserver un numéro unique après plusieurs tentatives. Réessaie.");
        }
      }

      // Local fallback remains available without configured Supabase or without a session.
      const used = new Set(entries.map(item => item.id));
      let serial = Math.max(0, ...entries.filter(item => item.category === category && item.greek === greek)
        .map(item => Number(item.id.split("-").at(-1)) || 0)) + 1;
      let identifier = `BCX-${category}-${greek}-${String(serial).padStart(3, "0")}`;
      while (used.has(identifier)) {
        serial++;
        identifier = `BCX-${category}-${greek}-${String(serial).padStart(3, "0")}`;
      }
      const entry: Entry = { id: identifier, name: cleanName, category, greek, version: cleanVersion, status: "Actif", createdAt: new Date().toISOString().slice(0, 10) };
      setEntries(old => [entry, ...old.filter(item => item.id !== identifier)]);
      setName("");
      setNotice(`Identifiant ${identifier} créé sur cet appareil uniquement. Connecte-toi pour l’enregistrer dans le registre partagé.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "La création a échoué. Réessaie.");
    } finally {
      setCreating(false);
    }
  }
  async function copy(value: string) {
    try { await navigator.clipboard.writeText(value); setNotice(`Copié : ${value}`); }
    catch { setNotice("Copie indisponible : sélectionne l'identifiant et copie-le manuellement."); }
  }
  function remove(id: string) {
    if (!window.confirm(`Supprimer ${id} de ce registre local ?`)) return;
    setEntries(old => old.filter(e => e.id !== id)); setNotice("Entrée supprimée du registre local.");
  }
  function exportCsv() {
    const rows = [["Identifiant", "Nom", "Catégorie", "Lettre grecque", "Version", "Statut", "Créé le"], ...entries.map(e => [e.id,e.name,e.category,e.greek,e.version,e.status,e.createdAt])];
    const csv = rows.map(r => r.map(v => `"${v.replace(/"/g, '""')}"`).join(";")).join("\n");
    const url = URL.createObjectURL(new Blob(["\\uFEFF" + csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a"); a.href = url; a.download = "bcx-registre.csv"; a.click(); URL.revokeObjectURL(url);
  }

  return <main className="bcx-shell bcx-app-shell">
    <aside className="sidebar bcx-sidebar">
      <a className="brand" href="#dashboard"><span className="brand-mark">Θ</span><span><b>BICKRI <em>CODEX</em></b><small>AI DEVELOPMENT SYSTEM</small></span></a>
      <div className="side-label">ESPACE DE TRAVAIL</div>
      <a className="nav-item active" href="#dashboard"><span>◈</span> Vue d’ensemble</a>
      <a className="nav-item" href="#projects"><span>▤</span> Mes projets</a>
      <a className="nav-item" href="/studio"><span>⌘</span> Éditeur de code</a>
      <a className="nav-item" href="/ai"><span>✳</span> Bickri Code AI</a>
      <a className="nav-item" href="/cloud"><span>☁</span> Environnement cloud</a>
      <a className="nav-item" href="#registry"><span>Ω</span> Registre BCX</a>
      <div className="sidebar-bottom"><div className="status-dot"/> BCX Workspace <span className="version">v1.0</span><p>Votre espace de développement</p></div>
    </aside>
    <div className="main-area bcx-main-area">
      <header className="topbar bcx-topbar"><div><span className="eyebrow">BICKRI CODEX SYSTEM / WORKSPACE</span><h1>Mon espace de travail</h1></div><div className="top-actions"><span className="local-pill"><i/> Espace prêt</span><a className="bcx-profile-link" href="/login"><span className="bcx-avatar">B</span><span>Mon compte</span><span>↗</span></a></div></header>
      <section id="dashboard" className="bcx-welcome">
        <div className="bcx-welcome-copy"><span className="eyebrow gold">VOTRE STUDIO DE DÉVELOPPEMENT</span><h2>Transformez vos idées<br/><span>en logiciels réels.</span></h2><p>Codez, testez et améliorez vos applications avec les outils BICKRI CODEX SYSTEM et votre assistant IA.</p><div className="bcx-hero-actions"><a className="primary-button" href="/studio">⌘ Ouvrir l’éditeur <span>↗</span></a><a className="secondary-button" href="/ai">✳ Parler à Bickri AI</a></div><div className="bcx-trust-row"><span>✓ Projets organisés</span><span>✓ Outils intégrés</span><span>✓ Mobile & ordinateur</span></div></div>
        <div className="bcx-hero-art" aria-hidden="true"><div className="bcx-orbit bcx-orbit-a"/><div className="bcx-orbit bcx-orbit-b"/><div className="bcx-code-window"><div className="bcx-window-bar"><i/><i/><i/><span>main.tsx</span></div><pre><span className="bcx-code-purple">export default</span> <span className="bcx-code-blue">function</span> App() &#123;<br/>  <span className="bcx-code-purple">return</span> (<br/>    <span className="bcx-code-green">&lt;BickriCodex /&gt;</span><br/>  );<br/>&#125;<br/><span className="bcx-code-comment">// Build your next idea.</span></pre><div className="bcx-window-status"><span>●</span> Workspace ready <b>TypeScript</b></div></div><div className="bcx-ai-float"><span>✳</span><div><b>Bickri Code AI</b><small>Assistant intégré</small></div><i>●</i></div></div>
      </section>
      <section className="bcx-section-head"><div><span className="section-kicker">VOTRE ENVIRONNEMENT</span><h3>Tout pour développer</h3><p>Accédez rapidement aux outils essentiels de BCX.</p></div></section>
      <section className="bcx-tools-grid">
        <a className="bcx-tool-card bcx-tool-primary" href="/studio"><div className="bcx-tool-icon">⌘</div><span className="bcx-card-label">ÉDITION</span><h3>Studio de code</h3><p>Éditeur, fichiers, onglets et aperçu de votre application dans un seul espace.</p><span className="bcx-card-link">Ouvrir le studio <b>↗</b></span><div className="bcx-mini-editor"><span>01</span><code><i>const</i> project = <b>"BCX"</b>;</code><span>02</span><code>build<span>()</span>;</code></div></a>
        <a className="bcx-tool-card" href="/ai"><div className="bcx-tool-icon bcx-icon-gold">✳</div><span className="bcx-card-label">INTELLIGENCE ARTIFICIELLE</span><h3>Bickri Code AI</h3><p>Explique le code, propose des corrections et aide à concevoir des fonctionnalités.</p><span className="bcx-card-link">Lancer l’assistant <b>↗</b></span><div className="bcx-ai-preview"><span>✳</span><div><b>Comment puis-je vous aider ?</b><small>Décris la fonctionnalité à créer…</small></div></div></a>
        <a className="bcx-tool-card" href="/cloud"><div className="bcx-tool-icon bcx-icon-purple">☁</div><span className="bcx-card-label">EXÉCUTION</span><h3>BCX Cloud</h3><p>Retrouvez l’espace cloud et les outils d’exécution disponibles pour vos projets.</p><span className="bcx-card-link">Accéder au cloud <b>↗</b></span><div className="bcx-cloud-preview"><span>BUILD STATUS</span><b><i/> Espace de travail</b><small>Ouvrez le cloud pour continuer</small></div></a>
      </section>
      <section id="projects" className="panel bcx-project-panel"><div className="panel-heading"><div><span className="section-kicker">CONTINUER À CRÉER</span><h3>Accès rapide aux projets</h3></div><a className="secondary-button" href="/studio">＋ Nouveau projet</a></div><div className="bcx-project-grid"><a href="/studio" className="bcx-project-item"><span className="bcx-project-symbol">⌘</span><div><b>Mon espace de code</b><small>Ouvrir l’éditeur et gérer les fichiers</small></div><span className="bcx-project-arrow">↗</span></a><a href="/ai" className="bcx-project-item"><span className="bcx-project-symbol gold-symbol">✳</span><div><b>Assistant de programmation</b><small>Analyser, générer et corriger du code</small></div><span className="bcx-project-arrow">↗</span></a><a href="/cloud" className="bcx-project-item"><span className="bcx-project-symbol purple-symbol">☁</span><div><b>Environnement cloud</b><small>Accéder aux outils cloud de BCX</small></div><span className="bcx-project-arrow">↗</span></a></div></section>
      <section id="registry" className="panel registry-panel"><div className="panel-heading registry-heading"><div><span className="section-kicker">IDENTITÉS DE L’ÉCOSYSTÈME</span><h3>Registre BCX</h3></div><button className="secondary-button" onClick={exportCsv}>↓ Exporter CSV</button></div><div className="registry-tools"><div className="search-box"><span>⌕</span><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Rechercher un code ou un projet…"/></div><select value={filter} onChange={e=>setFilter(e.target.value)} aria-label="Filtrer par statut"><option>Tous</option><option>Actif</option><option>Brouillon</option></select></div><div className="table-wrap"><table><thead><tr><th>IDENTIFIANT</th><th>NOM DU PROJET</th><th>VERSION</th><th>STATUT</th><th>CRÉÉ LE</th><th/></tr></thead><tbody>{visible.map(e=><tr key={e.id}><td><button className="id-link" onClick={()=>copy(e.id)}>{e.id} <span>⧉</span></button></td><td><b className="project-name">{e.name}</b><small className="project-sub">{e.category} / {e.greek}</small></td><td><span className="version-chip">v{e.version}</span></td><td><span className="status-chip"><i/>{e.status}</span></td><td className="date-cell">{e.createdAt}</td><td><button className="delete-button" onClick={()=>remove(e.id)} aria-label={"Supprimer "+e.id} title="Supprimer">×</button></td></tr>)}{visible.length===0&&<tr><td colSpan={6} className="empty-state">Aucun identifiant trouvé.</td></tr>}</tbody></table></div><div className="table-footer"><span>{visible.length} résultat(s)</span><span>Registre de ce navigateur ou compte connecté</span></div></section>
      {notice && <div className="notice" role="status"><span>{notice}</span><button onClick={()=>setNotice("")} aria-label="Fermer">×</button></div>}
      <footer className="footer"><span>© 2026 BICKRI CODEX SYSTEM</span><span>Code. Build. Evolve. <b>Θ</b></span></footer>
    </div>
    <nav className="bcx-mobile-nav"><a className="selected" href="#dashboard"><span>◈</span><small>Accueil</small></a><a href="#projects"><span>▤</span><small>Projets</small></a><a href="/studio"><span>⌘</span><small>Studio</small></a><a href="/ai"><span>✳</span><small>IA</small></a><a href="/login"><span>◉</span><small>Compte</small></a></nav>
  </main>;
}

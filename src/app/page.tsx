"use client";

import { useEffect, useMemo, useState } from "react";
import { CATEGORIES, GREEK_LETTERS } from "@/lib/codex";

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

  useEffect(() => {
    try { const raw = localStorage.getItem(STORE); setEntries(raw ? JSON.parse(raw) : starter); }
    catch { setEntries(starter); }
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

  function createEntry(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!name.trim()) { setNotice("Ajoute un nom de projet pour continuer."); return; }
    if (entries.some(x => x.id === nextId)) { setNotice("Cet identifiant existe déjà. Génère-en un autre."); return; }
    setEntries(old => [{ id: nextId, name: name.trim(), category, greek, version: version.trim() || "1.0.0", status: "Actif", createdAt: new Date().toISOString().slice(0, 10) }, ...old]);
    setName(""); setNotice(`Identifiant ${nextId} créé sur cet appareil.`);
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

  return <main className="bcx-shell">
    <aside className="sidebar">
      <a className="brand" href="#"><span className="brand-mark">Θ</span><span><b>BICKRI <em>CODEX</em></b><small>SYSTEM · BCX</small></span></a>
      <div className="side-label">ESPACE DE TRAVAIL</div>
      <a className="nav-item active" href="#dashboard"><span>◈</span> Tableau de bord</a>
      <a className="nav-item" href="#registry"><span>▤</span> Registre des codes</a>
      <a className="nav-item" href="#generator"><span>✳</span> Générateur BCX</a>
      <a className="nav-item" href="#greek"><span>Ω</span> Lettres grecques</a>
      <div className="sidebar-bottom"><div className="status-dot"/> Prototype BCX <span className="version">v0.2.0</span><p>Registre local · Supabase à connecter</p></div>
    </aside>
    <div className="main-area">
      <header className="topbar"><div><span className="eyebrow">BICKRI TECHNOLOGY / REGISTRY</span><h1>Tableau de bord</h1></div><div className="top-actions"><span className="local-pill"><i/> Mode local</span><div className="avatar">B</div></div></header>
      <section id="dashboard" className="welcome"><div><span className="eyebrow gold">IDENTITÉ NUMÉRIQUE OFFICIELLE</span><h2>Le code de chaque idée.<br/><span>La signature de chaque projet.</span></h2><p>Crée, organise et retrouve les identifiants uniques de l’écosystème BICKRI depuis un seul espace.</p><a className="primary-button" href="#generator">＋ Créer un identifiant <span>↗</span></a></div><div className="hero-symbol"><div className="orbit orbit-one"/><div className="orbit orbit-two"/><span>Θ</span><small>BCX / 08</small></div><div className="hero-code"><small>EXEMPLE DE SIGNATURE</small><strong>BCX-AI-THETA-001</strong><span>Identifiant unique · Version séparée</span></div></section>
      <section className="stats-grid">
        <article className="stat-card"><span className="stat-icon cyan">⌘</span><small>Identifiants enregistrés</small><strong>{entries.length.toString().padStart(2,"0")}</strong><span className="stat-note">Dans ce navigateur</span></article>
        <article className="stat-card"><span className="stat-icon gold">▣</span><small>Catégories disponibles</small><strong>06</strong><span className="stat-note">AI · APP · WEB · SYS · SEC · LAB</span></article>
        <article className="stat-card"><span className="stat-icon purple">Ω</span><small>Lettres grecques</small><strong>24</strong><span className="stat-note">Nomenclature officielle</span></article>
        <article className="stat-card"><span className="stat-icon green">✓</span><small>Identifiants en service</small><strong>{entries.filter(e=>e.status==="Actif").length.toString().padStart(2,"0")}</strong><span className="stat-note">État du registre local</span></article>
      </section>
      {notice && <div className="notice" role="status"><span>{notice}</span><button onClick={()=>setNotice("")} aria-label="Fermer">×</button></div>}
      <section id="generator" className="content-grid">
        <article className="panel generator-panel"><div className="panel-heading"><div><span className="section-kicker">OUTIL DE CRÉATION</span><h3>Générateur d’identifiants</h3></div><span className="live-tag"><i/> PRÊT</span></div><p className="muted">Chaque code combine une catégorie, une lettre grecque et un numéro séquentiel.</p>
          <form onSubmit={createEntry} className="generator-form">
            <label>Nom du projet<input value={name} onChange={e=>setName(e.target.value)} placeholder="Ex. Bickri AI Studio" maxLength={90} required/></label>
            <div className="form-row"><label>Catégorie<select value={category} onChange={e=>setCategory(e.target.value)}>{CATEGORIES.map(c=><option key={c.code} value={c.code}>{c.code} — {c.label}</option>)}</select></label><label>Série grecque<select value={greek} onChange={e=>setGreek(e.target.value)}>{GREEK_LETTERS.map(g=><option key={g.name} value={slug(g.name)}>{g.symbol} {g.name}</option>)}</select></label></div>
            <label>Version technique<input value={version} onChange={e=>setVersion(e.target.value)} placeholder="1.0.0" pattern="^[0-9]+\\.[0-9]+\\.[0-9]+$" title="Format attendu : 1.0.0"/></label>
            <div className="preview-label">APERÇU DU CODE</div><div className="code-preview"><span>{nextId}</span><button type="button" className="copy-button" onClick={()=>copy(nextId)}>Copier</button></div>
            <button type="submit" className="primary-button full-button">Créer l’identifiant <span>→</span></button>
          </form>
          <p className="form-footnote">ⓘ L’identifiant est unique dans ce registre local. La validation centralisée nécessitera Supabase.</p>
        </article>
        <article className="panel rules-panel"><div className="panel-heading"><div><span className="section-kicker">STANDARD BCX</span><h3>Structure du code</h3></div><span className="rule-symbol">Θ</span></div><div className="formula"><span>BCX</span><b>–</b><span>CATÉGORIE</span><b>–</b><span>GREC</span><b>–</b><span>001</span></div><div className="rule-list"><div><i className="rule-dot cyan-dot"/> <span><b>BCX</b><small>Préfixe officiel du système</small></span></div><div><i className="rule-dot gold-dot"/> <span><b>Catégorie</b><small>Famille du produit ou projet</small></span></div><div><i className="rule-dot purple-dot"/> <span><b>Lettre grecque</b><small>Série de classification</small></span></div><div><i className="rule-dot green-dot"/> <span><b>Numéro séquentiel</b><small>Trois chiffres, incrémentés par série</small></span></div></div><div className="rule-callout"><b>Version ≠ identifiant</b><p>La version technique (ex. 1.0.0) évolue indépendamment du code BCX.</p></div></article>
      </section>
      <section id="registry" className="panel registry-panel"><div className="panel-heading registry-heading"><div><span className="section-kicker">BASE DE RÉFÉRENCE</span><h3>Registre des identifiants</h3></div><button className="secondary-button" onClick={exportCsv}>↓ Exporter CSV</button></div><div className="registry-tools"><div className="search-box"><span>⌕</span><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Rechercher un code ou un projet…"/></div><select value={filter} onChange={e=>setFilter(e.target.value)} aria-label="Filtrer par statut"><option>Tous</option><option>Actif</option><option>Brouillon</option></select></div><div className="table-wrap"><table><thead><tr><th>IDENTIFIANT</th><th>NOM DU PROJET</th><th>VERSION</th><th>STATUT</th><th>CRÉÉ LE</th><th/></tr></thead><tbody>{visible.map(e=><tr key={e.id}><td><button className="id-link" onClick={()=>copy(e.id)}>{e.id} <span>⧉</span></button></td><td><b className="project-name">{e.name}</b><small className="project-sub">{e.category} / {e.greek}</small></td><td><span className="version-chip">v{e.version}</span></td><td><span className="status-chip"><i/>{e.status}</span></td><td className="date-cell">{e.createdAt}</td><td><button className="delete-button" onClick={()=>remove(e.id)} aria-label={"Supprimer "+e.id} title="Supprimer">×</button></td></tr>)}{visible.length===0&&<tr><td colSpan={6} className="empty-state">Aucun identifiant trouvé. Crée ton premier code ou modifie la recherche.</td></tr>}</tbody></table></div><div className="table-footer"><span>{visible.length} résultat(s) affiché(s)</span><span>Stockage local de ce navigateur</span></div></section>
      <section id="greek" className="panel greek-panel"><div className="panel-heading"><div><span className="section-kicker">SÉRIES DE CLASSIFICATION</span><h3>Les 24 lettres grecques</h3></div><span className="muted tiny">Sélectionne une lettre dans le générateur</span></div><div className="greek-grid">{GREEK_LETTERS.map(g=><button key={g.name} onClick={()=>{setGreek(slug(g.name));document.getElementById("generator")?.scrollIntoView({behavior:"smooth"});}} className={"greek-tile "+(greek===slug(g.name)?"selected":"")} title={"Utiliser "+g.name}><strong>{g.symbol}</strong><span>{g.name}</span><small>{String(g.ordinal).padStart(2,"0")}</small></button>)}</div></section>
      <footer className="footer"><span>© 2026 BICKRI CODEX SYSTEM</span><span>Conçu pour l’écosystème BICKRI <b>Θ</b></span></footer>
    </div>
  </main>;
}

"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";

type FileKey = "html" | "css" | "js";
type Workspace = { name: string; html: string; css: string; js: string; updatedAt: string };
const STORAGE = "bcx_studio_workspace_v1";
const starter: Workspace = {
  name: "Mon premier site",
  html: "<main class=\"hero\">\n  <span class=\"eyebrow\">BICKRI CODEX STUDIO</span>\n  <h1>Donne vie à tes idées.</h1>\n  <p>Écris ton code, visualise le résultat et construis ton prochain projet.</p>\n  <button onclick=\"document.querySelector('p').textContent='Bravo ! Ton JavaScript fonctionne.'\">Tester mon code</button>\n</main>",
  css: "body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #08111e; color: #eef6ff; font-family: system-ui, sans-serif; }\n.hero { max-width: 680px; padding: 48px; border: 1px solid #263c52; border-radius: 24px; background: linear-gradient(145deg, #13283a, #0b1421); }\n.eyebrow { color: #67e8f9; letter-spacing: .2em; font-size: 12px; }\nh1 { font-size: clamp(36px, 7vw, 64px); margin: 16px 0; }\np { color: #a8bacd; line-height: 1.8; }\nbutton { padding: 12px 18px; border: 0; border-radius: 8px; background: #67e8f9; color: #07131e; font-weight: 800; cursor: pointer; }",
  js: "console.log('Bienvenue dans BICKRI CODEX STUDIO');",
  updatedAt: new Date().toISOString()
};
const templates: Record<string, Pick<Workspace, "html" | "css" | "js" | "name">> = {
  "Landing page": { name: "Landing page", html: "<section class=\"landing\"><nav><b>MON PROJET</b><span>Accueil · Services · Contact</span></nav><div class=\"content\"><small>UNE NOUVELLE EXPÉRIENCE</small><h1>Construis quelque chose d'extraordinaire.</h1><p>Une page moderne, rapide et adaptée au mobile.</p><a href=\"#services\">Découvrir le projet ↗</a></div></section><section id=\"services\"><h2>Nos services</h2><p>Présente ici tes services, produits et idées.</p></section>", css: "body{margin:0;background:#0a1220;color:#edf5ff;font-family:system-ui,sans-serif}.landing{min-height:85vh;padding:28px 7%;background:radial-gradient(circle at 80% 20%,#174456,transparent 38%)}nav{display:flex;justify-content:space-between;gap:20px;color:#a9bdce}.content{max-width:850px;margin:15vh auto}.content small{color:#67e8f9;letter-spacing:.2em}.content h1{font-size:clamp(42px,8vw,86px);line-height:1.02;letter-spacing:-.05em}.content p{color:#a9bdce;line-height:1.8}.content a{display:inline-block;padding:14px 18px;background:#67e8f9;color:#07131e;border-radius:9px;text-decoration:none;font-weight:800}section+section{padding:50px 7%}", js: "console.log('Landing page prête');" },
  "Portfolio": { name: "Portfolio personnel", html: "<main><p class=\"tag\">DÉVELOPPEUR · CRÉATEUR</p><h1>Bonjour, moi c'est <span>Alex.</span></h1><p>Je transforme les idées en expériences numériques.</p><div class=\"cards\"><article><b>01 / WEB</b><h2>Sites web</h2><p>Des expériences rapides et élégantes.</p></article><article><b>02 / APP</b><h2>Applications</h2><p>Des outils utiles pour le quotidien.</p></article></div></main>", css: "body{margin:0;background:#f2f0e9;color:#171b22;font-family:system-ui,sans-serif}main{max-width:980px;margin:10vh auto;padding:24px}.tag{letter-spacing:.2em;font-size:12px}h1{font-size:clamp(42px,8vw,82px);line-height:1.05}h1 span{color:#147d75}main>p:not(.tag){color:#5a626b;font-size:18px}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px;margin-top:50px}article{padding:25px;border:1px solid #d6d4cd;border-radius:18px;background:#fff}article b{color:#147d75;font-size:12px}article p{color:#5a626b}", js: "document.title = 'Portfolio personnel';" },
  "Application simple": { name: "Application compteur", html: "<main class=\"app\"><p class=\"tag\">MINI APPLICATION</p><h1>Mon compteur</h1><p id=\"count\">0</p><div><button onclick=\"change(-1)\">−</button><button onclick=\"change(1)\">+</button><button onclick=\"resetCount()\">Réinitialiser</button></div></main>", css: "body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b1320;color:#f3f7fc;font-family:system-ui,sans-serif}.app{text-align:center;padding:40px;border:1px solid #2a4058;border-radius:20px;background:#111e2d}.tag{color:#67e8f9;letter-spacing:.15em;font-size:12px}h1{font-size:36px}#count{font-size:70px;margin:20px}button{padding:12px 16px;margin:4px;border:0;border-radius:8px;background:#67e8f9;color:#07131e;font-weight:800;cursor:pointer}", js: "let count = 0; function change(n){ count += n; document.getElementById('count').textContent = count; } function resetCount(){ count = 0; document.getElementById('count').textContent = count; }" }
};

export default function StudioPage() {
  const [workspace, setWorkspace] = useState<Workspace>(starter);
  const [activeFile, setActiveFile] = useState<FileKey>("html");
  const [notice, setNotice] = useState("Bienvenue dans ton espace de code.");
  const [refreshKey, setRefreshKey] = useState(0);
  const [template, setTemplate] = useState("Landing page");
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiReply, setAiReply] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE);
      if (saved) setWorkspace({ ...starter, ...JSON.parse(saved) });
    } catch {}
  }, []);
  useEffect(() => { localStorage.setItem(STORAGE, JSON.stringify(workspace)); }, [workspace]);
  const source = useMemo(() => {
    const safeJs = workspace.js.replace(/<\/script/gi, "<\\/script");
    return "<!doctype html><html lang=\"fr\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"><style>" + workspace.css.replace(/<\/style/gi, "<\\/style") + "</style></head><body>" + workspace.html + "<script>" + safeJs + "<\/script></body></html>";
  }, [workspace, refreshKey]);
  const code = workspace[activeFile];
  function edit(value: string) { setWorkspace(old => ({ ...old, [activeFile]: value, updatedAt: new Date().toISOString() })); }
  function download(file: FileKey) {
    const content = file === "html" ? "<!doctype html>\n<html lang=\"fr\">\n<head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"><link rel=\"stylesheet\" href=\"style.css\"></head>\n<body>\n" + workspace.html + "\n<script src=\"script.js\"></script>\n</body></html>" : workspace[file];
    const blob = new Blob([content], { type: file === "html" ? "text/html" : file === "css" ? "text/css" : "text/javascript" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = file === "html" ? "index.html" : file === "css" ? "style.css" : "script.js"; a.click(); URL.revokeObjectURL(url);
    setNotice("Fichier " + (file === "html" ? "index.html" : file === "css" ? "style.css" : "script.js") + " téléchargé.");
  }
  function applyTemplate() {
    const picked = templates[template];
    setWorkspace(old => ({ ...old, ...picked, updatedAt: new Date().toISOString() }));
    setNotice("Modèle « " + template + " » chargé.");
  }
  async function askAI(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const question = aiPrompt.trim();
    if (!question || aiLoading) return;
    setAiLoading(true); setAiError(""); setAiReply("");
    try {
      const response = await fetch("/api/ai/code", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          language: activeFile === "html" ? "HTML" : activeFile === "css" ? "CSS" : "JavaScript",
          projectContext: `Projet : ${workspace.name}\nFichier actif : ${activeFile}\n--- index.html ---\n${workspace.html.slice(0, 5000)}\n--- style.css ---\n${workspace.css.slice(0, 5000)}\n--- script.js ---\n${workspace.js.slice(0, 5000)}\nQuand la demande porte sur une modification du fichier actif, donne le contenu complet du fichier dans un bloc de code.`,
          messages: [{ role: "user", content: question }],
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "L’assistant IA est indisponible.");
      setAiReply(data.answer);
    } catch (error) { setAiError(error instanceof Error ? error.message : "Une erreur est survenue."); }
    finally { setAiLoading(false); }
  }
  function applyAIToActiveFile() {
    const match = aiReply.match(/```(?:html|css|javascript|js)?\s*\n([\s\S]*?)\n```/i);
    const content = (match ? match[1] : aiReply).trim();
    if (!content) return;
    setWorkspace(old => ({ ...old, [activeFile]: content, updatedAt: new Date().toISOString() }));
    setNotice("Réponse IA appliquée au fichier " + (activeFile === "html" ? "index.html" : activeFile === "css" ? "style.css" : "script.js") + ". Vérifie le résultat dans l’aperçu.");
  }
  function reset() {
    if (!window.confirm("Remplacer ton code actuel par le modèle de départ ?")) return;
    setWorkspace({ ...starter, updatedAt: new Date().toISOString() }); setNotice("Code de départ restauré.");
  }
  return <main className="studio-shell">
    <header className="studio-topbar"><a className="studio-brand" href="/"><span>Θ</span><b>BICKRI <em>CODEX</em><small>STUDIO DE DÉVELOPPEMENT</small></b></a><div className="studio-top-links"><a href="/">← Tableau de bord BCX</a><span className="studio-status"><i/> Espace local</span></div></header>
    <section className="studio-intro"><div><span className="studio-kicker">BCX / ENVIRONNEMENT DE CRÉATION</span><h1>Ton code. Tes idées.<br/><span>Ton prochain produit.</span></h1><p>Écris du HTML, du CSS et du JavaScript, teste ton résultat en direct et exporte les fichiers de ton site.</p></div><div className="studio-orb">{"</>"}</div></section>
    <div className="studio-toolbar"><div className="workspace-name"><span className="file-icon">▣</span><input aria-label="Nom du projet" value={workspace.name} onChange={e=>setWorkspace(old=>({...old,name:e.target.value,updatedAt:new Date().toISOString()}))}/><span className="autosave">● Sauvegarde locale automatique</span></div><div className="studio-actions"><select aria-label="Choisir un modèle" value={template} onChange={e=>setTemplate(e.target.value)}>{Object.keys(templates).map(t=><option key={t}>{t}</option>)}</select><button onClick={applyTemplate} className="studio-btn">Charger modèle</button><button onClick={()=>download(activeFile)} className="studio-btn studio-btn-primary">↓ Exporter {activeFile.toUpperCase()}</button></div></div>
    {notice && <div className="studio-notice"><span>{notice}</span><button onClick={()=>setNotice("")}>×</button></div>}
    <section className="studio-workspace">
      <div className="editor-panel"><div className="editor-title"><span><i/> ÉDITEUR DE CODE</span><button onClick={reset}>Réinitialiser</button></div><div className="file-tabs">{(["html","css","js"] as FileKey[]).map(file=><button key={file} onClick={()=>setActiveFile(file)} className={activeFile===file?"chosen":""}><span className={"file-badge "+file}>{file==="html"?"5":file==="css"?"#":"JS"}</span>{file==="html"?"index.html":file==="css"?"style.css":"script.js"}</button>)}</div><div className="code-editor"><div className="line-numbers">{Array.from({length:Math.max(22,code.split("\n").length)},(_,i)=><span key={i}>{i+1}</span>)}</div><textarea spellCheck={false} autoCapitalize="off" autoCorrect="off" aria-label={"Éditeur "+activeFile} value={code} onChange={e=>edit(e.target.value)} /></div><div className="editor-footer"><span>{code.split("\n").length} lignes · {code.length} caractères</span><span>UTF-8 · {activeFile.toUpperCase()}</span></div></div>
      <div className="preview-panel"><div className="preview-top"><div><span className="preview-dot red"/><span className="preview-dot yellow"/><span className="preview-dot green"/></div><span>APERÇU EN DIRECT</span><button onClick={()=>setRefreshKey(k=>k+1)}>↻ Actualiser</button></div><div className="preview-address"><span>⌑</span><span>bcx-studio.local/{workspace.name.toLowerCase().replace(/[^a-z0-9]+/g,"-")}</span><span className="secure">●</span></div><iframe key={refreshKey} title="Aperçu de votre site" sandbox="allow-scripts" srcDoc={source} />
        <div className="preview-footer"><span><i/> Aperçu isolé</span><span>Responsive · HTML/CSS/JS</span></div></div>
    </section>
    <section className="studio-ai-panel" id="bickri-code-ai">
      <div className="studio-ai-heading"><div><span className="studio-kicker">ASSISTANT INTÉGRÉ · BCX</span><h2><span>✳</span> Bickri Code AI</h2><p>Demande une amélioration ou une correction : l’IA reçoit le contexte de tes fichiers et peut proposer du code à appliquer dans l’éditeur.</p></div><span className="studio-ai-chip">IA DE CODAGE</span></div>
      <form className="studio-ai-form" onSubmit={askAI}>
        <textarea value={aiPrompt} onChange={e=>setAiPrompt(e.target.value)} placeholder={`Ex. Améliore le design mobile du fichier ${activeFile} ou corrige une erreur…`} rows={3} maxLength={4000} />
        <div className="studio-ai-controls"><span>Fichier ciblé : <b>{activeFile==="html"?"index.html":activeFile==="css"?"style.css":"script.js"}</b> · Le code ne change qu’après ton action.</span><button type="submit" disabled={aiLoading||!aiPrompt.trim()}>{aiLoading?"Réflexion…":"Demander à l’IA ↗"}</button></div>
      </form>
      {aiError && <div className="studio-ai-error" role="alert">{aiError}</div>}
      {aiLoading && <div className="studio-ai-wait">Bickri Code AI analyse le contexte du projet…</div>}
      {aiReply && <div className="studio-ai-response"><div className="studio-ai-response-title">RÉPONSE DE BICKRI CODE AI</div><pre>{aiReply}</pre><button onClick={applyAIToActiveFile} type="button">Appliquer au fichier actif ↗</button></div>}
    </section>
    <section className="studio-bottom-grid"><article><span className="bottom-icon">⌘</span><div><b>Écris ton code</b><p>Modifie les trois fichiers directement dans le navigateur.</p></div></article><article><span className="bottom-icon">◉</span><div><b>Teste en direct</b><p>Actualise l’aperçu pour voir le rendu de ton site.</p></div></article><article><span className="bottom-icon">↓</span><div><b>Exporte tes fichiers</b><p>Télécharge HTML, CSS et JavaScript pour continuer ton projet.</p></div></article></section>
    <footer className="studio-footer"><span>© 2026 BICKRI CODEX SYSTEM · BCX STUDIO</span><span>Prototypes web · <b>Θ</b></span></footer>
  </main>;
}

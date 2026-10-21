"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { CircleCheck, Download, Eraser, FileCode, LayoutTemplate, Monitor, Play, RotateCcw, Smartphone, Sparkles, Tablet, Terminal, Wand, X } from "lucide-react";
import { Markdown, extractCodeBlock } from "@/components/ai/Markdown";
import { useToast } from "@/components/ui/Toast";
import { FILES, STARTER, TEMPLATES, type FileKey, type Workspace } from "@/lib/studio/templates";

const CodeEditor = dynamic(() => import("@/components/studio/CodeEditor"), {
  ssr: false,
  loading: () => <div style={{ padding: 16 }}><div className="skeleton" style={{ height: 14, width: "60%", marginBottom: 10 }} /><div className="skeleton" style={{ height: 14, width: "80%", marginBottom: 10 }} /><div className="skeleton" style={{ height: 14, width: "40%" }} /></div>,
});

const STORAGE = "bcx_studio_workspace_v1";
type Viewport = "desktop" | "tablet" | "mobile";
const VIEWPORTS: Record<Viewport, { width: string; label: string; icon: typeof Monitor }> = {
  desktop: { width: "100%", label: "Ordinateur", icon: Monitor },
  tablet: { width: "768px", label: "Tablette", icon: Tablet },
  mobile: { width: "375px", label: "Mobile", icon: Smartphone },
};
type LogLine = { level: "log" | "info" | "warn" | "error"; text: string };

/** Script injecté dans l'aperçu : remonte console.* et les erreurs vers le studio. */
const BRIDGE = `<script>(function(){function s(l,a){try{parent.postMessage({__bcx:1,level:l,text:Array.prototype.map.call(a,function(x){try{return typeof x==="string"?x:JSON.stringify(x)}catch(e){return String(x)}}).join(" ")},"*")}catch(e){}}["log","info","warn","error"].forEach(function(l){var o=console[l];console[l]=function(){s(l,arguments);o.apply(console,arguments)}});addEventListener("error",function(e){s("error",[e.message+(e.lineno?" (ligne "+e.lineno+")":"")])});addEventListener("unhandledrejection",function(e){s("error",["Promesse rejetée : "+((e.reason&&e.reason.message)||e.reason)])})})();<\/script>`;

function buildDocument(w: Workspace) {
  const css = w.css.replace(/<\/style/gi, "<\\/style");
  const js = w.js.replace(/<\/script/gi, "<\\/script");
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${BRIDGE}<style>${css}</style></head><body>${w.html}<script>${js}<\/script></body></html>`;
}

export default function StudioPage() {
  const { notify } = useToast();
  const [workspace, setWorkspace] = useState<Workspace>(STARTER);
  const [loaded, setLoaded] = useState(false);
  const [active, setActive] = useState<FileKey>("html");
  const [viewport, setViewport] = useState<Viewport>("desktop");
  const [doc, setDoc] = useState("");
  const [runKey, setRunKey] = useState(0);
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [cursor, setCursor] = useState({ line: 1, col: 1 });
  const [template, setTemplate] = useState(Object.keys(TEMPLATES)[0]);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiReply, setAiReply] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  const frameRef = useRef<HTMLIFrameElement>(null);

  // Chargement et sauvegarde automatique locale.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE);
      if (saved) setWorkspace({ ...STARTER, ...JSON.parse(saved) });
    } catch { /* données corrompues : on garde le modèle */ }
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (!loaded) return;
    const id = window.setTimeout(() => { try { localStorage.setItem(STORAGE, JSON.stringify(workspace)); } catch { /* ignoré */ } }, 300);
    return () => window.clearTimeout(id);
  }, [workspace, loaded]);

  // Aperçu en direct (rafraîchi 500 ms après la dernière frappe).
  const run = useCallback(() => { setLogs([]); setDoc(buildDocument(workspace)); setRunKey((k) => k + 1); }, [workspace]);
  useEffect(() => {
    if (!loaded) return;
    const id = window.setTimeout(run, 500);
    return () => window.clearTimeout(id);
  }, [run, loaded]);

  // Réception des messages de console de l'aperçu.
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.source !== frameRef.current?.contentWindow || !e.data?.__bcx) return;
      setLogs((all) => [...all.slice(-199), { level: e.data.level, text: String(e.data.text).slice(0, 2000) }]);
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  // Raccourci Ctrl/Cmd + S : exécuter.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") { e.preventDefault(); run(); notify("Projet enregistré et exécuté.", "success"); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [run, notify]);

  const activeFile = FILES.find((f) => f.key === active)!;
  const errors = logs.filter((l) => l.level === "error").length;
  const update = useCallback((value: string) => setWorkspace((w) => ({ ...w, [active]: value, updatedAt: new Date().toISOString() })), [active]);
  const onCursor = useCallback((line: number, col: number) => setCursor({ line, col }), []);
  const lines = useMemo(() => workspace[active].split("\n").length, [workspace, active]);

  function download(key: FileKey | "bundle") {
    const content = key === "bundle" ? buildDocument(workspace).replace(BRIDGE, "")
      : key === "html" ? `<!doctype html>\n<html lang="fr">\n<head>\n  <meta charset="utf-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1">\n  <link rel="stylesheet" href="style.css">\n</head>\n<body>\n${workspace.html}\n<script src="script.js"></script>\n</body>\n</html>\n`
      : workspace[key];
    const filename = key === "bundle" ? `${slug(workspace.name) || "projet"}.html` : FILES.find((f) => f.key === key)!.name;
    const url = URL.createObjectURL(new Blob([content], { type: key === "css" ? "text/css" : key === "js" ? "text/javascript" : "text/html" }));
    const a = document.createElement("a"); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
    notify(`${filename} téléchargé.`, "success");
  }

  function applyTemplate() {
    if (!window.confirm(`Remplacer le code actuel par le modèle « ${template} » ?`)) return;
    setWorkspace((w) => ({ ...w, ...TEMPLATES[template], updatedAt: new Date().toISOString() }));
    notify(`Modèle « ${template} » chargé.`, "success");
  }

  function reset() {
    if (!window.confirm("Remplacer ton code actuel par le projet de départ ?")) return;
    setWorkspace({ ...STARTER, updatedAt: new Date().toISOString() });
    notify("Projet de départ restauré.", "info");
  }

  async function askAI(e: FormEvent) {
    e.preventDefault();
    const question = aiPrompt.trim();
    if (!question || aiLoading) return;
    setAiLoading(true); setAiError(""); setAiReply("");
    try {
      const res = await fetch("/api/ai/code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          language: activeFile.language,
          projectContext: `Projet : ${workspace.name}\nFichier actif : ${activeFile.name}\n--- index.html ---\n${workspace.html.slice(0, 5000)}\n--- style.css ---\n${workspace.css.slice(0, 5000)}\n--- script.js ---\n${workspace.js.slice(0, 5000)}${errors ? `\n--- Erreurs console ---\n${logs.filter((l) => l.level === "error").map((l) => l.text).join("\n").slice(0, 1500)}` : ""}\nQuand la demande porte sur une modification du fichier actif, donne le contenu complet du fichier dans un seul bloc de code.`,
          messages: [{ role: "user", content: question }],
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "L'assistant IA est indisponible.");
      setAiReply(data.answer);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "Une erreur est survenue.");
    } finally {
      setAiLoading(false);
    }
  }

  function applyAI() {
    const langs = active === "js" ? ["js", "javascript"] : [active];
    const code = extractCodeBlock(aiReply, langs);
    if (!code) { notify("Aucun bloc de code trouvé dans la réponse.", "error"); return; }
    update(code);
    notify(`Code appliqué à ${activeFile.name}. Vérifie l'aperçu.`, "success");
  }

  const vp = VIEWPORTS[viewport];

  return (
    <main className="studio">
      <div className="studio-bar">
        <div className="studio-name">
          <FileCode size={16} className="faint" aria-hidden="true" />
          <input aria-label="Nom du projet" value={workspace.name} onChange={(e) => setWorkspace((w) => ({ ...w, name: e.target.value, updatedAt: new Date().toISOString() }))} />
          <span className="save-state hide-sm"><CircleCheck aria-hidden="true" /> Sauvegarde automatique</span>
        </div>
        <div className="studio-bar-actions">
          <select className="select" value={template} onChange={(e) => setTemplate(e.target.value)} aria-label="Choisir un modèle">
            {Object.keys(TEMPLATES).map((t) => <option key={t}>{t}</option>)}
          </select>
          <button className="btn btn-sm" onClick={applyTemplate}><LayoutTemplate /> Charger</button>
          <button className="btn btn-sm" onClick={() => download("bundle")} title="Télécharger un fichier HTML autonome"><Download /> Exporter</button>
          <button className={`btn btn-sm ${aiOpen ? "btn-primary" : ""}`} onClick={() => setAiOpen((v) => !v)} aria-pressed={aiOpen}><Sparkles /> Codex BCX</button>
          <button className="btn btn-sm btn-primary" onClick={run} title="Exécuter (Ctrl + S)"><Play /> Exécuter</button>
        </div>
      </div>

      <div className={`studio-body ${aiOpen ? "with-ai" : ""}`}>
        <section className="pane" aria-label="Éditeur">
          <div className="pane-head" style={{ padding: 0 }}>
            <div className="tabs" role="tablist" aria-label="Fichiers">
              {FILES.map((f) => (
                <button key={f.key} role="tab" className="tab" aria-selected={active === f.key} onClick={() => setActive(f.key)}>
                  <span className="tab-dot" style={{ background: f.color }} />{f.name}
                </button>
              ))}
            </div>
            <div className="row" style={{ paddingRight: 8 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => download(active)} title={`Télécharger ${activeFile.name}`} aria-label={`Télécharger ${activeFile.name}`}><Download /></button>
              <button className="btn btn-ghost btn-sm" onClick={reset} title="Réinitialiser le projet" aria-label="Réinitialiser le projet"><RotateCcw /></button>
            </div>
          </div>
          <div className="editor-host">
            {loaded && <CodeEditor key={active} file={active} value={workspace[active]} onChange={update} onCursor={onCursor} />}
          </div>
          <div className="pane-foot"><span>{activeFile.language}</span><span>Ln {cursor.line}, Col {cursor.col} · {lines} lignes</span></div>
        </section>

        <section className="pane" aria-label="Aperçu">
          <div className="pane-head">
            <span>Aperçu · {vp.label}</span>
            <div className="segmented" role="group" aria-label="Taille d'écran">
              {(Object.keys(VIEWPORTS) as Viewport[]).map((k) => {
                const I = VIEWPORTS[k].icon;
                return <button key={k} aria-pressed={viewport === k} onClick={() => setViewport(k)} title={VIEWPORTS[k].label} aria-label={VIEWPORTS[k].label}><I /></button>;
              })}
            </div>
          </div>
          <div className={`preview-stage ${viewport !== "desktop" ? "framed" : ""}`}>
            <iframe ref={frameRef} key={runKey} className="preview-frame" style={{ width: vp.width, maxWidth: "100%" }} title="Aperçu du projet" sandbox="allow-scripts allow-modals allow-forms" srcDoc={doc} />
          </div>
          <div className="console" aria-label="Console">
            <div className="console-head">
              <span className="row"><Terminal size={13} /> Console {logs.length > 0 && <span className="faint">({logs.length}{errors ? `, ${errors} erreur${errors > 1 ? "s" : ""}` : ""})</span>}</span>
              <button className="btn btn-ghost btn-sm" onClick={() => setLogs([])} disabled={!logs.length}><Eraser /> Effacer</button>
            </div>
            {logs.length === 0 ? <div className="console-line faint">Aucun message. Utilise console.log() dans script.js.</div>
              : logs.map((l, i) => <div key={i} className={`console-line ${l.level}`}>{l.text}</div>)}
          </div>
        </section>

        {aiOpen && (
          <section className="ai-pane" aria-label="Assistant de code">
            <div className="pane-head">
              <span className="row"><Sparkles size={15} style={{ color: "var(--accent)" }} /> Codex BCX <span className="codex-live-badge">IA de programmation</span></span>
              <button className="btn btn-ghost btn-sm" onClick={() => setAiOpen(false)} aria-label="Fermer l'assistant"><X /></button>
            </div>
            <div className="ai-pane-body">
              {!aiReply && !aiLoading && !aiError && (
                <p className="muted" style={{ fontSize: "var(--text-sm)" }}>
                  L&apos;assistant reçoit tes trois fichiers{errors ? " et les erreurs de la console" : ""}. Demande une amélioration de <b>{activeFile.name}</b>, puis applique le code proposé.
                </p>
              )}
              {aiLoading && <div className="row muted" style={{ fontSize: "var(--text-sm)" }}><span className="typing"><i /><i /><i /></span> Analyse du projet…</div>}
              {aiError && <div className="alert alert-danger"><X /><span>{aiError}</span></div>}
              {aiReply && (
                <>
                  <Markdown>{aiReply}</Markdown>
                  <button className="btn btn-primary btn-block" onClick={applyAI}><Wand /> Appliquer à {activeFile.name}</button>
                </>
              )}
            </div>
            <form className="ai-pane-form codex-composer" onSubmit={askAI}>
              <textarea className="textarea codex-composer-input" rows={2} maxLength={4000} value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)} aria-label="Message à Codex BCX" placeholder={`Demande à Codex BCX de modifier ${activeFile.name}…`}
                onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); (e.currentTarget.form as HTMLFormElement).requestSubmit(); } }} />
              <div className="codex-composer-footer"><span className="codex-composer-hint">Entrée pour une nouvelle ligne · Ctrl/⌘ + Entrée pour envoyer</span><button className="btn btn-primary codex-composer-send" type="submit" disabled={aiLoading || !aiPrompt.trim()} aria-label={aiLoading ? "Codex BCX réfléchit" : "Envoyer à Codex BCX"}>{aiLoading ? <span className="typing"><i /><i /><i /></span> : <><Sparkles size={15} /> Envoyer</>}</button></div>
            </form>
          </section>
        )}
      </div>
    </main>
  );
}

function slug(v: string) {
  return v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

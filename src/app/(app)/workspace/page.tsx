"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { javascript } from "@codemirror/lang-javascript";
import { EditorView } from "@codemirror/view";
import { Play, Plus, Save, Sparkles, Terminal, Eye, Code2, Loader2, FileCode2, RefreshCw } from "lucide-react";

type WorkspaceFile = { id: string; name: string; language: "html" | "css" | "javascript" | "typescript" | "python"; content: string };
type RunResult = { stdout?: string; stderr?: string; exitCode?: number; timedOut?: boolean; durationMs?: number };

const STORAGE_KEY = "bcx_cloud_ide_v1";
const STARTER_FILES: WorkspaceFile[] = [
  { id: "html", name: "index.html", language: "html", content: "<main>\n  <h1>Bienvenue dans BCX IDE</h1>\n  <p>Votre espace de développement cloud.</p>\n</main>" },
  { id: "css", name: "style.css", language: "css", content: "body { font-family: system-ui, sans-serif; padding: 2rem; }\nh1 { color: #c49a45; }" },
  { id: "js", name: "script.js", language: "javascript", content: "console.log('BCX IDE prêt');" },
  { id: "py", name: "main.py", language: "python", content: "print('Bienvenue dans BICKRI CODEX SYSTEM')\n" },
];

const languageExtension = (language: WorkspaceFile["language"]) => {
  if (language === "html") return html();
  if (language === "css") return css();
  if (language === "javascript") return javascript();
  if (language === "typescript") return javascript({ typescript: true });
  return [];
};

export default function WorkspacePage() {
  const [files, setFiles] = useState(STARTER_FILES);
  const [activeId, setActiveId] = useState("html");
  const [loaded, setLoaded] = useState(false);
  const [panel, setPanel] = useState<"preview" | "terminal">("preview");
  const [output, setOutput] = useState("Prêt. Sélectionne un fichier puis lance ton code.");
  const [running, setRunning] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [answer, setAnswer] = useState("");
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState("");

  const activeFile = files.find((file) => file.id === activeId) ?? files[0];
  const htmlFile = files.find((file) => file.language === "html");
  const cssFile = files.find((file) => file.language === "css");
  const jsFile = files.find((file) => file.name === "script.js" || file.name === "app.js");
  const preview = useMemo(() => {
    const body = htmlFile?.content ?? "<p>Ajoute un fichier HTML pour afficher l’aperçu.</p>";
    const styles = (cssFile?.content ?? "").replace(/<\/style/gi, "");
    const script = (jsFile?.content ?? "").replace(/<\/script/gi, "");
    if (/<html[\s>]/i.test(body)) {
      return body.replace("</head>", `<style>${styles}</style></head>`).replace("</body>", `<script>${script}</script></body>`);
    }
    return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${styles}</style></head><body>${body}<script>${script}</script></body></html>`;
  }, [htmlFile, cssFile, jsFile]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const data = JSON.parse(saved) as { files?: WorkspaceFile[]; activeId?: string };
        if (Array.isArray(data.files) && data.files.length) setFiles(data.files);
        if (typeof data.activeId === "string") setActiveId(data.activeId);
      }
    } catch { /* workspace corrompu : utiliser le modèle de départ */ }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ files, activeId })); } catch { setError("Stockage local indisponible ou quota atteint."); }
  }, [files, activeId, loaded]);

  function updateFile(content: string) {
    setFiles((current) => current.map((file) => file.id === activeId ? { ...file, content } : file));
  }

  function addFile() {
    const name = window.prompt("Nom du fichier (ex. app.js, main.py, page.html)");
    if (!name?.trim()) return;
    const clean = name.trim().replace(/[^a-zA-Z0-9._-]/g, "-");
    if (files.some((file) => file.name === clean)) { setError("Ce fichier existe déjà."); return; }
    const ext = clean.split(".").pop()?.toLowerCase();
    const language: WorkspaceFile["language"] = ext === "html" ? "html" : ext === "css" ? "css" : ext === "py" ? "python" : ext === "ts" ? "typescript" : "javascript";
    const file = { id: crypto.randomUUID(), name: clean, language, content: "" };
    setFiles((current) => [...current, file]);
    setActiveId(file.id);
    setError("");
  }

  async function execute() {
    if (!["python", "javascript", "typescript"].includes(activeFile.language)) {
      setOutput("Choisis un fichier Python, JavaScript ou TypeScript pour lancer une exécution isolée. Les fichiers HTML/CSS s'affichent dans Aperçu.");
      setPanel("terminal");
      return;
    }
    setRunning(true); setError(""); setOutput("Exécution dans le runner isolé BCX…"); setPanel("terminal");
    try {
      const response = await fetch("/api/ai/execute", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language: activeFile.language, code: activeFile.content }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Échec de l’exécution.");
      const result = data.result as RunResult;
      setOutput([result.stdout, result.stderr ? "STDERR:\n" + result.stderr : "", `Code de sortie : ${result.exitCode ?? "inconnu"}`, result.timedOut ? "Temps d’exécution dépassé." : "", result.durationMs ? `Durée : ${result.durationMs} ms` : ""].filter(Boolean).join("\n") || "Aucune sortie.");
    } catch (e) {
      setOutput(e instanceof Error ? e.message : "Runner indisponible.");
    } finally { setRunning(false); }
  }

  async function askAI(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!prompt.trim() || asking) return;
    setAsking(true); setAnswer(""); setError("");
    try {
      const response = await fetch("/api/ai/code", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          language: activeFile.language,
          projectContext: files.map((file) => `--- ${file.name} ---\n${file.content.slice(0, 5000)}`).join("\n").slice(0, 12000),
          messages: [{ role: "user", content: prompt.trim() }],
          thinkingMode: "deep",
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Assistant IA indisponible.");
      setAnswer(String(data.answer ?? "Aucune réponse."));
    } catch (e) { setError(e instanceof Error ? e.message : "Erreur IA."); }
    finally { setAsking(false); }
  }

  function downloadProject() {
    const blob = new Blob([JSON.stringify({ name: "BCX workspace", files }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a"); link.href = url; link.download = "bcx-workspace.json"; link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="bcx-ide">
      <header className="bcx-ide-head">
        <div><div className="bcx-eyebrow">BICKRI CODEX SYSTEM</div><h1>Cloud IDE</h1><p>Édite, exécute et prévisualise ton projet depuis un seul espace.</p></div>
        <div className="bcx-head-actions">
          <button className="bcx-btn bcx-btn-quiet" onClick={downloadProject}><Save size={16}/> Exporter</button>
          <button className="bcx-btn bcx-btn-primary" onClick={execute} disabled={running}>{running ? <Loader2 className="bcx-spin" size={16}/> : <Play size={16}/>} Exécuter</button>
        </div>
      </header>

      <section className="bcx-workspace">
        <aside className="bcx-files">
          <div className="bcx-section-title"><span>EXPLORATEUR</span><button title="Ajouter un fichier" onClick={addFile}><Plus size={16}/></button></div>
          <div className="bcx-project-label"><Code2 size={14}/> mon-projet-bcx</div>
          {files.map((file) => <button key={file.id} className={`bcx-file ${activeId === file.id ? "active" : ""}`} onClick={() => setActiveId(file.id)}><FileCode2 size={15}/><span>{file.name}</span></button>)}
          <div className="bcx-files-foot">Sauvegarde automatique locale</div>
        </aside>

        <section className="bcx-editor-column">
          <div className="bcx-tabs"><div className="bcx-tab"><FileCode2 size={14}/>{activeFile.name}<span className="bcx-dot"/></div><span className="bcx-language">{activeFile.language.toUpperCase()}</span></div>
          <div className="bcx-editor">
            <CodeMirror value={activeFile.content} onChange={updateFile} height="100%" extensions={[languageExtension(activeFile.language), EditorView.lineWrapping]} theme="dark" basicSetup={{ lineNumbers: true, foldGutter: true, autocompletion: true, bracketMatching: true, closeBrackets: true, tabSize: 2 }}/>
          </div>
          <div className="bcx-bottom">
            <div className="bcx-panel-tabs">
              <button className={panel === "preview" ? "selected" : ""} onClick={() => setPanel("preview")}><Eye size={14}/> Aperçu</button>
              <button className={panel === "terminal" ? "selected" : ""} onClick={() => setPanel("terminal")}><Terminal size={14}/> Terminal</button>
              <button onClick={() => { setPanel("preview"); setError(""); }}><RefreshCw size={14}/> Actualiser</button>
            </div>
            <div className="bcx-panel-content">
              {panel === "preview" ? <iframe title="Aperçu du projet BCX" sandbox="allow-scripts" srcDoc={preview} /> : <pre>{output}</pre>}
            </div>
          </div>
        </section>

        <aside className="bcx-assistant">
          <div className="bcx-assistant-title"><Sparkles size={17}/> BCX AI <span>Approfondi</span></div>
          <p className="bcx-assistant-hint">Décris une fonctionnalité, demande une explication ou une amélioration du fichier ouvert.</p>
          <form onSubmit={askAI}>
            <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Ex. : explique ce code et propose une amélioration…" rows={5}/>
            <button className="bcx-btn bcx-btn-primary" type="submit" disabled={asking || !prompt.trim()}>{asking ? <Loader2 className="bcx-spin" size={16}/> : <Sparkles size={16}/>} Demander à BCX</button>
          </form>
          {error && <div className="bcx-error" role="alert">{error}</div>}
          <div className="bcx-ai-answer">{answer || "Les réponses de BCX AI apparaîtront ici. Les modifications de fichiers restent sous ton contrôle."}</div>
        </aside>
      </section>

      <style jsx>{`
        .bcx-ide{padding:28px;min-height:calc(100vh - 80px);color:var(--text)}
        .bcx-ide-head{display:flex;justify-content:space-between;align-items:center;gap:18px;margin-bottom:22px}
        .bcx-eyebrow{font-size:10px;letter-spacing:.16em;color:var(--accent);font-weight:800}
        .bcx-ide h1{font-size:28px;margin:5px 0;font-weight:750;letter-spacing:-.04em}
        .bcx-ide-head p{color:var(--text-muted);margin:0;font-size:13px}
        .bcx-head-actions{display:flex;gap:9px}
        .bcx-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;border:1px solid var(--border);border-radius:10px;padding:10px 13px;font-size:12px;font-weight:700;cursor:pointer}
        .bcx-btn:disabled{opacity:.55;cursor:not-allowed}
        .bcx-btn-primary{background:var(--accent);color:#15120b;border-color:var(--accent)}
        .bcx-btn-quiet{background:var(--surface);color:var(--text)}
        .bcx-workspace{display:grid;grid-template-columns:205px minmax(0,1fr) 285px;min-height:690px;height:calc(100vh - 190px);border:1px solid var(--border);border-radius:15px;overflow:hidden;background:var(--surface)}
        .bcx-files,.bcx-assistant{background:var(--surface);padding:13px;min-width:0}
        .bcx-files{border-right:1px solid var(--border)}
        .bcx-section-title{display:flex;justify-content:space-between;align-items:center;color:var(--text-faint);font-size:10px;font-weight:800;letter-spacing:.12em;margin:3px 0 17px}
        .bcx-section-title button{background:transparent;border:0;color:var(--text-muted);cursor:pointer}
        .bcx-project-label{display:flex;gap:7px;align-items:center;font-size:12px;font-weight:750;margin-bottom:10px}
        .bcx-file{width:100%;display:flex;align-items:center;gap:8px;text-align:left;padding:8px;border:0;border-radius:7px;background:transparent;color:var(--text-muted);font-size:12px;cursor:pointer}
        .bcx-file.active{background:var(--accent-soft);color:var(--text)}
        .bcx-files-foot{font-size:10px;color:var(--text-faint);margin-top:18px}
        .bcx-editor-column{display:flex;flex-direction:column;min-width:0;min-height:0}
        .bcx-tabs{height:39px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;padding:0 13px}
        .bcx-tab{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--text)}
        .bcx-dot{width:6px;height:6px;border-radius:50%;background:var(--accent)}
        .bcx-language{font-size:9px;color:var(--text-faint);letter-spacing:.1em}
        .bcx-editor{height:55%;min-height:240px;overflow:auto}
        .bcx-editor :global(.cm-editor){height:100%;font-size:12px}
        .bcx-bottom{height:45%;min-height:190px;border-top:1px solid var(--border);display:flex;flex-direction:column}
        .bcx-panel-tabs{display:flex;gap:14px;padding:9px 13px;border-bottom:1px solid var(--border)}
        .bcx-panel-tabs button{display:flex;align-items:center;gap:6px;background:transparent;border:0;color:var(--text-faint);font-size:11px;cursor:pointer}
        .bcx-panel-tabs button.selected{color:var(--accent)}
        .bcx-panel-content{flex:1;min-height:0;background:var(--bg)}
        .bcx-panel-content iframe{width:100%;height:100%;border:0;background:white}
        .bcx-panel-content pre{height:100%;overflow:auto;margin:0;padding:14px;color:var(--text-muted);font:11px/1.6 var(--font-mono);white-space:pre-wrap}
        .bcx-assistant{border-left:1px solid var(--border);display:flex;flex-direction:column;gap:12px}
        .bcx-assistant-title{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:800}
        .bcx-assistant-title svg{color:var(--accent)}
        .bcx-assistant-title span{margin-left:auto;color:var(--text-faint);font-size:9px;font-weight:600}
        .bcx-assistant-hint{font-size:11px;line-height:1.6;color:var(--text-muted);margin:0}
        .bcx-assistant form{display:grid;gap:9px}
        .bcx-assistant textarea{width:100%;resize:vertical;background:var(--bg);border:1px solid var(--border);border-radius:9px;padding:10px;color:var(--text);font:12px/1.5 inherit}
        .bcx-ai-answer{border:1px solid var(--border);border-radius:9px;padding:11px;color:var(--text-muted);font-size:11px;line-height:1.65;white-space:pre-wrap;overflow:auto;max-height:350px}
        .bcx-error{color:#ef7777;font-size:11px}
        .bcx-spin{animation:bcx-spin 1s linear infinite}
        @keyframes bcx-spin{to{transform:rotate(360deg)}}
        @media(max-width:1050px){.bcx-workspace{grid-template-columns:170px minmax(0,1fr);height:auto;min-height:800px}.bcx-assistant{grid-column:1/-1;border-left:0;border-top:1px solid var(--border);min-height:260px}.bcx-editor-column{min-height:690px}}
        @media(max-width:650px){.bcx-ide{padding:16px 12px 90px}.bcx-ide-head{align-items:flex-start;flex-direction:column}.bcx-ide h1{font-size:24px}.bcx-head-actions{width:100%}.bcx-head-actions button{flex:1}.bcx-workspace{display:flex;flex-direction:column;min-height:0}.bcx-files{border-right:0;border-bottom:1px solid var(--border);max-height:155px;overflow:auto}.bcx-editor-column{height:680px;min-height:680px}.bcx-assistant{border-top:1px solid var(--border)}.bcx-editor{height:48%}.bcx-bottom{height:52%}}
      `}</style>
    </main>
  );
}

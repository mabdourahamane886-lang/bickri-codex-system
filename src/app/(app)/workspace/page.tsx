"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { javascript } from "@codemirror/lang-javascript";
import { EditorView } from "@codemirror/view";
import { Play, Plus, Save, Sparkles, Terminal, Eye, Code2, Loader2, FileCode2, RefreshCw, Download, Rocket, Smartphone, XCircle } from "lucide-react";

type WorkspaceFile = { id: string; name: string; language: "html" | "css" | "javascript" | "typescript" | "python" | "dart" | "yaml"; content: string };
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
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [cloudStatus, setCloudStatus] = useState<"checking" | "local" | "saving" | "synced" | "offline">("checking");
  const [panel, setPanel] = useState<"preview" | "terminal">("preview");
  const [output, setOutput] = useState("Prêt. Sélectionne un fichier puis lance ton code.");
  const [running, setRunning] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [answer, setAnswer] = useState("");
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState("");
  const [terminalSessionId, setTerminalSessionId] = useState<string | null>(null);
  const [terminalInput, setTerminalInput] = useState("");
  const [terminalBusy, setTerminalBusy] = useState(false);
  const [terminalOutput, setTerminalOutput] = useState("Terminal persistant : démarre une session pour ouvrir un conteneur isolé.");
  const [buildTarget, setBuildTarget] = useState<"apk" | "aab">("apk");
  const [buildId, setBuildId] = useState<string | null>(null);
  const [buildStatus, setBuildStatus] = useState("idle");
  const [buildOutput, setBuildOutput] = useState("");
  const [deployBusy, setDeployBusy] = useState(false);
  const [deployMessage, setDeployMessage] = useState("");
  const [deploymentStatus, setDeploymentStatus] = useState("");
  const [deploymentUrl, setDeploymentUrl] = useState("");
  const [statusBusy, setStatusBusy] = useState(false);

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
    let cancelled = false;
    async function initialize() {
      let initialFiles = STARTER_FILES;
      let initialActiveId = "html";
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const data = JSON.parse(saved) as { files?: WorkspaceFile[]; activeId?: string };
          if (Array.isArray(data.files) && data.files.length) initialFiles = data.files;
          if (typeof data.activeId === "string") initialActiveId = data.activeId;
        const savedTerminal = localStorage.getItem("bcx_terminal_session_v1");
        if (savedTerminal && /^[0-9a-f-]{36}$/i.test(savedTerminal)) setTerminalSessionId(savedTerminal);
        }
      } catch { /* données locales illisibles : utiliser le modèle de départ */ }
      if (cancelled) return;
      setFiles(initialFiles);
      setActiveId(initialActiveId);
      try {
        const response = await fetch("/api/workspaces", { cache: "no-store" });
        if (response.ok) {
          const data = await response.json() as { workspaces?: Array<{ id: string; files: WorkspaceFile[] }> };
          const current = data.workspaces?.[0];
          if (current && Array.isArray(current.files) && current.files.length) {
            setFiles(current.files);
            setActiveId(current.files.some((file) => file.id === initialActiveId) ? initialActiveId : current.files[0].id);
            setWorkspaceId(current.id);
            setCloudStatus("synced");
          } else {
            const created = await fetch("/api/workspaces", {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ name: "Mon projet BCX", files: initialFiles }),
            });
            const result = await created.json();
            if (created.ok && result.workspace?.id) {
              setWorkspaceId(result.workspace.id);
              setCloudStatus("synced");
            } else setCloudStatus("local");
          }
        } else setCloudStatus("local");
      } catch { if (!cancelled) setCloudStatus("offline"); }
      if (!cancelled) setLoaded(true);
    }
    void initialize();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ files, activeId })); }
    catch { setError("Stockage local indisponible ou quota atteint."); }
    if (!workspaceId) return;
    const timer = window.setTimeout(async () => {
      setCloudStatus("saving");
      try {
        const response = await fetch("/api/workspaces", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: workspaceId, name: "Mon projet BCX", files }),
        });
        if (!response.ok) throw new Error("Cloud sync failed");
        setCloudStatus("synced");
      } catch { setCloudStatus("offline"); }
    }, 900);
    return () => window.clearTimeout(timer);
  }, [files, activeId, loaded, workspaceId]);

  async function startTerminal() {
    if (terminalBusy || terminalSessionId) return;
    setTerminalBusy(true); setError("");
    try {
      const response = await fetch("/api/terminal", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "open", files: files.map((file) => ({ path: file.name, content: file.content })) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Impossible de démarrer le terminal.");
      setTerminalSessionId(data.sessionId);
      localStorage.setItem("bcx_terminal_session_v1", data.sessionId);
      setTerminalOutput("Session démarrée. Conteneur isolé prêt dans /workspace.\n");
    } catch (e) { setTerminalOutput(e instanceof Error ? e.message : "Terminal indisponible."); }
    finally { setTerminalBusy(false); }
  }

  useEffect(() => {
    if (!terminalSessionId) return;
    let stopped = false;
    const touch = async () => {
      try {
        const response = await fetch("/api/terminal", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "touch", sessionId: terminalSessionId }),
        });
        if (!response.ok && !stopped) {
          setTerminalSessionId(null);
          localStorage.removeItem("bcx_terminal_session_v1");
          setTerminalOutput((old) => old + "\nSession expirée. Démarre un nouveau terminal.\n");
        }
      } catch { /* le prochain heartbeat réessaiera */ }
    };
    void touch();
    const timer = window.setInterval(() => { void touch(); }, 5 * 60_000);
    return () => { stopped = true; window.clearInterval(timer); };
  }, [terminalSessionId]);

  async function runTerminalCommand(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const command = terminalInput.trim();
    if (!command || !terminalSessionId || terminalBusy) return;
    setTerminalBusy(true); setTerminalInput("");
    setTerminalOutput((old) => old + "\n$ " + command + "\n");
    try {
      const response = await fetch("/api/terminal", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "command", sessionId: terminalSessionId, command }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Commande refusée.");
      setTerminalOutput((old) => old + (data.stdout || "") + (data.stderr ? "\n" + data.stderr : "") + "\n[exit " + data.exitCode + "] " + (data.cwd || "") + "\n");
    } catch (e) { setTerminalOutput((old) => old + (e instanceof Error ? e.message : "Erreur terminal.") + "\n"); }
    finally { setTerminalBusy(false); }
  }

  async function closeTerminal() {
    if (!terminalSessionId) return;
    setTerminalBusy(true);
    try {
      await fetch("/api/terminal?sessionId=" + encodeURIComponent(terminalSessionId), { method: "DELETE" });
      setTerminalSessionId(null);
      localStorage.removeItem("bcx_terminal_session_v1");
      setTerminalOutput((old) => old + "\nSession fermée.\n");
    } catch { setTerminalOutput((old) => old + "\nImpossible de fermer la session. Elle expirera automatiquement.\n"); }
    finally { setTerminalBusy(false); }
  }

  async function startFlutterBuild() {
    if (buildStatus === "building" || buildStatus === "queued") return;
    if (!files.some((file) => file.name === "pubspec.yaml")) {
      setBuildOutput("Ajoute le fichier pubspec.yaml et les sources Flutter avant de compiler.");
      setBuildStatus("error"); return;
    }
    setBuildStatus("queued"); setBuildOutput("Envoi du projet au compilateur Flutter isolé…");
    try {
      const response = await fetch("/api/builds/flutter", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: buildTarget, files: files.map((file) => ({ path: file.name, content: file.content })) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Compilation non démarrée.");
      setBuildId(data.buildId); setBuildStatus(data.status || "queued");
      setBuildOutput("Compilation ajoutée à la file. Le statut sera actualisé automatiquement.");
    } catch (e) { setBuildStatus("error"); setBuildOutput(e instanceof Error ? e.message : "Service Flutter indisponible."); }
  }

  useEffect(() => {
    if (!buildId || !["queued", "building"].includes(buildStatus)) return;
    let cancelled = false;
    const timer = window.setInterval(async () => {
      try {
        const response = await fetch("/api/builds/flutter?buildId=" + encodeURIComponent(buildId), { cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Statut de compilation indisponible.");
        if (cancelled) return;
        setBuildStatus(data.status);
        setBuildOutput([data.output, data.error].filter(Boolean).join("\n").slice(-12000) || "Compilation en cours…");
      } catch (e) {
        if (!cancelled) { setBuildStatus("error"); setBuildOutput(e instanceof Error ? e.message : "Erreur de suivi."); }
      }
    }, 3500);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [buildId, buildStatus]);

  async function deployPreview() {
    if (deployBusy) return;
    setDeployBusy(true); setDeployMessage("Déclenchement du déploiement Preview…");
    try {
      const response = await fetch("/api/deployments/preview", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Déploiement refusé.");
      setDeployMessage(data.message || "Hook Preview accepté par Vercel.");
    } catch (e) { setDeployMessage(e instanceof Error ? e.message : "Déploiement indisponible."); }
    finally { setDeployBusy(false); }
  }

  async function refreshPreviewStatus() {
    if (statusBusy) return;
    setStatusBusy(true);
    try {
      const response = await fetch("/api/deployments/preview", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Suivi Vercel indisponible.");
      const latest = data.deployments?.[0];
      if (!latest) { setDeploymentStatus("Aucun déploiement Preview récent."); setDeploymentUrl(""); }
      else {
        setDeploymentStatus(String(latest.state || "UNKNOWN"));
        setDeploymentUrl(typeof latest.url === "string" ? latest.url : "");
      }
    } catch (e) { setDeploymentStatus(e instanceof Error ? e.message : "Suivi indisponible."); }
    finally { setStatusBusy(false); }
  }

  function downloadFlutterArtifact() {
    if (!buildId) return;
    const link = document.createElement("a");
    link.href = "/api/builds/flutter/artifact?buildId=" + encodeURIComponent(buildId);
    link.download = buildTarget === "apk" ? "app-release.apk" : "app-release.aab";
    link.click();
  }

  function updateFile(content: string) {
    setFiles((current) => current.map((file) => file.id === activeId ? { ...file, content } : file));
  }

  function addFile() {
    const name = window.prompt("Nom ou chemin (ex. app.js, lib/main.dart, pubspec.yaml)");
    if (!name?.trim()) return;
    const clean = name.trim().replace(/\\/g, "/").replace(/[^a-zA-Z0-9._/-]/g, "-").replace(/\/+/g, "/");
    if (clean.startsWith("/") || clean.split("/").some((part) => !part || part === "." || part === "..")) { setError("Chemin de fichier invalide."); return; }
    if (files.some((file) => file.name === clean)) { setError("Ce fichier existe déjà."); return; }
    const ext = clean.split(".").pop()?.toLowerCase();
    const language: WorkspaceFile["language"] = ext === "html" ? "html" : ext === "css" ? "css" : ext === "py" ? "python" : ext === "ts" ? "typescript" : ext === "dart" ? "dart" : ext === "yaml" || ext === "yml" ? "yaml" : "javascript";
    const file = { id: crypto.randomUUID(), name: clean, language, content: "" };
    setFiles((current) => [...current, file]);
    setActiveId(file.id);
    setError("");
  }

  function createFlutterStarter() {
    const starter: WorkspaceFile[] = [
      { id: crypto.randomUUID(), name: "pubspec.yaml", language: "yaml", content: "name: bcx_flutter_app\ndescription: Application Flutter créée avec BICKRI CODEX SYSTEM\npublish_to: 'none'\nversion: 1.0.0+1\nenvironment:\n  sdk: '>=3.3.0 <4.0.0'\ndependencies:\n  flutter:\n    sdk: flutter\ndev_dependencies:\n  flutter_test:\n    sdk: flutter\nflutter:\n  uses-material-design: true\n" },
      { id: crypto.randomUUID(), name: "lib/main.dart", language: "dart", content: "import 'package:flutter/material.dart';\n\nvoid main() {\n  runApp(const BCXApp());\n}\n\nclass BCXApp extends StatelessWidget {\n  const BCXApp({super.key});\n\n  @override\n  Widget build(BuildContext context) {\n    return MaterialApp(\n      title: 'BCX Flutter App',\n      debugShowCheckedModeBanner: false,\n      theme: ThemeData(colorSchemeSeed: const Color(0xFFC49A45), useMaterial3: true),\n      home: Scaffold(\n        appBar: AppBar(title: const Text('BICKRI CODEX SYSTEM')),\n        body: const Center(child: Text('Mon application Flutter BCX')),\n      ),\n    );\n  }\n}\n" },
    ];
    setFiles((current) => [...current.filter((file) => !starter.some((item) => item.name === file.name)), ...starter]);
    setActiveId(starter[1].id);
    setBuildStatus("idle"); setBuildId(null); setBuildOutput("");
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
        <div><div className="bcx-eyebrow">BICKRI CODEX SYSTEM</div><h1>Cloud IDE</h1><p>Édite, exécute et prévisualise ton projet depuis un seul espace.</p><div className="bcx-cloud-status" aria-live="polite">{cloudStatus === "checking" ? "Vérification du cloud…" : cloudStatus === "saving" ? "Synchronisation…" : cloudStatus === "synced" ? "✓ Projet synchronisé" : cloudStatus === "offline" ? "Cloud indisponible · copie locale conservée" : "Mode local · connexion requise pour le cloud"}</div></div>
        <div className="bcx-head-actions">
          <button className="bcx-btn bcx-btn-quiet" onClick={downloadProject}><Save size={16}/> Exporter</button>
          <button className="bcx-btn bcx-btn-quiet" onClick={deployPreview} disabled={deployBusy}><Rocket size={16}/> Preview</button>
          <button className="bcx-btn bcx-btn-primary" onClick={execute} disabled={running}>{running ? <Loader2 className="bcx-spin" size={16}/> : <Play size={16}/>} Exécuter</button>
        </div>
      </header>

      <section className="bcx-workspace">
        <aside className="bcx-files">
          <div className="bcx-section-title"><span>EXPLORATEUR</span><div><button title="Nouveau projet Flutter" onClick={createFlutterStarter}><Smartphone size={15}/></button><button title="Ajouter un fichier ou chemin" onClick={addFile}><Plus size={16}/></button></div></div>
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
              {panel === "preview" ? <iframe title="Aperçu du projet BCX" sandbox="allow-scripts" srcDoc={preview} /> : (
                <div className="bcx-terminal-panel">
                  <div className="bcx-terminal-toolbar">
                    <span>{terminalSessionId ? "Session active · /workspace" : "Aucune session active"}</span>
                    {terminalSessionId ? <button onClick={closeTerminal} disabled={terminalBusy}><XCircle size={13}/> Fermer</button> : <button onClick={startTerminal} disabled={terminalBusy}>{terminalBusy ? <Loader2 size={13} className="bcx-spin"/> : <Terminal size={13}/>} Démarrer</button>}
                  </div>
                  <pre>{terminalSessionId ? terminalOutput : output + "\n" + terminalOutput}</pre>
                  <form className="bcx-terminal-form" onSubmit={runTerminalCommand}>
                    <span>$</span>
                    <input value={terminalInput} onChange={(event) => setTerminalInput(event.target.value)} placeholder={terminalSessionId ? "Commande (ex. ls, npm test, python main.py)" : "Démarre une session pour saisir des commandes"} disabled={!terminalSessionId || terminalBusy}/>
                    <button type="submit" disabled={!terminalSessionId || terminalBusy || !terminalInput.trim()}>{terminalBusy ? <Loader2 size={14} className="bcx-spin"/> : <Play size={14}/>}</button>
                  </form>
                </div>
              )}
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
          <section className="bcx-build-card">
            <div className="bcx-build-title"><Smartphone size={15}/> Compilation Flutter / Android</div>
            <select value={buildTarget} onChange={(event) => setBuildTarget(event.target.value as "apk" | "aab")}><option value="apk">APK · Android</option><option value="aab">AAB · Google Play</option></select>
            <button className="bcx-btn bcx-btn-primary" onClick={startFlutterBuild} disabled={["queued","building"].includes(buildStatus)}>{["queued","building"].includes(buildStatus) ? <Loader2 size={14} className="bcx-spin"/> : <Play size={14}/>} Compiler</button>
            <div className="bcx-build-status" aria-live="polite">État : {buildStatus === "idle" ? "en attente" : buildStatus}</div>
            {buildOutput && <pre className="bcx-build-output">{buildOutput}</pre>}
            {buildStatus === "ready" && <button className="bcx-btn bcx-btn-quiet" onClick={downloadFlutterArtifact}><Download size={14}/> Télécharger {buildTarget.toUpperCase()}</button>}
          </section>
          {deployMessage && <div className="bcx-deploy-message" role="status">{deployMessage}<button className="bcx-btn bcx-btn-quiet" onClick={refreshPreviewStatus} disabled={statusBusy}>{statusBusy ? <Loader2 size={13} className="bcx-spin"/> : <RefreshCw size={13}/>} Suivre le build</button>{deploymentStatus && <div>Statut Vercel : {deploymentStatus}</div>}{deploymentUrl && <a href={deploymentUrl} target="_blank" rel="noreferrer">Ouvrir la Preview</a>}</div>}
        </aside>
      </section>

      <style jsx>{`
        .bcx-ide{padding:28px;min-height:calc(100vh - 80px);color:var(--text)}
        .bcx-ide-head{display:flex;justify-content:space-between;align-items:center;gap:18px;margin-bottom:22px}
        .bcx-eyebrow{font-size:10px;letter-spacing:.16em;color:var(--accent);font-weight:800}
        .bcx-ide h1{font-size:28px;margin:5px 0;font-weight:750;letter-spacing:-.04em}
        .bcx-ide-head p{color:var(--text-muted);margin:0;font-size:13px}
        .bcx-cloud-status{font-size:10px;color:var(--text-faint);margin-top:8px}.bcx-head-actions{display:flex;gap:9px}
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
        .bcx-terminal-panel{height:100%;display:flex;flex-direction:column;min-height:0}
        .bcx-terminal-toolbar{display:flex;align-items:center;justify-content:space-between;padding:8px 12px;border-bottom:1px solid var(--border);font-size:10px;color:var(--text-faint)}
        .bcx-terminal-toolbar button,.bcx-terminal-form button{display:inline-flex;align-items:center;gap:5px;border:1px solid var(--border);background:var(--surface);color:var(--text);border-radius:7px;padding:5px 8px;font-size:10px;cursor:pointer}
        .bcx-terminal-panel>pre{flex:1;min-height:0}
        .bcx-terminal-form{display:flex!important;grid-template-columns:none!important;align-items:center;gap:8px!important;padding:9px 12px;border-top:1px solid var(--border);color:var(--accent)}
        .bcx-terminal-form input{flex:1;min-width:0;background:transparent;border:0;outline:none;color:var(--text);font:11px var(--font-mono)}
        .bcx-terminal-form button:disabled{opacity:.45}
        .bcx-build-card{display:grid;gap:8px;border:1px solid var(--border);border-radius:10px;padding:11px}
        .bcx-build-title{display:flex;align-items:center;gap:7px;font-size:11px;font-weight:800}
        .bcx-build-card select{width:100%;background:var(--bg);color:var(--text);border:1px solid var(--border);border-radius:8px;padding:8px;font-size:11px}
        .bcx-build-status{font-size:10px;color:var(--text-faint);text-transform:capitalize}
        .bcx-build-output{max-height:140px;overflow:auto;background:var(--bg);padding:8px;border-radius:7px;font:10px/1.5 var(--font-mono);white-space:pre-wrap}
        .bcx-deploy-message{display:grid;gap:7px;font-size:10px;color:var(--text-muted);line-height:1.5}.bcx-deploy-message a{color:var(--accent);text-decoration:underline}
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

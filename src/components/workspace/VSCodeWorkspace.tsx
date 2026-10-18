"use client";

import Link from "next/link";
import { useState } from "react";
import {
  Bot, Braces, ChevronDown, ChevronRight, Circle, Code2,
  FileCode2, Folder, GitBranch,
  PanelBottom, Play, Search, Settings2, ShieldCheck, Sparkles,
  X, Paperclip, Send,
} from "lucide-react";

const files = [
  { name: "page.tsx", path: "src/app/page.tsx", color: "#69b7ff", icon: FileCode2 },
  { name: "layout.tsx", path: "src/app/layout.tsx", color: "#69b7ff", icon: FileCode2 },
  { name: "globals.css", path: "src/app/globals.css", color: "#d7a8ff", icon: Braces },
  { name: "route.ts", path: "src/app/api/ai/route.ts", color: "#e2bf6d", icon: FileCode2 },
];

const codeByFile: Record<string, { n: string; text: string; color: string }[]> = {
  "page.tsx": [
    { n: "1", text: 'import { Sparkles } from "lucide-react";', color: "code-purple" },
    { n: "2", text: 'import { Button } from "@/components/ui/button";', color: "code-purple" },
    { n: "3", text: "", color: "" },
    { n: "4", text: "export default function Workspace() {", color: "code-blue" },
    { n: "5", text: "  return (", color: "" },
    { n: "6", text: '    <main className="workspace">', color: "code-green" },
    { n: "7", text: "      <Sparkles aria-hidden />", color: "code-green" },
    { n: "8", text: '      <h1>Construis sans limites</h1>', color: "code-green" },
    { n: "9", text: "      <Button>Commencer</Button>", color: "code-green" },
    { n: "10", text: "    </main>", color: "code-green" },
    { n: "11", text: "  );", color: "" },
    { n: "12", text: "}", color: "code-blue" },
  ],
  "layout.tsx": [
    { n: "1", text: 'import type { Metadata } from "next";', color: "code-purple" },
    { n: "2", text: 'import "./globals.css";', color: "code-purple" },
    { n: "3", text: "", color: "" },
    { n: "4", text: "export const metadata: Metadata = {", color: "code-blue" },
    { n: "5", text: '  title: "Bickri Codex System",', color: "code-green" },
    { n: "6", text: '  description: "Votre espace de développement.",', color: "code-green" },
    { n: "7", text: "};", color: "code-blue" },
  ],
  "globals.css": [
    { n: "1", text: ":root {", color: "code-blue" },
    { n: "2", text: "  --bg: #0a0d13;", color: "code-green" },
    { n: "3", text: "  --accent: #5ad8e6;", color: "code-green" },
    { n: "4", text: "  --font-mono: ui-monospace, monospace;", color: "code-green" },
    { n: "5", text: "}", color: "code-blue" },
  ],
};

export function VSCodeWorkspace() {
  const [activeFile, setActiveFile] = useState("page.tsx");
  const [panel, setPanel] = useState<"terminal" | "problems" | "output">("terminal");
  const [sidebarMode, setSidebarMode] = useState<"files" | "search" | "git" | "extensions">("files");
  const [assistantPrompt, setAssistantPrompt] = useState("");
  const [assistantMessages, setAssistantMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([
    { role: "assistant", content: "Bonjour. Je peux expliquer votre code, préparer un diff ou vous aider à corriger une erreur. Les modifications ne sont jamais appliquées sans votre confirmation." },
  ]);
  const [assistantLoading, setAssistantLoading] = useState(false);
  const [assistantError, setAssistantError] = useState("");
  const selected = files.find((file) => file.name === activeFile) ?? files[0];

  async function askAssistant(event: React.FormEvent) {
    event.preventDefault();
    const content = assistantPrompt.trim();
    if (!content || assistantLoading) return;
    setAssistantPrompt("");
    setAssistantError("");
    setAssistantMessages((messages) => [...messages, { role: "user", content }]);
    setAssistantLoading(true);
    try {
      const response = await fetch("/api/ai/code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [...assistantMessages, { role: "user", content }], language: "TypeScript / Next.js", projectContext: activeCode.map((line) => line.text).join("\\n") }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "La réponse IA est indisponible.");
      setAssistantMessages((messages) => [...messages, { role: "assistant", content: data.answer || "Je n’ai pas trouvé de réponse." }]);
    } catch (error) {
      setAssistantError(error instanceof Error ? error.message : "Une erreur est survenue.");
    } finally {
      setAssistantLoading(false);
    }
  }
  const activeCode = codeByFile[activeFile] ?? codeByFile["page.tsx"];

  return (
    <main className="vscode-workspace">
      <header className="vscode-titlebar">
        <Link href="/" className="vscode-brand"><span className="vscode-brand-mark">B</span><span>BICKRI <b>CODEX</b></span></Link>
        <div className="vscode-command"><Search size={14} /><span>Rechercher des fichiers, commandes et symboles</span><kbd>Ctrl K</kbd></div>
        <div className="vscode-title-actions"><span className="vscode-connection"><Circle size={7} fill="currentColor" /> Cloud IDE</span><Link href="/settings" aria-label="Paramètres"><Settings2 size={17} /></Link></div>
      </header>

      <div className="vscode-workarea">
        <nav className="vscode-activitybar" aria-label="Outils de l’espace de travail">
          <button className={sidebarMode === "files" ? "active" : ""} onClick={() => setSidebarMode("files")} aria-label="Explorateur"><Folder /></button>
          <button className={sidebarMode === "search" ? "active" : ""} onClick={() => setSidebarMode("search")} aria-label="Recherche"><Search /></button>
          <button className={sidebarMode === "git" ? "active" : ""} onClick={() => setSidebarMode("git")} aria-label="Contrôle de code source"><GitBranch /></button>
          <button className="active" aria-label="Assistant BCX AI"><Bot /></button>
          <span className="vscode-activity-spacer" />
          <Link href="/settings" aria-label="Paramètres"><Settings2 /></Link>
        </nav>
        <aside className="vscode-explorer">
          <div className="vscode-side-heading"><span>{sidebarMode === "files" ? "EXPLORATEUR" : sidebarMode === "search" ? "RECHERCHE" : sidebarMode === "git" ? "CONTRÔLE DE CODE SOURCE" : "EXTENSIONS"}</span><MoreDots /></div>
          {sidebarMode === "files" ? <>
            <div className="vscode-tree-root"><ChevronDown size={14} /><Folder size={15} /> BICKRI-CODEX-SYSTEM</div>
            <div className="vscode-tree-folder"><ChevronDown size={13} /><Folder size={14} /> src</div>
            <div className="vscode-tree-folder nested"><ChevronDown size={13} /><Folder size={14} /> app</div>
            {files.map((file) => <button key={file.name} onClick={() => setActiveFile(file.name)} className={`vscode-tree-file ${activeFile === file.name ? "selected" : ""}`}><file.icon size={14} style={{ color: file.color }} /><span>{file.name}</span></button>)}
            <div className="vscode-tree-folder"><ChevronRight size={13} /><Folder size={14} /> components</div>
            <div className="vscode-tree-folder"><ChevronRight size={13} /><Folder size={14} /> lib</div>
            <div className="vscode-tree-file muted"><Braces size={14} /> package.json</div>
            <div className="vscode-tree-file muted"><ShieldCheck size={14} /> middleware.ts</div>
          </> : <div className="vscode-side-empty"><Search size={18} /><p>{sidebarMode === "search" ? "Recherche dans le projet" : sidebarMode === "git" ? "Suivi Git du projet" : "Extensions de l’IDE"}</p><small>Les outils connectés seront affichés ici.</small></div>}
          <div className="vscode-outline"><ChevronRight size={13} /> PLAN DE TRAVAIL</div>
          <div className="vscode-outline"><ChevronRight size={13} /> CHRONOLOGIE</div>
        </aside>

        <section className="vscode-editor-area">
          <div className="vscode-tabs">
            {files.slice(0, 3).map((file) => <button key={file.name} className={`vscode-tab ${activeFile === file.name ? "active" : ""}`} onClick={() => setActiveFile(file.name)}><file.icon size={14} style={{ color: file.color }} />{file.name}{activeFile === file.name && <X size={12} />}</button>)}
            <div className="vscode-tab-spacer" />
            <Link href="/studio" className="vscode-run"><Play size={14} fill="currentColor" /> Ouvrir le Studio</Link>
          </div>
          <div className="vscode-breadcrumb"><span>src</span><ChevronRight size={12} /><span>app</span><ChevronRight size={12} /><b>{selected.name}</b><span className="vscode-breadcrumb-right"><Code2 size={13} /> {selected.name.endsWith(".css") ? "CSS" : "TypeScript React"}</span></div>

          <div className="vscode-editor-content">
            <div className="vscode-line-numbers">{activeCode.map((line) => <span key={line.n}>{line.n}</span>)}</div>
            <pre className="vscode-code">{activeCode.map((line) => <span key={line.n} className={line.color}>{line.text || " "}{ "\n" }</span>)}</pre>
            <div className="vscode-editor-watermark"><span className="vscode-watermark-logo">B</span><p>Un espace pour construire vos idées.</p><small>BCX · Environnement de développement</small></div>
          </div>

          <div className="vscode-bottom-panel">
            <div className="vscode-panel-tabs">
              <button className={panel === "problems" ? "active" : ""} onClick={() => setPanel("problems")}>PROBLÈMES <span className="vscode-count">0</span></button>
              <button className={panel === "output" ? "active" : ""} onClick={() => setPanel("output")}>SORTIE</button>
              <button className={panel === "terminal" ? "active" : ""} onClick={() => setPanel("terminal")}>TERMINAL</button>
              <button className="vscode-panel-toggle" title="Panneau inférieur"><PanelBottom size={15} /></button>
            </div>
            {panel === "terminal" ? <div className="vscode-terminal-content"><span className="terminal-prompt">bickri@bcx</span><span className="terminal-path"> ~/bickri-codex-system</span><span className="terminal-dollar"> $ </span><span className="terminal-placeholder">Le terminal cloud sera disponible après configuration du moteur d’exécution.</span><span className="terminal-cursor" /></div> : <div className="vscode-panel-message">{panel === "problems" ? "Aucun problème détecté dans cet aperçu." : "Les sorties d’exécution apparaîtront ici."}</div>}
          </div>
          <footer className="vscode-statusbar"><span><GitBranch size={12} /> main</span><span><Circle size={8} fill="currentColor" /> Connecté à BCX</span><span className="status-spacer" /><span>Ln 8, Col 18</span><span>UTF-8</span><span>TypeScript React</span><span><ShieldCheck size={12} /> Protégé</span></footer>
        </section>

        <aside className="vscode-ai-panel" aria-label="Assistant Bickri Codex AI">
          <div className="vscode-ai-heading"><span><Bot size={15} /> BICKRI CODEX AI</span><span className="vscode-ai-status"><Circle size={7} fill="currentColor" /> PRÊT</span></div>
          <div className="vscode-ai-context"><FileCode2 size={13} /> Contexte : <b>{selected.name}</b><span>·</span><span>1 fichier sélectionné</span></div>
          <div className="vscode-ai-messages">
            {assistantMessages.map((message, index) => <div key={`${message.role}-${index}`} className={`vscode-ai-message ${message.role}`}><span className="vscode-ai-avatar">{message.role === "assistant" ? <Sparkles size={13} /> : "M"}</span><div><small>{message.role === "assistant" ? "BCX AI" : "Vous"}</small><p>{message.content}</p></div></div>)}
            {assistantLoading && <div className="vscode-ai-message assistant"><span className="vscode-ai-avatar"><Sparkles size={13} /></span><div><small>BCX AI</small><p className="vscode-ai-thinking">Analyse du contexte en cours…</p></div></div>}
          </div>
          <div className="vscode-ai-suggestions"><button type="button" onClick={() => setAssistantPrompt("Explique ce fichier")}>Expliquer le fichier</button><button type="button" onClick={() => setAssistantPrompt("Trouve les erreurs possibles")}>Détecter les erreurs</button></div>
          {assistantError && <p className="vscode-ai-error" role="alert">{assistantError}</p>}
          <form className="vscode-ai-composer" onSubmit={askAssistant}><textarea value={assistantPrompt} onChange={(event) => setAssistantPrompt(event.target.value)} placeholder="Demandez à BCX AI…" rows={2} aria-label="Message à BCX AI" /><div><button type="button" className="vscode-ai-tool" aria-label="Joindre un fichier"><Paperclip size={15} /></button><span className="vscode-ai-hint">Entrée pour envoyer</span><button type="submit" className="vscode-ai-send" aria-label="Envoyer" disabled={assistantLoading || !assistantPrompt.trim()}><Send size={15} /></button></div></form>
        </aside>
      </div>
      <div className="vscode-mobile-launcher"><Link href="/studio"><Code2 size={16} /> Studio</Link><Link href="/ai"><Bot size={16} /> BCX AI</Link><Link href="/registry"><Folder size={16} /> Projets</Link></div>
    </main>
  );
}

function MoreDots() {
  return <span className="vscode-more-dots" aria-hidden="true">•••</span>;
}

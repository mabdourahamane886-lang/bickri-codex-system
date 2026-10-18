"use client";

import Link from "next/link";
import { useState } from "react";
import {
  Activity, Bot, Braces, ChevronDown, ChevronRight, Circle, Code2, Command,
  FileCode2, Files, Folder, GitBranch, Globe, Hammer, LayoutDashboard,
  PanelBottom, Play, Search, Settings2, ShieldCheck, Sparkles, Terminal,
  WandSparkles, X,
} from "lucide-react";

const files = [
  { name: "page.tsx", path: "src/app/page.tsx", color: "#69b7ff", icon: FileCode2 },
  { name: "layout.tsx", path: "src/app/layout.tsx", color: "#69b7ff", icon: FileCode2 },
  { name: "globals.css", path: "src/app/globals.css", color: "#d7a8ff", icon: Braces },
  { name: "route.ts", path: "src/app/api/ai/route.ts", color: "#e2bf6d", icon: FileCode2 },
];

const sampleCode = [
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
];

export function VSCodeWorkspace() {
  const [activeFile, setActiveFile] = useState("page.tsx");
  const [panel, setPanel] = useState<"terminal" | "problems" | "output">("terminal");
  const [sidebarMode, setSidebarMode] = useState<"files" | "search" | "git" | "extensions">("files");
  const [showWelcome, setShowWelcome] = useState(true);
  const selected = files.find((file) => file.name === activeFile) ?? files[0];

  return (
    <main className="vscode-workspace">
      <header className="vscode-titlebar">
        <Link href="/" className="vscode-brand"><span className="vscode-brand-mark">B</span><span>BICKRI <b>CODEX</b></span></Link>
        <div className="vscode-command"><Search size={14} /><span>Rechercher des fichiers, commandes et symboles</span><kbd>Ctrl K</kbd></div>
        <div className="vscode-title-actions"><span className="vscode-connection"><Circle size={7} fill="currentColor" /> Cloud IDE</span><Link href="/settings" aria-label="Paramètres"><Settings2 size={17} /></Link></div>
      </header>

      <div className="vscode-workarea">
        <aside className="vscode-activitybar" aria-label="Activités">
          <button className={sidebarMode === "files" ? "active" : ""} onClick={() => setSidebarMode("files")} title="Explorateur"><Files /></button>
          <button className={sidebarMode === "search" ? "active" : ""} onClick={() => setSidebarMode("search")} title="Recherche"><Search /></button>
          <button className={sidebarMode === "git" ? "active" : ""} onClick={() => setSidebarMode("git")} title="Contrôle de code source"><GitBranch /></button>
          <button onClick={() => setSidebarMode("extensions")} className={sidebarMode === "extensions" ? "active" : ""} title="Extensions"><BlocksIcon /></button>
          <div className="vscode-activity-spacer" />
          <Link href="/settings" title="Paramètres"><Settings2 /></Link>
        </aside>

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
            <div className="vscode-line-numbers">{sampleCode.map((line) => <span key={line.n}>{line.n}</span>)}</div>
            <pre className="vscode-code">{sampleCode.map((line) => <span key={line.n} className={line.color}>{line.text || " "}{ "\n" }</span>)}</pre>
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

        <aside className="vscode-ai-panel">
          <div className="vscode-ai-heading"><span><Sparkles size={15} /> BCX AI</span><span className="vscode-ai-pill">ASSISTANT</span></div>
          <div className="vscode-ai-welcome"><div className="vscode-ai-icon"><WandSparkles size={20} /></div><h2>Que construisons-nous ?</h2><p>Un assistant de code pour comprendre, créer et améliorer tes projets.</p></div>
          <div className="vscode-ai-actions">
            <Link href="/ai"><Bot size={16} /><span><b>Discuter avec BCX AI</b><small>Code, architecture et débogage</small></span><ChevronRight size={15} /></Link>
            <Link href="/studio"><Code2 size={16} /><span><b>Éditer et prévisualiser</b><small>HTML, CSS et JavaScript</small></span><ChevronRight size={15} /></Link>
            <Link href="/registry"><Globe size={16} /><span><b>Registre de projets</b><small>Retrouver les projets enregistrés</small></span><ChevronRight size={15} /></Link>
          </div>
          <div className="vscode-ai-context"><div><Activity size={14} /> CONTEXTE DU PROJET</div><p><Folder size={13} /> bickri-codex-system</p><p><GitBranch size={13} /> branche main</p><p><ShieldCheck size={13} /> Actions sensibles avec validation</p></div>
          <Link href="/ai" className="vscode-ai-cta"><Sparkles size={15} /> Lancer BCX AI <ChevronRight size={15} /></Link>
        </aside>
      </div>
      <div className="vscode-mobile-launcher"><Link href="/studio"><Code2 size={16} /> Studio</Link><Link href="/ai"><Bot size={16} /> BCX AI</Link><Link href="/registry"><Folder size={16} /> Projets</Link></div>
    </main>
  );
}

function BlocksIcon() {
  return <Hammer size={19} />;
}
function MoreDots() {
  return <span className="vscode-more-dots" aria-hidden="true">•••</span>;
}

"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import {
  ArrowUp, Plus, Bug, Check, CircleAlert, CircleCheck, CircleX, Copy, Fingerprint, GitBranch, Globe, ImagePlus, Layers, Loader2, LogIn, WandSparkles,
  Plug, RefreshCw, ShieldAlert, Sparkles, SquarePen, User, X, Menu, FileText, ImageIcon,
} from "lucide-react";
import { Markdown } from "@/components/ai/Markdown";
import { VoiceAssistant } from "@/components/ai/VoiceAssistant";
import { Badge } from "@/components/ui/Badge";
import { useConfig } from "@/hooks/useConfig";
import { ThemeToggle } from "@/components/providers/ThemeToggle";

type AgentEvent = { tool: string; label: string; write: boolean; status: "ok" | "error" | "refused" | "pending" };
type Pending = { tool: string; label: string; args: Record<string, unknown> };
type PluginStatus = { id: string; name: string; description: string; available: boolean; reason?: string; tools: number; writeTools: number };
type ChatMessage = { role: "user" | "assistant"; content: string; events?: AgentEvent[]; model?: string };
type ChatAttachment = { name: string; mimeType: string; data: string; preview?: string };
type SavedConversation = { id: string; title: string; updatedAt: string; messages: ChatMessage[]; contents: unknown[]; language: string };
function createConversationId() { return `bcx-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`; }
type AgentResponse = {
  contents: unknown[]; events: AgentEvent[]; answer?: string; pending?: Pending[]; continue?: boolean; model?: string; error?: string;
};

const CHAT_KEY = "bcx_ai_chat_v2";
const HISTORY_KEY = "bcx_ai_conversations_v1";
const PLUGINS_KEY = "bcx_ai_plugins_v1";
const MAX_CONTINUATIONS = 4;
const LANGUAGES = ["TypeScript / Next.js", "JavaScript", "HTML / CSS", "Python", "Python / Django", "Dart / Flutter", "Kotlin / Android", "Java", "C / C++", "Rust", "PHP", "SQL / Supabase", "Autre langage"];
const PLUGIN_ICONS: Record<string, typeof GitBranch> = { github: GitBranch, registry: Fingerprint, web: Globe };
const STARTERS = [
  { icon: Layers, text: "Crée une application web responsive en Next.js avec authentification Supabase." },
  { icon: Bug, text: "Explique et corrige cette erreur TypeScript : " },
  { icon: ImagePlus, text: "Prépare une affiche publicitaire premium pour mon entreprise." },
  { icon: GitBranch, text: "Analyse le dépôt mabdourahamane886-lang/bickri-codex-system." },
];

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Lecture du fichier impossible."));
    reader.onerror = () => reject(new Error("Lecture du fichier impossible."));
    reader.readAsDataURL(file);
  });
}

function argsPreview(args: Record<string, unknown>): string {
  const copy: Record<string, unknown> = { ...args };
  for (const [k, v] of Object.entries(copy)) {
    if (typeof v === "string" && v.length > 1500) copy[k] = `${v.slice(0, 1500)}\n…(${v.length - 1500} caractères de plus)`;
  }
  return JSON.stringify(copy, null, 2);
}

function ToolEvents({ events }: { events: AgentEvent[] }) {
  if (!events.length) return null;
  return (
    <ul className="tool-events" aria-label="Actions des plugins">
      {events.map((e, i) => {
        const Icon = e.status === "ok" ? CircleCheck : e.status === "pending" ? ShieldAlert : CircleX;
        const text = e.status === "refused" ? "refusé" : e.status === "error" ? "échec" : e.status === "pending" ? "en attente de validation" : e.write ? "effectué" : "";
        return (
          <li key={i} className={`tool-event ${e.status}`}>
            <Icon aria-hidden="true" />
            <span className="grow">{e.label}</span>
            {text && <small>{text}</small>}
          </li>
        );
      })}
    </ul>
  );
}

export default function CodeAIPage() {
  const { config } = useConfig();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [contents, setContents] = useState<unknown[]>([]);
  const [history, setHistory] = useState<SavedConversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState("");
  const [pending, setPending] = useState<Pending[] | null>(null);
  const [prompt, setPrompt] = useState("");
  const [language, setLanguage] = useState(LANGUAGES[0]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [lastMessage, setLastMessage] = useState("");
  const [plugins, setPlugins] = useState<PluginStatus[] | null>(null);
  const [account, setAccount] = useState<{ signedIn: boolean; trusted: boolean } | null>(null);
  const [enabled, setEnabled] = useState<string[]>(["github", "registry", "web"]);
  const [showPlugins, setShowPlugins] = useState(false);
  const [showTools, setShowTools] = useState(false);
  const [showNav, setShowNav] = useState(false);
  const [imageMode, setImageMode] = useState<"create" | "edit">("create");
  const [imageIntent, setImageIntent] = useState(false);
  const [imageSource, setImageSource] = useState<{ file: File; preview: string; data: string } | null>(null);
  const [imageResult, setImageResult] = useState<{ image: string; model?: string } | null>(null);
  const [imageLoading, setImageLoading] = useState(false);
  const [chatAttachment, setChatAttachment] = useState<ChatAttachment | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageFileRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const sendLockRef = useRef(false);

  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(CHAT_KEY) || "null");
      if (saved?.messages) setMessages(saved.messages);
      if (Array.isArray(saved?.contents)) setContents(saved.contents);
      if (saved?.pending) setPending(saved.pending);
      if (saved?.language) setLanguage(saved.language);
      setActiveConversationId(typeof saved?.activeConversationId === "string" ? saved.activeConversationId : createConversationId());
      const storedHistory = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
      if (Array.isArray(storedHistory)) setHistory(storedHistory.filter((item) => item && typeof item.id === "string" && Array.isArray(item.messages)));
      const p = JSON.parse(localStorage.getItem(PLUGINS_KEY) || "null");
      if (Array.isArray(p)) setEnabled(p);
    } catch { /* ignoré */ }
  }, []);
  useEffect(() => {
    try { sessionStorage.setItem(CHAT_KEY, JSON.stringify({ messages, contents, pending, language, activeConversationId })); } catch { /* quota : ignoré */ }
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, contents, pending, language, loading, activeConversationId]);

  useEffect(() => {
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(history)); } catch { /* quota : ignoré */ }
  }, [history]);

  useEffect(() => {
    if (!activeConversationId || messages.length === 0) return;
    const firstUserMessage = messages.find((message) => message.role === "user")?.content ?? "Nouvelle conversation";
    const item: SavedConversation = {
      id: activeConversationId,
      title: firstUserMessage.replaceAll(String.fromCharCode(10), " ").slice(0, 56) || "Nouvelle conversation",
      updatedAt: new Date().toISOString(),
      messages,
      contents,
      language,
    };
    setHistory((all) => [item, ...all.filter((entry) => entry.id !== activeConversationId)].slice(0, 40));
  }, [activeConversationId, messages, contents, language]);
  useEffect(() => { try { localStorage.setItem(PLUGINS_KEY, JSON.stringify(enabled)); } catch { /* ignoré */ } }, [enabled]);
  useEffect(() => () => { if (imageSource?.preview) URL.revokeObjectURL(imageSource.preview); }, [imageSource?.preview]);

  const loadPlugins = useCallback(async () => {
    try {
      const res = await fetch("/api/ai/agent", { cache: "no-store" });
      const data = await res.json();
      setPlugins(data.plugins ?? []);
      setAccount({ signedIn: Boolean(data.signedIn), trusted: Boolean(data.trusted) });
    } catch { setPlugins([]); }
  }, []);
  useEffect(() => { void loadPlugins(); }, [loadPlugins]);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
  }, [prompt]);

  const activePlugins = (plugins ?? []).filter((p) => p.available && enabled.includes(p.id));

  /** Met à jour la dernière réponse de l'assistant (créée à l'envoi). */
  function patchAssistant(fn: (m: ChatMessage) => ChatMessage) {
    setMessages((all) => {
      const copy = [...all];
      const i = copy.length - 1;
      if (i >= 0 && copy[i].role === "assistant") copy[i] = fn(copy[i]);
      return copy;
    });
  }

  async function runAgent(body: Record<string, unknown>, baseContents: unknown[]) {
    setLoading(true); setError("");
    let state = baseContents;
    try {
      for (let round = 0; round <= MAX_CONTINUATIONS; round++) {
        const res = await fetch("/api/ai/agent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...body, contents: state, plugins: activePlugins.map((p) => p.id), language }),
        });
        const data = (await res.json().catch(() => ({}))) as AgentResponse;
        if (!res.ok) throw new Error(data.error || "La requête a échoué.");
        state = data.contents;
        setContents(data.contents);
        patchAssistant((m) => ({ ...m, model: data.model, events: [...(m.events ?? []).filter((e) => e.status !== "pending"), ...data.events] }));
        if (data.pending?.length) { setPending(data.pending); return; }
        if (data.answer !== undefined) {
          patchAssistant((m) => ({ ...m, content: data.answer! }));
          return;
        }
        if (!data.continue) return;
        body = {}; // poursuite automatique sans nouveau message
      }
      patchAssistant((m) => ({ ...m, content: m.content || "La tâche est longue : écris « continue » pour que je poursuive." }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Une erreur est survenue.");
    } finally {
      setLoading(false);
    }
  }

  function handleImageAction() {
    if (!prompt.trim()) {
      setShowTools((value) => !value);
      setError("");
      return;
    }
    void generateImage();
  }

  async function chooseImage(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Formats image acceptés : JPG, PNG et WebP.");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setError("L’image doit faire 8 Mo maximum.");
      return;
    }
    try {
      const data = await fileToDataUrl(file);
      setImageSource({ file, preview: URL.createObjectURL(file), data });
      setImageMode("edit");
      setShowTools(false);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible de lire cette image.");
    }
  }

  async function generateImage(promptOverride?: string) {
    const content = (promptOverride ?? prompt).trim();
    if (!content || imageLoading || loading || pending) {
      if (!content) setError("Décris l’image que tu veux créer ou la modification souhaitée.");
      return;
    }
    if (imageMode === "edit" && !imageSource) {
      setError("Importe d’abord une image à modifier depuis le menu +.");
      setShowTools(true);
      return;
    }
    setImageLoading(true); setError(""); setImageResult(null);
    try {
      const response = await fetch("/api/ai/images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: content,
          mode: imageMode,
          ...(imageMode === "edit" && imageSource ? { imageData: imageSource.data, mimeType: imageSource.file.type } : {}),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || typeof data.image !== "string") throw new Error(data.error || "Impossible de générer cette image.");
      setImageResult({ image: data.image, model: data.model });
      setMessages((all) => [...all, { role: "user", content: (imageMode === "edit" ? "Modifier l’image : " : "Créer une image : ") + content }, { role: "assistant", content: imageMode === "edit" ? "Voici l’image modifiée." : "Voici l’image générée." }]);
      setPrompt("");
      setImageSource(null);
      setImageMode("create");
      setImageIntent(false);
    } catch (err) { setError(err instanceof Error ? err.message : "Impossible de générer cette image."); }
    finally { setImageLoading(false); }
  }

  function isImageRequest(text: string) {
    return /\b(crée|creer|créer|prépare|preparer|préparer|conçois|concevoir|génère|generer|générer|dessine|dessiner|fabrique|produis|produire|make|create|generate|draw)\b.{0,70}\b(image|images|affiche|affiches|logo|logos|illustration|illustrations|visuel|visuels|photo|photos|poster|banner|bannière|banniere)\b|\b(image|affiche|logo|illustration|visuel|photo|poster|bannière|banniere)\b.{0,70}\b(crée|creer|créer|prépare|preparer|préparer|conçois|concevoir|génère|generer|générer|dessine|dessiner|make|create|generate|draw)\b/i.test(text);
  }

  async function send(text: string) {
    const content = text.trim();
    if ((!content && !chatAttachment) || loading || pending || sendLockRef.current) return;
    sendLockRef.current = true;
    const attachment = chatAttachment;
    // Image prompts typed directly in the main composer use the image API automatically.
    // Normal coding/chat prompts continue to the agent as before.
    if (!attachment && (imageIntent || imageMode === "edit" || isImageRequest(content))) {
      try {
        await generateImage(content);
      } finally {
        sendLockRef.current = false;
      }
      return;
    }
    const visibleContent = attachment ? `${content || "Analyse cette pièce jointe."}\n\nPièce jointe : ${attachment.name}` : content;
    const baseContents = attachment
      ? [...contents, { role: "user", parts: [{ inlineData: { mimeType: attachment.mimeType, data: attachment.data } }] }]
      : contents;
    setMessages((all) => [...all, { role: "user", content: visibleContent }, { role: "assistant", content: "", events: [] }]);
    setPrompt(""); setLastMessage(content || `Analyse la pièce jointe ${attachment?.name ?? ""}`);
    setChatAttachment(null);
    try {
      await runAgent({ message: content || `Analyse la pièce jointe ${attachment?.name ?? ""} et explique son contenu.` }, baseContents);
    } catch (err) { setError(err instanceof Error ? err.message : "Une erreur est survenue."); }
    finally { setLoading(false); sendLockRef.current = false; }
  }

  async function decide(decision: "approve" | "reject") {
    if (!pending || loading) return;
    setPending(null);
    await runAgent({ decision }, contents);
  }

  function onSubmit(e: FormEvent) { e.preventDefault(); void send(prompt); }
  async function readDocument(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = ""; if (!file) return;
    const supportedText = /\.(txt|md|json|csv|ts|tsx|js|jsx|py|html|css|xml|log)$/i.test(file.name);
    const supportedMime = ["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(file.type);
    if (file.size > 4 * 1024 * 1024) { setError("La pièce jointe doit faire 4 Mo maximum."); return; }
    if (supportedText) {
      const text = await file.text();
      setPrompt((old) => old + (old ? "\n\n" : "") + "Fichier joint : " + file.name + "\n\n" + text.slice(0, 30000));
      inputRef.current?.focus(); return;
    }
    if (!supportedMime) { setError("Formats acceptés : images JPG/PNG/WebP, PDF, TXT, MD, JSON, CSV et fichiers de code."); return; }
    try {
      const dataUrl = await fileToDataUrl(file);
      const data = dataUrl.split(",")[1];
      if (!data) throw new Error("Lecture du fichier impossible.");
      setChatAttachment({ name: file.name, mimeType: file.type, data, ...(file.type.startsWith("image/") ? { preview: dataUrl } : {}) });
      setError(""); inputRef.current?.focus();
    } catch (err) { setError(err instanceof Error ? err.message : "Lecture du fichier impossible."); }
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(prompt); }
  }
  function retry() {
    if (!lastMessage) return;
    // Retire la question échouée et sa réponse vide, puis renvoie.
    setMessages((all) => {
      const idx = all.map((m) => m.role).lastIndexOf("user");
      return idx >= 0 ? all.slice(0, idx) : all;
    });
    setContents((c) => {
      const copy = [...c] as Array<{ role?: string; parts?: Array<{ text?: string }> }>;
      while (copy.length && !(copy.at(-1)?.role === "model" && !copy.at(-1)?.parts?.some((p) => "functionCall" in p))) copy.pop();
      return copy;
    });
    setError("");
    setTimeout(() => void send(lastMessage), 0);
  }
  function newChat() {
    setMessages([]);
    setContents([]);
    setPending(null);
    setError("");
    setImageResult(null);
    setImageSource(null);
    setChatAttachment(null);
    setImageMode("create");
    setImageIntent(false);
    setActiveConversationId(createConversationId());
    setShowNav(false);
    setShowTools(false);
    inputRef.current?.focus();
  }

  function openConversation(item: SavedConversation) {
    setActiveConversationId(item.id);
    setMessages(item.messages);
    setContents(item.contents ?? []);
    setLanguage(item.language || LANGUAGES[0]);
    setPending(null);
    setError("");
    setImageResult(null);
    setShowNav(false);
  }

  function deleteConversation(id: string) {
    setHistory((all) => all.filter((item) => item.id !== id));
    if (id === activeConversationId) newChat();
  }

  function transferToStudio(answer: string) {
    const blocks = [...answer.matchAll(/```(html|css|javascript|js)\s*\n([\s\S]*?)```/gi)];
    if (!blocks.length) return;
    const base = {
      name: "Projet depuis Bickri Chat",
      html: "<main></main>",
      css: "",
      js: "",
      updatedAt: new Date().toISOString(),
    };
    let workspace = base;
    try {
      const saved = JSON.parse(localStorage.getItem("bcx_studio_workspace_v1") || "null");
      if (saved && typeof saved === "object") workspace = { ...base, ...saved, updatedAt: new Date().toISOString() };
    } catch { /* nouveau projet si les données sont invalides */ }
    const languages = new Set(blocks.map((block) => block[1].toLowerCase()));
    if (languages.has("html") && !languages.has("css")) workspace.css = "";
    if (languages.has("html") && !languages.has("js") && !languages.has("javascript")) workspace.js = "";
    for (const block of blocks) {
      const language = block[1].toLowerCase();
      const code = block[2].replace(/\n$/, "");
      if (language === "html") workspace.html = code;
      else if (language === "css") workspace.css = code;
      else workspace.js = code;
    }
    try { localStorage.setItem("bcx_studio_workspace_v1", JSON.stringify(workspace)); } catch { setError("Impossible de transférer le code : stockage local indisponible."); }
  }

  function hasStudioCode(answer: string) {
    return /```(html|css|javascript|js)\s*\n[\s\S]*?```/i.test(answer);
  }

  function toggle(id: string) { setEnabled((all) => (all.includes(id) ? all.filter((x) => x !== id) : [...all, id])); }

  const pluginList = (
    <ul className="plugin-list">
      {(plugins ?? []).map((p) => {
        const Icon = PLUGIN_ICONS[p.id] ?? Plug;
        const on = enabled.includes(p.id);
        return (
          <li key={p.id} className={`plugin ${p.available ? "" : "off"}`}>
            <span className="plugin-icon" aria-hidden="true"><Icon /></span>
            <div className="grow" style={{ minWidth: 0 }}>
              <div className="plugin-name">{p.name}{p.available && p.writeTools > 0 && <Badge tone="gold">écriture validée</Badge>}</div>
              <p>{p.available ? p.description : p.reason}</p>
            </div>
            <button type="button" role="switch" aria-checked={on && p.available} aria-label={`Plugin ${p.name}`} className="switch" disabled={!p.available} onClick={() => toggle(p.id)}><i /></button>
          </li>
        );
      })}
      {!plugins && <li className="plugin off"><Loader2 className="spin" size={14} /> <p>Chargement des plugins…</p></li>}
    </ul>
  );

  return (
    <main className="chat bcx-classic-chat">
      <aside className="classic-chat-sidebar" aria-label="Historique des conversations">
        <div className="classic-sidebar-brand"><span className="classic-brand-mark">B</span><strong>Bickri AI</strong></div>
        <button type="button" className="classic-new-chat" onClick={newChat}><SquarePen size={17}/> Nouveau chat</button>
        <div className="classic-history-heading">Conversations</div>
        <div className="classic-history-list">{history.map((item) => <div key={item.id} className={`classic-history-row ${item.id === activeConversationId ? "active" : ""}`}><button type="button" onClick={() => { openConversation(item); setShowNav(false); }} title={item.title}>{item.title}</button><button type="button" className="classic-delete-chat" aria-label={`Supprimer ${item.title}`} onClick={() => deleteConversation(item.id)}><X size={14}/></button></div>)}{history.length === 0 && <p className="classic-history-empty">Tes conversations apparaîtront ici.</p>}</div>
        <div className="classic-sidebar-bottom"><button type="button" onClick={() => { if (confirm("Effacer toutes les conversations enregistrées ?")) { history.forEach((item) => deleteConversation(item.id)); newChat(); } }}>Effacer l’historique</button><Link href="/settings">Paramètres</Link><Link href="/login">Compte</Link></div>
      </aside>
      <div className="row bcx-chat-toolbar" style={{ padding: "8px 12px", borderBottom: "1px solid var(--border)", justifyContent: "space-between" }}><button type="button" className="btn btn-ghost btn-icon" aria-label="Ouvrir le menu" onClick={() => setShowNav((v) => !v)}><Menu /></button><strong className="bcx-mobile-plan">Free plan · <span>Upgrade</span></strong><ThemeToggle /><button type="button" className="btn btn-ghost btn-icon" aria-label="Nouvelle conversation" onClick={newChat}><SquarePen /></button></div>
      {showNav && <div className="plugin-popover bcx-nav-popover" role="dialog" aria-label="Navigation et historique Bickri"><div className="row"><b className="grow">Bickri Codex System</b><button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => setShowNav(false)} aria-label="Fermer"><X /></button></div><button type="button" className="btn btn-ghost" style={{width:"100%",justifyContent:"flex-start"}} onClick={newChat}><SquarePen size={18}/> Nouveau chat</button><button type="button" className="btn btn-ghost" style={{width:"100%",justifyContent:"flex-start"}} onClick={() => { setShowNav(false); setShowTools(true); }}><Layers size={18}/> Outils</button><hr className="divider"/><div className="row"><b className="grow">Historique</b><span className="muted">{history.length}</span></div>{history.length ? <div className="bcx-history-list">{history.map((item) => <div className={`bcx-history-item ${item.id === activeConversationId ? "active" : ""}`} key={item.id}><button type="button" className="bcx-history-open" title={item.title} onClick={() => openConversation(item)}>{item.title}</button><button type="button" className="btn btn-ghost btn-icon btn-sm" aria-label={`Supprimer ${item.title}`} title="Supprimer" onClick={() => deleteConversation(item.id)}><X size={14}/></button></div>)}</div> : <p className="muted" style={{fontSize:12}}>Tes conversations apparaîtront ici.</p>}<hr className="divider"/><b>Plugins</b>{pluginList}</div>}
      <div className="chat-main">
        <div className="chat-scroll">
          <div className="chat-inner">
            {config && !config.ai && (
              <div className="alert alert-warning"><CircleAlert /><span>L&apos;assistant n&apos;est pas encore configuré : ajoute <code className="mono">GEMINI_API_KEY</code> dans les variables d&apos;environnement Vercel, puis redéploie.</span></div>
            )}

            {messages.length === 0 ? (
              <>
                <div className="chat-hero">
                  <Badge tone="accent">Bickri AI</Badge>
                  <div className="bcx-welcome-mark" aria-hidden="true"><Sparkles size={32}/></div>
                  <h1>Bonjour, Mohamed</h1>
                  <p>
                    Décris une fonctionnalité, colle une erreur ou demande du code.
                    {activePlugins.length ? ` Plugins actifs : ${activePlugins.map((p) => p.name).join(", ")}.` : " Active des plugins pour que l'IA travaille directement sur GitHub et le registre."}
                  </p>
                </div>
                <div className="starter-grid">
                  {STARTERS.map(({ icon: Icon, text }) => (
                    <button key={text} className="starter" onClick={() => { setPrompt(text); inputRef.current?.focus(); }}>
                      <Icon aria-hidden="true" /><span>{text}</span>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <div aria-live="polite" style={{ display: "grid", gap: 22 }}>
                {messages.map((m, i) => {
                  const isLast = i === messages.length - 1;
                  if (m.role === "assistant" && !m.content && !m.events?.length && !(isLast && loading)) return null;
                  return (
                    <article key={i} className={`msg ${m.role}`}>
                      <div className="msg-avatar" aria-hidden="true">{m.role === "user" ? <User /> : <Sparkles />}</div>
                      <div style={{ minWidth: 0 }}>
                        <div className="msg-role">{m.role === "user" ? "Toi" : "Bickri AI"}</div>
                        {m.role === "user" ? <div className="msg-text">{m.content}</div> : (
                          <>
                            <ToolEvents events={m.events ?? []} />
                            {m.content && <Markdown>{m.content}</Markdown>}
                            {m.content && (
                              <div className="row" style={{ gap: 6, marginTop: 10, flexWrap: "wrap" }} aria-label="Actions sur la réponse">
                                <button type="button" className="btn btn-ghost btn-sm" onClick={() => { void navigator.clipboard.writeText(m.content).catch(() => setError("Impossible de copier la réponse sur cet appareil.")); }} aria-label="Copier la réponse" title="Copier la réponse"><Copy size={15} /> Copier</button>
                                {hasStudioCode(m.content) && <Link href="/studio" className="btn btn-ghost btn-sm" onClick={() => transferToStudio(m.content)}><Layers size={15} /> Ouvrir dans le Studio</Link>}
                                {isLast && !loading && <button type="button" className="btn btn-ghost btn-sm" onClick={retry} disabled={!lastMessage || Boolean(pending)} aria-label="Régénérer la réponse" title="Régénérer la réponse"><RefreshCw size={15} /> Régénérer</button>}
                              </div>
                            )}
                            {isLast && loading && <span className="typing" aria-label="Réponse en cours"><i /><i /><i /></span>}
                          </>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}

            {imageResult && (
              <section className="approval" aria-label="Image générée" style={{ overflow: "hidden" }}>
                <header className="row"><ImageIcon aria-hidden="true" /><div className="grow"><h2>Image générée</h2><p>{imageResult.model ? `Modèle : ${imageResult.model}` : "Création terminée"}</p></div><a className="btn btn-sm" href={imageResult.image} download="bickri-image.png">Télécharger</a></header>
                <img src={imageResult.image} alt="Image générée à partir du prompt" style={{ display: "block", width: "100%", maxHeight: 520, objectFit: "contain", borderRadius: 12, background: "var(--surface-muted)" }} />
              </section>
            )}

            {pending && (
              <section className="approval" aria-label="Validation requise">
                <header className="row">
                  <ShieldAlert aria-hidden="true" />
                  <div className="grow">
                    <h2>Validation requise</h2>
                    <p>L&apos;IA veut effectuer {pending.length > 1 ? `${pending.length} actions` : "une action"} d&apos;écriture. Rien n&apos;est exécuté sans ton accord.</p>
                  </div>
                </header>
                {pending.map((p, i) => (
                  <details key={i} className="approval-item" open={pending.length === 1}>
                    <summary>{p.label}</summary>
                    <pre className="mono">{argsPreview(p.args)}</pre>
                  </details>
                ))}
                <div className="row" style={{ justifyContent: "flex-end", gap: 8 }}>
                  <button className="btn btn-sm" onClick={() => void decide("reject")} disabled={loading}><X /> Refuser</button>
                  <button className="btn btn-primary btn-sm" onClick={() => void decide("approve")} disabled={loading}><Check /> Approuver</button>
                </div>
              </section>
            )}

            {error && (
              <div className="alert alert-danger" role="alert">
                <CircleAlert />
                <div className="grow"><p>{error}</p><button className="btn btn-sm" style={{ marginTop: 8 }} onClick={retry}><RefreshCw /> Réessayer</button></div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        </div>

        <div className="chat-composer">
          <input ref={fileInputRef} type="file" accept=".txt,.md,.json,.csv,.ts,.tsx,.js,.jsx,.py,.html,.css,.xml,.log,.pdf,image/jpeg,image/png,image/webp" hidden onChange={readDocument} />
          <input ref={imageFileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={chooseImage} />
          {showTools && <div className="plugin-popover bcx-tools-popover" role="dialog" aria-label="Outils de la conversation">
            <div className="row"><b className="grow">Que veux-tu faire ?</b><button type="button" className="btn btn-ghost btn-icon btn-sm" aria-label="Fermer les outils" onClick={() => setShowTools(false)}><X size={16} /></button></div>
            <div className="bcx-tool-grid">
              <button type="button" className={`btn ${imageMode === "create" ? "btn-primary" : ""}`} onClick={() => { setImageMode("create"); setImageIntent(true); setShowTools(false); inputRef.current?.focus(); }}><ImagePlus size={17} /> Créer une image</button>
              <button type="button" className={`btn ${imageMode === "edit" ? "btn-primary" : ""}`} onClick={() => { setImageMode("edit"); setShowTools(false); imageFileRef.current?.click(); }}><WandSparkles size={17} /> Modifier une image</button>
              <button type="button" className="btn" onClick={() => { setShowTools(false); fileInputRef.current?.click(); }}><FileText size={17} /> Joindre un fichier/code</button>
              <Link className="btn" href="/studio" onClick={() => setShowTools(false)}><Layers size={17} /> Ouvrir l’éditeur</Link>
              <button type="button" className="btn" onClick={() => { setImageMode("create"); setImageIntent(true); setPrompt((old) => old || "Crée une affiche publicitaire professionnelle pour mon entreprise. Nom, offre, coordonnées et style souhaité : "); setShowTools(false); inputRef.current?.focus(); }}><Sparkles size={17} /> Créer une affiche</button>
              <Link className="btn" href="/registry" onClick={() => setShowTools(false)}><Fingerprint size={17} /> Registre BCX</Link>
            </div>
          </div>}
          {chatAttachment && <div className="bcx-image-attachment"><span className="attachment-preview-icon">{chatAttachment.preview ? <img src={chatAttachment.preview} alt="" /> : <FileText size={22} />}</span><div className="grow"><b>Pièce jointe prête</b><small>{chatAttachment.name} · {chatAttachment.mimeType}</small></div><button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => setChatAttachment(null)} aria-label="Retirer la pièce jointe"><X size={16} /></button></div>}
          {imageSource && <div className="bcx-image-attachment"><img src={imageSource.preview} alt="Image à modifier" /><div className="grow"><b>Image à modifier</b><small>{imageSource.file.name}</small></div><button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => { setImageSource(null); setImageMode("create"); }} aria-label="Retirer l’image"><X size={16} /></button></div>}
          {showPlugins && (
            <div className="plugin-popover" role="dialog" aria-label="Plugins">
              <div className="row"><b className="grow">Plugins</b><button className="btn btn-ghost btn-icon btn-sm" onClick={() => setShowPlugins(false)} aria-label="Fermer"><X /></button></div>
              {pluginList}
            </div>
          )}
          <form className="composer" onSubmit={onSubmit}>
            <label htmlFor="ai-input" className="sr-only">Message</label>
            <textarea id="ai-input" ref={inputRef} rows={1} value={prompt} maxLength={8000} onChange={(e) => setPrompt(e.target.value)} onKeyDown={onKeyDown} disabled={Boolean(pending)} placeholder={pending ? "Valide ou refuse l'action en attente…" : "Décris ton application, demande une modification de dépôt ou colle une erreur…"} />
            <div className="composer-bar bcx-simple-composer-bar">
              <button
                type="button"
                className="btn btn-ghost btn-icon btn-sm bcx-composer-plus"
                onClick={() => setShowTools((v) => !v)}
                aria-expanded={showTools}
                aria-label="Ajouter un fichier ou ouvrir les outils"
                title="Ajouter"
              >
                <Plus size={20} />
              </button>
              <VoiceAssistant
                onSend={(text) => send(text)}
                assistantResponse={messages.slice().reverse().find((message) => message.role === "assistant")?.content ?? ""}
                busy={loading}
                blocked={Boolean(pending)}
              />
              <button
                className="btn btn-primary btn-icon btn-sm composer-send"
                type="submit"
                disabled={loading || (!prompt.trim() && !chatAttachment) || Boolean(pending)}
                aria-label="Envoyer"
                title="Envoyer"
              >
                <ArrowUp size={19} />
              </button>
            </div>
          </form>
          <p className="composer-note">Les réponses sont générées par IA : vérifie le code avant une mise en production. Les actions d&apos;écriture demandent toujours ta validation.</p>
        </div>
      </div>

      <aside className="chat-side" aria-label="Contexte">
        <div>
          <h3>Conversation</h3>
          <p>{messages.length ? `${messages.filter((m) => m.role === "user").length} question(s) dans cette session.` : "Aucun message pour l'instant."}</p>
          <button className="btn btn-sm" style={{ marginTop: 10 }} onClick={newChat} disabled={!messages.length}><SquarePen /> Nouvelle conversation</button>
        </div>
        <hr className="divider" />
        <div className="stack" style={{ gap: 10 }}>
          <div className="row">
            <h3 className="row grow" style={{ marginBottom: 0 }}><Plug size={14} /> Plugins</h3>
            <button className="btn btn-ghost btn-icon btn-sm" onClick={() => void loadPlugins()} aria-label="Actualiser les plugins" title="Actualiser"><RefreshCw /></button>
          </div>
          {account && !account.signedIn && (
            <div className="alert alert-info" style={{ fontSize: "var(--text-xs)" }}>
              <LogIn />
              <span>Les plugins demandent un compte. <Link href="/login?next=/ai" className="link">Se connecter</Link></span>
            </div>
          )}
          {account?.signedIn && !account.trusted && (
            <div className="alert alert-warning" style={{ fontSize: "var(--text-xs)" }}>
              <ShieldAlert />
              <span>GitHub est réservé aux comptes administrateurs, car il agit avec le jeton du propriétaire.</span>
            </div>
          )}
          {pluginList}
        </div>
        <hr className="divider" />
        <div>
          <h3>Modèle</h3>
          <p>{config ? `${config.aiModel} (repli : ${config.aiFallbackModel})` : "Chargement…"}</p>
        </div>
      </aside>
    </main>
  );
}

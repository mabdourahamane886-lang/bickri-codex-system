"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import {
  ArrowUp, Bug, Check, CircleAlert, CircleCheck, CircleX, Copy, Fingerprint, GitBranch, Globe, ImagePlus, Layers, Loader2, LogIn, WandSparkles,
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
type FeatureAction = "prompt" | "image" | "edit" | "file" | "studio" | "registry" | "plugins";
type FeatureItem = { label: string; description: string; action: FeatureAction; prompt?: string };
type FeatureGroup = { id: string; letter: string; title: string; description: string; icon: typeof Layers; items: FeatureItem[] };
const FEATURE_GROUPS: FeatureGroup[] = [
  { id: "a", letter: "A", title: "Assistant IA", description: "Discuter, rédiger, analyser et apprendre", icon: Sparkles, items: [
    { label: "Poser une question", description: "Obtenir une réponse ou une explication", action: "prompt", prompt: "Aide-moi sur le sujet suivant : " },
    { label: "Rédiger ou analyser", description: "Préparer un contenu ou analyser une idée", action: "prompt", prompt: "Aide-moi à rédiger ou analyser ceci : " },
  ]},
  { id: "b", letter: "B", title: "Programmation & code", description: "Créer, expliquer et corriger du code", icon: Bug, items: [
    { label: "Générer du code", description: "Décris le programme ou la fonctionnalité", action: "prompt", prompt: "Génère du code pour : " },
    { label: "Corriger une erreur", description: "Colle le message d’erreur et le code concerné", action: "prompt", prompt: "Diagnostique et corrige cette erreur sans modifier les clés API : " },
    { label: "Ouvrir l’éditeur", description: "Continuer dans le Studio BCX", action: "studio" },
  ]},
  { id: "c", letter: "C", title: "Images & visuels", description: "Créer une image ou modifier une image importée", icon: ImagePlus, items: [
    { label: "Créer une image", description: "Décrire le visuel souhaité", action: "image" },
    { label: "Modifier une image", description: "Importer une image puis décrire les changements", action: "edit" },
    { label: "Créer une affiche", description: "Préparer un prompt d’affiche publicitaire", action: "prompt", prompt: "Prépare une affiche publicitaire professionnelle. Marque, texte, couleurs, format et style : " },
  ]},
  { id: "d", letter: "D", title: "Documents & fichiers", description: "Joindre et analyser des documents ou du code", icon: FileText, items: [
    { label: "Joindre un fichier", description: "Importer un document ou un fichier de code pris en charge", action: "file" },
    { label: "Analyser un document", description: "Joindre le fichier puis préciser les points à examiner", action: "prompt", prompt: "Analyse le document joint et résume les points importants : " },
  ]},
  { id: "e", letter: "E", title: "Sites & applications", description: "Concevoir des interfaces et des projets", icon: Globe, items: [
    { label: "Créer un site web", description: "Décrire les pages, le design et les fonctions", action: "prompt", prompt: "Conçois un site web responsive. Objectif, pages, style et fonctionnalités : " },
    { label: "Créer une application", description: "Décrire la plateforme et les besoins", action: "prompt", prompt: "Conçois l’architecture d’une application. Plateforme, fonctionnalités et contraintes : " },
    { label: "Ouvrir le Studio", description: "Accéder à l’espace de création existant", action: "studio" },
  ]},
  { id: "f", letter: "F", title: "GitHub & déploiement", description: "Préparer des actions et diagnostiquer les déploiements", icon: GitBranch, items: [
    { label: "Analyser un dépôt", description: "Demander une analyse du dépôt connecté", action: "prompt", prompt: "Analyse le dépôt GitHub connecté : structure, erreurs, tests et améliorations possibles. Ne modifie aucune clé ni variable d’environnement." },
    { label: "Diagnostiquer Vercel", description: "Examiner un échec de build ou de déploiement", action: "prompt", prompt: "Aide-moi à diagnostiquer ce déploiement Vercel. Voici le lien ou les logs : " },
  ]},
  { id: "g", letter: "G", title: "Terminal, compilation & tests", description: "Préparer des commandes et des plans de vérification", icon: Bug, items: [
    { label: "Préparer les commandes", description: "Obtenir les commandes adaptées au projet", action: "prompt", prompt: "Prépare les commandes de terminal adaptées à mon projet pour installer les dépendances et lancer les vérifications. Explique chaque commande avant toute action : " },
    { label: "Plan de tests", description: "Définir les tests à exécuter avant mise en production", action: "prompt", prompt: "Prépare un plan de tests et de validation pour ce projet : " },
  ]},
  { id: "h", letter: "H", title: "Projets, paramètres & sécurité", description: "Gérer les outils actifs et protéger la configuration", icon: Fingerprint, items: [
    { label: "Gérer les plugins", description: "Voir les intégrations disponibles et leur état", action: "plugins" },
    { label: "Conseils de sécurité", description: "Vérifier les risques sans exposer les secrets", action: "prompt", prompt: "Fais une revue de sécurité de ce projet. Ne demande pas et n’affiche pas les secrets, clés API ou variables d’environnement : " },
    { label: "Registre BCX", description: "Ouvrir le registre disponible", action: "registry" },
  ]},
];

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
  const [selectedToolGroup, setSelectedToolGroup] = useState<string | null>(null);
  const [showNav, setShowNav] = useState(false);
  const [imageMode, setImageMode] = useState<"create" | "edit">("create");
  const [imageSource, setImageSource] = useState<{ file: File; preview: string; data: string } | null>(null);
  const [imageResult, setImageResult] = useState<{ image: string; model?: string } | null>(null);
  const [imageLoading, setImageLoading] = useState(false);
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

  function activateFeature(item: FeatureItem) {
    setError("");
    if (item.action === "image") {
      setImageMode("create"); setShowTools(false); setSelectedToolGroup(null); inputRef.current?.focus(); return;
    }
    if (item.action === "edit") {
      setImageMode("edit"); setShowTools(false); setSelectedToolGroup(null); imageFileRef.current?.click(); return;
    }
    if (item.action === "file") {
      setShowTools(false); setSelectedToolGroup(null); fileInputRef.current?.click(); return;
    }
    if (item.action === "studio" || item.action === "registry") {
      setShowTools(false); setSelectedToolGroup(null);
      window.location.href = item.action === "studio" ? "/studio" : "/registry";
      return;
    }
    if (item.action === "plugins") {
      setShowTools(false); setSelectedToolGroup(null); setShowPlugins(true); return;
    }
    setPrompt((old) => old ? old + "\n\n" + (item.prompt ?? "") : (item.prompt ?? ""));
    setShowTools(false); setSelectedToolGroup(null);
    window.setTimeout(() => inputRef.current?.focus(), 0);
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

  async function generateImage() {
    const content = prompt.trim();
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
    } catch (err) { setError(err instanceof Error ? err.message : "Impossible de générer cette image."); }
    finally { setImageLoading(false); }
  }

  async function send(text: string) {
    const content = text.trim();
    if (!content || loading || pending || sendLockRef.current) return;
    sendLockRef.current = true;
    setMessages((all) => [...all, { role: "user", content }, { role: "assistant", content: "", events: [] }]);
    setPrompt(""); setLastMessage(content);
    try {
      await runAgent({ message: content }, contents);
    } catch (err) { setError(err instanceof Error ? err.message : "Une erreur est survenue."); }
    finally { setLoading(false); sendLockRef.current = false; }
  }

  async function decide(decision: "approve" | "reject") {
    if (!pending || loading) return;
    setPending(null);
    await runAgent({ decision }, contents);
  }

  function onSubmit(e: FormEvent) { e.preventDefault(); void send(prompt); }
  async function readDocument(event: React.ChangeEvent<HTMLInputElement>) { const file = event.target.files?.[0]; event.target.value = ""; if (!file) return; if (file.size > 2 * 1024 * 1024 || !/\.(txt|md|json|csv|ts|tsx|js|jsx|py|html|css|xml|log)$/i.test(file.name)) { setError("Formats acceptés : TXT, MD, JSON, CSV et code, 2 Mo maximum."); return; } const text = await file.text(); setPrompt((old) => old + (old ? "\n\n" : "") + "Fichier joint : " + file.name + "\n\n" + text.slice(0, 30000)); inputRef.current?.focus(); }

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
    setImageMode("create");
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
    <main className="chat">
      <div className="row bcx-chat-toolbar" style={{ padding: "8px 12px", borderBottom: "1px solid var(--border)", justifyContent: "space-between" }}><button type="button" className="btn btn-ghost btn-icon" aria-label="Ouvrir le menu" onClick={() => setShowNav((v) => !v)}><Menu /></button><strong>Bickri Chat</strong><ThemeToggle /><button type="button" className="btn btn-ghost btn-icon" aria-label="Nouvelle conversation" onClick={newChat}><SquarePen /></button></div>
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
                  <h1>Que veux-tu construire aujourd&apos;hui ?</h1>
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
          <input ref={fileInputRef} type="file" accept=".txt,.md,.json,.csv,.ts,.tsx,.js,.jsx,.py,.html,.css,.xml,.log" hidden onChange={readDocument} />
          <input ref={imageFileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={chooseImage} />
          {showTools && <div className="plugin-popover bcx-tools-popover" role="dialog" aria-label="Fonctionnalités BCX A à H">
            <div className="row"><div className="grow"><b>Fonctionnalités BCX</b><p className="muted" style={{fontSize:12,marginTop:3}}>Choisis une catégorie A à H.</p></div><button type="button" className="btn btn-ghost btn-icon btn-sm" aria-label="Fermer les fonctionnalités" onClick={() => { setShowTools(false); setSelectedToolGroup(null); }}><X size={16} /></button></div>
            {selectedToolGroup ? (
              <>
                <button type="button" className="btn btn-ghost btn-sm" style={{marginTop:10}} onClick={() => setSelectedToolGroup(null)}>← Toutes les catégories</button>
                {FEATURE_GROUPS.filter((group) => group.id === selectedToolGroup).map((group) => <section key={group.id} style={{marginTop:10}}>
                  <div className="row" style={{marginBottom:8}}><span className="bcx-feature-letter">{group.letter}</span><div><b>{group.title}</b><p className="muted" style={{fontSize:12}}>{group.description}</p></div></div>
                  <div className="bcx-feature-items">{group.items.map((item) => <button type="button" className="bcx-feature-item" key={item.label} onClick={() => activateFeature(item)}><b>{item.label}</b><small>{item.description}</small></button>)}</div>
                </section>)}
              </>
            ) : (
              <div className="bcx-feature-groups">{FEATURE_GROUPS.map((group) => { const Icon = group.icon; return <button type="button" className="bcx-feature-group" key={group.id} onClick={() => setSelectedToolGroup(group.id)}><span className="bcx-feature-letter">{group.letter}</span><span className="bcx-feature-icon"><Icon size={18}/></span><span className="bcx-feature-copy"><b>{group.title}</b><small>{group.description}</small></span><span className="bcx-feature-chevron">›</span></button>; })}</div>
            )}
          </div>}
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
            <div className="composer-bar">
              <button className="btn btn-primary btn-icon btn-sm composer-send" type="submit" disabled={loading || !prompt.trim() || Boolean(pending)} aria-label="Envoyer"><ArrowUp /></button>
              <VoiceAssistant
                onSend={(text) => send(text)}
                assistantResponse={messages.slice().reverse().find((message) => message.role === "assistant")?.content ?? ""}
                busy={loading}
                blocked={Boolean(pending)}
              />
              <select className="select" style={{ width: "auto", height: 28, fontSize: "var(--text-xs)" }} value={language} onChange={(e) => setLanguage(e.target.value)} aria-label="Langage de travail">
                {LANGUAGES.map((l) => <option key={l}>{l}</option>)}
              </select>
              <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => setShowTools((v) => !v)} aria-expanded={showTools} aria-label="Ouvrir les outils" title="Ouvrir les outils" style={{ height: 32, width: 34 }}>
                <Layers size={17} />
              </button>
              <button type="button" className={`btn btn-sm ${imageMode !== "create" || imageSource ? "btn-plugins-on" : ""}`} onClick={handleImageAction} disabled={imageLoading || loading || Boolean(pending)} aria-label={imageMode === "edit" ? "Modifier l’image jointe" : "Générer une image"} title={imageMode === "edit" ? "Modifier l’image jointe" : "Générer une image"} style={{ height: 32 }}>
                {imageLoading ? <Loader2 className="spin" /> : imageMode === "edit" ? <WandSparkles size={17} /> : <ImagePlus size={17} />} <span className="hide-sm">{imageMode === "edit" ? "Modifier" : "Image"}</span>
              </button>
              <button type="button" className={`btn btn-sm ${activePlugins.length ? "btn-plugins-on" : ""}`} onClick={() => setShowPlugins((v) => !v)} aria-expanded={showPlugins} style={{ height: 28 }}>
                <Plug /> Plugins{activePlugins.length ? ` · ${activePlugins.length}` : ""}
              </button>
              <small className="grow hide-sm"><span className="kbd">Entrée</span> envoyer · <span className="kbd">Maj + Entrée</span> nouvelle ligne</small>
              {messages.length > 0 && <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={newChat} aria-label="Nouvelle conversation" title="Nouvelle conversation"><SquarePen /></button>}

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

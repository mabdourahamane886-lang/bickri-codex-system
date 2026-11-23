"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import {
  ArrowUp, Plus, Archive, Bug, Check, CircleAlert, CircleCheck, CircleX, Code2, Copy, ImagePlus, Layers, Link2, ChevronDown,
  LogIn, LogOut, MoreHorizontal, Pencil, Pin, Plug, RefreshCw, Share2, ShieldAlert, Sparkles, SquarePen, User, UserPlus, X, Menu, FileText,
  ImageIcon, Search, ThumbsDown, ThumbsUp,
} from "lucide-react";
import { NAV_GROUPS } from "@/components/shell/nav";
import { Logo, LogoMark } from "@/components/brand/Logo";
import { ThemeToggle } from "@/components/providers/ThemeToggle";
import { Markdown } from "@/components/ai/Markdown";
import { VoiceAssistant } from "@/components/ai/VoiceAssistant";
import { LiveThinkingCenter } from "@/components/ai/LiveThinkingCenter";
import { useSession } from "@/components/providers/SessionProvider";

type AgentEvent = { tool: string; label: string; write: boolean; status: "ok" | "error" | "refused" | "pending" };
type Pending = { tool: string; label: string; args: Record<string, unknown> };
type PluginStatus = { id: string; name: string; description: string; available: boolean; reason?: string; tools: number; writeTools: number };
type ImageSearchResult = { title: string; imageUrl: string; thumbnailUrl: string; sourceUrl: string; sourceName: string; width?: number; height?: number };
type ThinkingMode = "auto" | "fast" | "balanced" | "deep" | "expert";
type ResolvedThinkingMode = "fast" | "balanced" | "deep" | "expert";
type WebSource = { title: string; url: string; snippet: string; provider: string; opened: boolean; status?: number };
type ChatMessage = { role: "user" | "assistant"; content: string; events?: AgentEvent[]; sources?: WebSource[]; model?: string; thinkingMode?: ResolvedThinkingMode; images?: ImageSearchResult[]; generatedImage?: string; attachment?: { name: string; mimeType: string; preview?: string } };
type ChatAttachment = { name: string; mimeType: string; data: string; preview?: string };
type SavedConversation = { id: string; title: string; updatedAt: string; messages: ChatMessage[]; contents?: unknown[]; language: string; pinned?: boolean; archived?: boolean };
function createConversationId() { return `bcx-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`; }
function sourceFavicon(url: string): string {
  try {
    const hostname = new URL(url).hostname;
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=64`;
  } catch {
    return "";
  }
}
function conversationGroup(value: string) {
  const date = new Date(value);
  const today = new Date();
  const start = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.floor((start(today) - start(date)) / 86400000);
  if (days <= 0) return "Aujourd’hui";
  if (days === 1) return "Hier";
  if (days < 7) return "7 derniers jours";
  if (days < 30) return "30 derniers jours";
  return "Plus anciens";
}
function friendlyError(error: unknown) {
  const raw = error instanceof Error ? error.message.toLowerCase() : "";
  if (/quota|rate.?limit|429|limite|facturation/.test(raw)) return "Le service est très sollicité pour le moment. Patiente un instant puis réessaie.";
  if (/timeout|timed out|network|fetch|connexion|503|502|504|indisponible|tempor/.test(raw)) return "La connexion a été interrompue pendant le traitement. Ta demande est conservée : tu peux réessayer.";
  if (/not configured|manquante|configuration|api key|clé gemini/.test(raw)) return "L’assistant est momentanément indisponible. Réessaie un peu plus tard.";
  return "Une difficulté a interrompu cette réponse. Ta conversation est conservée ; tu peux réessayer.";
}
type AgentResponse = {
  contents: unknown[]; events: AgentEvent[]; sources?: WebSource[]; answer?: string; pending?: Pending[]; continue?: boolean; model?: string; thinkingMode?: ResolvedThinkingMode; error?: string;
};

const CHAT_KEY = "bcx_ai_chat_v2";
const HISTORY_KEY = "bcx_ai_conversations_v1";
const PLUGINS_KEY = "bcx_ai_plugins_v1";
const LANGUAGES = ["TypeScript / Next.js", "JavaScript", "HTML / CSS", "Python", "Python / Django", "Dart / Flutter", "Kotlin / Android", "Java", "C / C++", "Rust", "PHP", "SQL / Supabase", "Autre langage"];
const STARTERS = [
  { icon: Code2, title: "Écrire un script", description: "Créer ou améliorer un script pour un besoin précis.", prompt: "Aide-moi à écrire un script pour : " },
  { icon: FileText, title: "Analyser un document", description: "Résumer un fichier et en dégager les points clés.", prompt: "Analyse et résume le document que je vais joindre." },
  { icon: Sparkles, title: "Trouver des idées", description: "Faire émerger des pistes originales pour mon projet.", prompt: "Aide-moi à trouver des idées originales pour : " },
  { icon: Search, title: "Explorer un sujet", description: "Obtenir une vue d’ensemble claire et structurée.", prompt: "Fais une recherche approfondie sur le sujet suivant : " },
];
const CODE_STARTERS = [
  { icon: Code2, title: "Créer une fonctionnalité", description: "Construire une solution complète, étape par étape.", prompt: "Aide-moi à créer cette fonctionnalité : " },
  { icon: Bug, title: "Corriger un bug", description: "Analyser une erreur et proposer un correctif fiable.", prompt: "Analyse et corrige ce bug : " },
  { icon: Layers, title: "Concevoir un projet", description: "Définir l’architecture et les étapes de réalisation.", prompt: "Conçois l’architecture d’un projet qui permet de : " },
  { icon: FileText, title: "Comprendre du code", description: "Expliquer un fichier ou un extrait clairement.", prompt: "Explique ce code et suggère des améliorations : " },
];
function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Lecture du fichier impossible."));
    reader.onerror = () => reject(new Error("Lecture du fichier impossible."));
    reader.readAsDataURL(file);
  });
}

function cloudConversation(item: SavedConversation) {
  const messages = item.messages.map((message) => {
    return {
      ...message,
      ...(message.attachment ? { attachment: { name: message.attachment.name, mimeType: message.attachment.mimeType } } : {}),
      ...(message.generatedImage?.startsWith("data:") ? { generatedImage: undefined } : {}),
    };
  });
  return {
    id: item.id,
    title: item.title,
    messages,
    language: item.language,
    pinned: item.pinned ?? false,
    archived: item.archived ?? false,
  };
}

async function saveCloudConversation(item: SavedConversation) {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch("/api/ai/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversation: cloudConversation(item) }),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(typeof result.error === "string" ? result.error : "Impossible d'enregistrer l'historique cloud.");
      }
      return;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("Échec de synchronisation cloud.");
      if (attempt < 2) await new Promise((resolve) => window.setTimeout(resolve, 500 * (2 ** attempt)));
    }
  }
  throw lastError ?? new Error("Impossible d'enregistrer l'historique cloud.");
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
  const { configured, loading: sessionLoading, user, signOut } = useSession();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [contents, setContents] = useState<unknown[]>([]);
  const [history, setHistory] = useState<SavedConversation[]>([]);
  const [historyReady, setHistoryReady] = useState(false);
  const [cloudReady, setCloudReady] = useState(false);
  const [cloudStatus, setCloudStatus] = useState<"local" | "loading" | "saving" | "synced" | "error">("local");
  const [syncAttempt, setSyncAttempt] = useState(0);
  const [historySearch, setHistorySearch] = useState("");
  const [activeConversationId, setActiveConversationId] = useState("");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [workspaceMode, setWorkspaceMode] = useState<"chat" | "code">("chat");
  const [showArchived, setShowArchived] = useState(false);
  const [conversationMenuId, setConversationMenuId] = useState("");
  const [renamingConversationId, setRenamingConversationId] = useState("");
  const [titleDraft, setTitleDraft] = useState("");
  const [shareConversationId, setShareConversationId] = useState("");
  const [shareUrl, setShareUrl] = useState("");
  const [shareError, setShareError] = useState("");
  const [sharing, setSharing] = useState(false);
  const [pending, setPending] = useState<Pending[] | null>(null);
  const [prompt, setPrompt] = useState("");
  const [editingMessageIndex, setEditingMessageIndex] = useState<number | null>(null);
  const [language, setLanguage] = useState(LANGUAGES[0]);
  const [thinkingMode, setThinkingMode] = useState<ThinkingMode>("auto");
  const [assistantProfile, setAssistantProfile] = useState<"auto" | "luna" | "terra" | "sol" | "bcx">("auto");
  function changeAssistantProfile(profile: "auto" | "luna" | "terra" | "sol" | "bcx") {
    setAssistantProfile(profile);
    setThinkingMode(profile === "bcx" ? "expert" : profile === "luna" ? "fast" : profile === "terra" ? "balanced" : profile === "sol" ? "deep" : "auto");
  }
  const [researchMode, setResearchMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [lastMessage, setLastMessage] = useState("");
  const [copiedPromptIndex, setCopiedPromptIndex] = useState<number | null>(null);
  const [feedbackByIndex, setFeedbackByIndex] = useState<Record<number, -1 | 1>>({});
  const [plugins, setPlugins] = useState<PluginStatus[] | null>(null);
  const [enabled, setEnabled] = useState<string[]>(["github", "registry", "web"]);
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
  const abortControllerRef = useRef<AbortController | null>(null);
  const historyRef = useRef<SavedConversation[]>([]);
  const cloudSaveQueueRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => { historyRef.current = history; }, [history]);

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
    setHistoryReady(true);
  }, []);
  useEffect(() => {
    try { sessionStorage.setItem(CHAT_KEY, JSON.stringify({ messages, contents, pending, language, activeConversationId })); } catch { /* quota : ignoré */ }
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, contents, pending, language, loading, activeConversationId]);

  useEffect(() => {
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(history)); } catch { /* quota : ignoré */ }
  }, [history, historyReady]);

  useEffect(() => {
    if (!activeConversationId || messages.length === 0) return;
    const firstUserMessage = messages.find((message) => message.role === "user")?.content ?? "Nouvelle conversation";
    const generatedTitle = firstUserMessage.replaceAll(String.fromCharCode(10), " ").slice(0, 56) || "Nouvelle conversation";
    setHistory((all) => {
      const existing = all.find((entry) => entry.id === activeConversationId);
      const item: SavedConversation = {
        ...existing,
        id: activeConversationId,
        title: existing?.title ?? generatedTitle,
        updatedAt: new Date().toISOString(),
        messages,
        contents,
        language,
      };
      return [item, ...all.filter((entry) => entry.id !== activeConversationId)].slice(0, 40);
    });
  }, [activeConversationId, messages, contents, language]);
  useEffect(() => { try { localStorage.setItem(PLUGINS_KEY, JSON.stringify(enabled)); } catch { /* ignoré */ } }, [enabled]);
  useEffect(() => () => { if (imageSource?.preview) URL.revokeObjectURL(imageSource.preview); }, [imageSource?.preview]);

  useEffect(() => {
    if (!historyReady || sessionLoading) return;
    if (!configured || !user) {
      setCloudReady(false);
      setCloudStatus("local");
      return;
    }

    let cancelled = false;
    setCloudReady(false);
    setCloudStatus("loading");
    void (async () => {
      try {
        const response = await fetch("/api/ai/conversations", { cache: "no-store" });
        const result = await response.json();
        if (!response.ok) throw new Error(typeof result.error === "string" ? result.error : "Impossible de charger l'historique cloud.");
        const remote: SavedConversation[] = Array.isArray(result.conversations) ? result.conversations.map((item: Record<string, unknown>) => ({
          id: String(item.id),
          title: String(item.title),
          updatedAt: String(item.updated_at),
          messages: item.messages as ChatMessage[],
          language: typeof item.language === "string" ? item.language : LANGUAGES[0],
          pinned: item.pinned === true,
          archived: item.archived === true,
        })) : [];
        const merged = new Map(remote.map((item) => [item.id, item]));
        for (const local of historyRef.current) {
          const cloud = merged.get(local.id);
          if (!cloud || Date.parse(local.updatedAt) > Date.parse(cloud.updatedAt)) merged.set(local.id, local);
        }
        const conversations = [...merged.values()]
          .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
          .slice(0, 40);
        for (let index = 0; index < conversations.length; index += 10) {
          const saveResponse = await fetch("/api/ai/conversations", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ conversations: conversations.slice(index, index + 10).map(cloudConversation) }),
          });
          if (!saveResponse.ok) {
            const saveResult = await saveResponse.json();
            throw new Error(typeof saveResult.error === "string" ? saveResult.error : "Impossible de synchroniser l'historique cloud.");
          }
          if (cancelled) return;
        }
        if (!cancelled) {
          historyRef.current = conversations;
          setHistory(conversations);
          setCloudReady(true);
          setCloudStatus("synced");
        }
      } catch {
        if (!cancelled) {
          setCloudReady(false);
          setCloudStatus("error");
        }
      }
    })();
    return () => { cancelled = true; };
  }, [configured, historyReady, sessionLoading, syncAttempt, user]);

  useEffect(() => {
    if (!cloudReady || !configured || !user || history.length === 0 || !activeConversationId) return;
    const conversation = history.find((item) => item.id === activeConversationId);
    if (!conversation) return;
    const timeout = window.setTimeout(() => {
      setCloudStatus("saving");
      cloudSaveQueueRef.current = cloudSaveQueueRef.current
        .catch(() => undefined)
        .then(() => saveCloudConversation(conversation))
        .then(() => setCloudStatus("synced"))
        .catch(() => setCloudStatus("error"));
    }, 750);
    return () => window.clearTimeout(timeout);
  }, [activeConversationId, cloudReady, configured, history, user]);

  const loadPlugins = useCallback(async () => {
    try {
      const res = await fetch("/api/ai/agent", { cache: "no-store" });
      const data = await res.json();
      setPlugins(data.plugins ?? []);
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

  async function runAgent(body: Record<string, unknown>, baseContents: unknown[], retryAttempt = 0, controller = new AbortController()) {
    if (retryAttempt === 0) abortControllerRef.current = controller;
    setLoading(true); setError("");
    let state = baseContents;
    let serverReportedError = false;
    let continuationCount = 0;
    const MAX_CONTINUATIONS = 2;
    try {
      for (;;) {
        const res = await fetch("/api/ai/agent", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Accept": "text/event-stream" },
          body: JSON.stringify({ ...body, contents: state, plugins: activePlugins.map((p) => p.id), language, thinkingMode, researchMode, stream: true }),
          signal: controller.signal,
        });
        if (!res.ok) {
          const failure = await res.json().catch(() => ({}));
          throw new Error(failure.error || "La requête a échoué.");
        }
        const contentType = res.headers.get("content-type") ?? "";
        if (!contentType.includes("text/event-stream")) {
          const fallbackData = await res.json().catch(() => null) as AgentResponse | null;
          if (!fallbackData || !Array.isArray(fallbackData.contents)) {
            throw new Error("Le serveur a renvoyé une réponse illisible.");
          }
          if (fallbackData.error) throw new Error(fallbackData.error);
          state = fallbackData.contents;
          setContents(fallbackData.contents);
          patchAssistant((message) => ({
            ...message,
            model: fallbackData.model,
            thinkingMode: fallbackData.thinkingMode,
            events: [...(message.events ?? []), ...(fallbackData.events ?? [])],
            sources: fallbackData.sources ?? message.sources,
          }));
          if (fallbackData.pending?.length) {
            setPending(fallbackData.pending);
            return;
          }
          if (typeof fallbackData.answer === "string") {
            patchAssistant((message) => ({ ...message, content: fallbackData.answer!, sources: fallbackData.sources ?? message.sources }));
            return;
          }
          if (!fallbackData.continue) return;
          if (continuationCount >= MAX_CONTINUATIONS) {
            patchAssistant((message) => ({ ...message, content: "La limite de poursuite automatique est atteinte. Le travail déjà effectué est conservé ; demande-moi de continuer si nécessaire." }));
            return;
          }
          continuationCount += 1;
          body = {};
          continue;
        }
        if (!res.body) throw new Error("Le flux de progression n’est pas disponible dans ce navigateur.");
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let data: AgentResponse | undefined;
        const consume = (block: string) => {
          let eventName = "message";
          const lines = block.split("\n");
          const payload: string[] = [];
          for (const line of lines) {
            if (line.startsWith("event:")) eventName = line.slice(6).trim();
            else if (line.startsWith("data:")) payload.push(line.slice(5).trim());
          }
          if (!payload.length) return;
          const value = JSON.parse(payload.join("\n")) as Record<string, unknown>;
          if (eventName === "activity") {
            const event = value as unknown as AgentEvent;
            patchAssistant((message) => ({ ...message, events: [...(message.events ?? []), event] }));
          } else if (eventName === "phase") {
            const phase = value as { phase?: string; label?: string; status?: string };
            const event: AgentEvent = { tool: `phase_${phase.phase ?? "work"}`, label: phase.label ?? "Traitement en cours", write: false, status: phase.status === "ok" ? "ok" : "pending" };
            patchAssistant((message) => ({ ...message, events: [...(message.events ?? []), event] }));
          } else if (eventName === "result") {
            data = value as unknown as AgentResponse;
          } else if (eventName === "stream_error") {
            serverReportedError = true;
            throw new Error(typeof value.error === "string" ? value.error : "Erreur pendant le traitement.");
          }
        };
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          buffer += decoder.decode(chunk.value, { stream: true }).replace(/\r\n/g, "\n");
          const blocks = buffer.split("\n\n");
          buffer = blocks.pop() ?? "";
          for (const block of blocks) consume(block);
        }
        buffer += decoder.decode();
        if (buffer.trim()) consume(buffer);
        if (!data) throw new Error("Le flux s’est terminé sans résultat final.");
        const finalData = data;
        state = finalData.contents;
        setContents(finalData.contents);
        patchAssistant((m) => ({ ...m, model: finalData.model, thinkingMode: finalData.thinkingMode, sources: finalData.sources ?? m.sources, events: [...(m.events ?? []).filter((e) => e.status !== "pending"), ...finalData.events] }));
        if (finalData.pending?.length) { setPending(finalData.pending); return; }
        if (finalData.answer !== undefined) {
          patchAssistant((m) => ({ ...m, content: finalData.answer!, sources: finalData.sources ?? m.sources }));
          return;
        }
        if (!finalData.continue) return;
        if (continuationCount >= MAX_CONTINUATIONS) {
          patchAssistant((message) => ({ ...message, content: "La limite de poursuite automatique est atteinte. Le travail déjà effectué est conservé ; demande-moi de continuer si nécessaire." }));
          return;
        }
        continuationCount += 1;
        body = {}; // poursuite automatique sans nouveau message
      }
    } catch (err) {
      if (controller.signal.aborted) {
        setError("");
        return;
      }
      const message = err instanceof Error ? err.message : "";
      const transportFailure = !serverReportedError && /network|fetch|connexion|connection|stream|flux|socket|timed out|timeout|interrupted|interrompue/i.test(message);
      // Never replay an approved write after an ambiguous transport failure: the server may have completed it before the stream dropped.
      const approvedWriteMayHaveExecuted = body.decision === "approve";
      if (transportFailure && !approvedWriteMayHaveExecuted && retryAttempt < 2) {
        const waitMs = Math.min(30_000, 1200 * (2 ** Math.min(retryAttempt, 5)));
        patchAssistant((current) => ({
          ...current,
          events: [...(current.events ?? []), {
            tool: "connection_retry",
            label: `Reconnexion automatique dans ${Math.ceil(waitMs / 1000)} s (tentative ${retryAttempt + 1})`,
            write: false,
            status: "pending",
          }],
        }));
        await new Promise((resolve) => window.setTimeout(resolve, waitMs));
        if (controller.signal.aborted) return;
        return await runAgent(body, state, retryAttempt + 1, controller);
      }
      setError(friendlyError(err));
    } finally {
      if (abortControllerRef.current === controller) abortControllerRef.current = null;
      setLoading(false);
    }
  }

  async function chooseImage(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Formats image acceptés : JPG, PNG et WebP.");
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      setError("L’image doit faire 4 Mo maximum pour être transmise de façon fiable à l’analyse IA.");
      return;
    }
    try {
      const dataUrl = await fileToDataUrl(file);
      const data = dataUrl.split(",")[1];
      if (!data) throw new Error("Lecture de l’image impossible.");
      setChatAttachment({ name: file.name, mimeType: file.type, data, preview: dataUrl });
      setImageSource(null);
      setImageMode("create");
      setImageIntent(false);
      setEditingMessageIndex(null);
      setShowTools(false);
      setError("");
      inputRef.current?.focus();
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
    setPrompt(""); // Comme pour une question normale, vider immédiatement la barre après l’envoi.
    try {
      const response = await fetch(imageMode === "edit" ? "/api/ai/images" : "/api/ai/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(imageMode === "edit"
          ? { prompt: content, mode: imageMode, ...(imageSource ? { imageData: imageSource.data, mimeType: imageSource.file.type } : {}) }
          : { prompt: content, aspectRatio: "1:1" }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || typeof data.image !== "string") throw new Error(data.error || "Impossible de générer cette image.");
      setImageResult({ image: data.image, model: data.model });
      setMessages((all) => [...all, { role: "user", content: (imageMode === "edit" ? "Modifier l’image : " : "Créer une image : ") + content }, { role: "assistant", content: imageMode === "edit" ? "Voici l’image modifiée." : "Voici l’image générée.", generatedImage: data.image }]);
      setPrompt("");
      setImageSource(null);
      setImageMode("create");
      setImageIntent(false);
    } catch (err) { setError(friendlyError(err)); }
    finally { setImageLoading(false); }
  }

  function isImageRequest(text: string) {
    return /\b(crée|creer|créer|prépare|preparer|préparer|conçois|concevoir|génère|generer|générer|dessine|dessiner|fabrique|produis|produire|make|create|generate|draw)\b.{0,70}\b(image|images|affiche|affiches|logo|logos|illustration|illustrations|visuel|visuels|photo|photos|poster|banner|bannière|banniere)\b|\b(image|affiche|logo|illustration|visuel|photo|poster|bannière|banniere)\b.{0,70}\b(crée|creer|créer|prépare|preparer|préparer|conçois|concevoir|génère|generer|générer|dessine|dessiner|make|create|generate|draw)\b/i.test(text);
  }

  function isImageSearchRequest(text: string) {
    return /\b(montre(?:-moi)?|affiche|trouve|recherche|cherche|voir|donne(?:-moi)?)\b.{0,80}\b(photos?|images?|photographies)\b|\b(photos?|images?|photographies)\b.{0,80}\b(de|sur|du|des|pour|à propos de)\b/i.test(text);
  }

  async function searchImages(query: string) {
    const content = query.trim();
    setMessages((all) => [...all, { role: "user", content }, { role: "assistant", content: "Je recherche des images pertinentes sur le Web…" }]);
    setPrompt("");
    setLastMessage(content);
    setError("");
    try {
      const response = await fetch("/api/ai/image-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: content.replace(/\b(montre(?:-moi)?|affiche|trouve|recherche|cherche|voir|donne(?:-moi)?)\b/ig, "").replace(/\b(photos?|images?|photographies)\b/ig, "").replace(/\b(de|sur|du|des|pour|à propos de)\b/ig, " ").trim() || content }),
      });
      const data = await response.json().catch(() => ({})) as { images?: ImageSearchResult[]; error?: string };
      if (!response.ok) throw new Error(data.error || "La recherche d’images a échoué.");
      const images = Array.isArray(data.images) ? data.images : [];
      setMessages((all) => all.map((message, index) => index === all.length - 1
        ? { ...message, content: images.length ? `J’ai trouvé ${images.length} images. Ouvre une image pour consulter sa source.` : "Je n’ai trouvé aucune image pour cette recherche. Essaie avec des mots-clés plus précis.", images }
        : message));
    } catch (err) {
      const message = friendlyError(err);
      setMessages((all) => all.map((item, index) => index === all.length - 1 ? { ...item, content: message } : item));
    }
  }

  async function send(text: string, forceResearch = false) {
    const content = text.trim();
    if ((!content && !chatAttachment) || loading || pending || sendLockRef.current) return;
    sendLockRef.current = true;
    const attachment = chatAttachment;
    // Les demandes de photos existantes sur le Web affichent une galerie, sans appeler la génération d’images.
    if (!attachment && imageMode !== "edit" && !imageIntent && isImageSearchRequest(content) && !isImageRequest(content)) {
      try {
        await searchImages(content);
      } finally {
        sendLockRef.current = false;
      }
      return;
    }
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
    setMessages((all) => [...all, { role: "user", content: visibleContent, ...(attachment ? { attachment: { name: attachment.name, mimeType: attachment.mimeType, ...(attachment.preview ? { preview: attachment.preview } : {}) } } : {}) }, { role: "assistant", content: "", events: [] }]);
    setPrompt(""); setLastMessage(content || `Analyse la pièce jointe ${attachment?.name ?? ""}`);
    setChatAttachment(null);
    try {
      await runAgent({ message: content || `Analyse la pièce jointe ${attachment?.name ?? ""} et explique son contenu.`, researchMode: forceResearch || researchMode }, baseContents);
      // Capture uniquement les informations durables explicitement formulées par l'utilisateur.
      if (configured && user && content && !attachment) {
        void fetch("/api/ai/memories/capture", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: content }),
        }).catch(() => undefined);
      }
    } catch (err) { setError(err instanceof Error ? err.message : "Une erreur est survenue."); }
    finally { setLoading(false); sendLockRef.current = false; }
  }

  async function decide(decision: "approve" | "reject") {
    if (!pending || loading) return;
    setPending(null);
    await runAgent({ decision }, contents);
  }

  async function resendEditedMessage() {
    if (editingMessageIndex === null || loading || pending || sendLockRef.current) return;
    const text = prompt.trim();
    if (!text) return;
    const previousMessages = messages.slice(0, editingMessageIndex);
    const baseContents = previousMessages.filter((message) => message.content).map((message) => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: message.content }],
    }));
    sendLockRef.current = true;
    setMessages([...previousMessages, { role: "user", content: text }, { role: "assistant", content: "", events: [] }]);
    setContents(baseContents);
    setLastMessage(text);
    setPrompt("");
    setEditingMessageIndex(null);
    setFeedbackByIndex({});
    setError("");
    try {
      await runAgent({ message: text, researchMode }, baseContents);
    } finally {
      setLoading(false);
      sendLockRef.current = false;
    }
  }

  function submitPrompt() {
    if (editingMessageIndex !== null) void resendEditedMessage();
    else void send(prompt);
  }

  function onSubmit(e: FormEvent) { e.preventDefault(); submitPrompt(); }
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
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submitPrompt(); }
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
    abortControllerRef.current?.abort();
    setMessages([]);
    setContents([]);
    setPending(null);
    setError("");
    setEditingMessageIndex(null);
    setImageResult(null);
    setImageSource(null);
    setChatAttachment(null);
    setImageMode("create");
    setImageIntent(false);
    setFeedbackByIndex({});
    setActiveConversationId(createConversationId());
    setShowNav(false);
    setShowTools(false);
    inputRef.current?.focus();
  }

  function openConversation(item: SavedConversation) {
    setActiveConversationId(item.id);
    setMessages(item.messages);
    setContents(item.contents ?? item.messages.filter((message) => message.content).map((message) => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: message.content }],
    })));
    setLanguage(item.language || LANGUAGES[0]);
    setPending(null);
    setError("");
    setFeedbackByIndex({});
    setImageResult(null);
    setShowNav(false);
  }

  function updateConversation(id: string, patch: Partial<Pick<SavedConversation, "title" | "pinned" | "archived">>) {
    const updatedAt = new Date().toISOString();
    const current = historyRef.current.find((item) => item.id === id);
    const updated = current ? { ...current, ...patch, updatedAt } : null;
    const next = historyRef.current.map((item) => item.id === id && updated ? updated : item);
    historyRef.current = next;
    setHistory(next);
    if (updated && id !== activeConversationId && cloudReady && configured && user) {
      setCloudStatus("saving");
      cloudSaveQueueRef.current = cloudSaveQueueRef.current
        .catch(() => undefined)
        .then(() => saveCloudConversation(updated))
        .then(() => setCloudStatus("synced"))
        .catch(() => setCloudStatus("error"));
    }
    setConversationMenuId("");
  }

  function saveConversationTitle(id: string) {
    const title = titleDraft.trim();
    if (title) updateConversation(id, { title: title.slice(0, 200) });
    setRenamingConversationId("");
  }

  async function createShareLink(item: SavedConversation) {
    setShareConversationId(item.id);
    setShareUrl("");
    setShareError("");
    setSharing(true);
    setConversationMenuId("");
    try {
      if (!configured || !user || !cloudReady) throw new Error("Connecte-toi et attends la synchronisation Supabase avant de partager.");
      await cloudSaveQueueRef.current.catch(() => undefined);
      await saveCloudConversation(item);
      const response = await fetch("/api/ai/conversations/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: item.id }),
      });
      const result = await response.json();
      if (!response.ok || typeof result.token !== "string") throw new Error(typeof result.error === "string" ? result.error : "Impossible de créer le lien de partage.");
      setShareUrl(`${window.location.origin}/share/${result.token}`);
    } catch (shareFailure) {
      setShareError(shareFailure instanceof Error ? shareFailure.message : "Impossible de créer le lien de partage.");
    } finally {
      setSharing(false);
    }
  }

  async function revokeShare() {
    if (!shareConversationId) return;
    try {
      const response = await fetch(`/api/ai/conversations/share?conversationId=${encodeURIComponent(shareConversationId)}`, { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) throw new Error(typeof result.error === "string" ? result.error : "Impossible de révoquer le lien.");
      setShareUrl("");
      setShareError("Le lien a été révoqué.");
    } catch (revokeFailure) {
      setShareError(revokeFailure instanceof Error ? revokeFailure.message : "Impossible de révoquer le lien.");
    }
  }

  async function rateAnswer(index: number, rating: -1 | 1) {
    try {
      const response = await fetch("/api/ai/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating, category: "chat", conversationId: activeConversationId }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(typeof result.error === "string" ? result.error : "Impossible d'envoyer ton évaluation.");
      setFeedbackByIndex((all) => ({ ...all, [index]: rating }));
    } catch (feedbackFailure) {
      setError(feedbackFailure instanceof Error ? feedbackFailure.message : "Impossible d'envoyer ton évaluation.");
    }
  }

  function deleteConversation(id: string) {
    const deleted = historyRef.current.find((item) => item.id === id);
    const remaining = historyRef.current.filter((item) => item.id !== id);
    historyRef.current = remaining;
    setHistory(remaining);
    setConversationMenuId("");
    if (configured && user && cloudReady) {
      void fetch(`/api/ai/conversations?id=${encodeURIComponent(id)}`, { method: "DELETE" })
        .then((response) => {
          if (!response.ok) throw new Error("Impossible de supprimer la conversation du cloud.");
        })
        .catch(() => {
          setCloudStatus("error");
          if (deleted) {
            const restored = [...historyRef.current.filter((item) => item.id !== id), deleted]
              .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
              .slice(0, 40);
            historyRef.current = restored;
            setHistory(restored);
          }
        });
    }
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

  const visibleHistory = history
    .filter((item) => Boolean(item.archived) === showArchived)
    .filter((item) => item.title.toLocaleLowerCase("fr").includes(historySearch.toLocaleLowerCase("fr")));
  const pinnedHistory = visibleHistory.filter((item) => item.pinned && !showArchived);
  const datedHistory = visibleHistory.filter((item) => !item.pinned || showArchived);

  function renderConversationRow(item: SavedConversation) {
    return (
      <div key={item.id} className={`classic-history-row ${item.id === activeConversationId ? "active" : ""}`}>
        {renamingConversationId === item.id ? (
          <input
            autoFocus
            className="bcx-rename-input"
            value={titleDraft}
            maxLength={200}
            aria-label="Nouveau titre de conversation"
            onChange={(event) => setTitleDraft(event.target.value)}
            onBlur={() => saveConversationTitle(item.id)}
            onKeyDown={(event) => {
              if (event.key === "Enter") { event.preventDefault(); saveConversationTitle(item.id); }
              if (event.key === "Escape") setRenamingConversationId("");
            }}
          />
        ) : (
          <button type="button" onClick={() => openConversation(item)} title={item.title}>
            {item.pinned && <Pin size={12} aria-label="Épinglée" />}
            <span>{item.title}</span>
          </button>
        )}
        <button
          type="button"
          className="classic-delete-chat bcx-conversation-menu-button"
          aria-label={`Options pour ${item.title}`}
          aria-expanded={conversationMenuId === item.id}
          title="Options"
          onClick={() => setConversationMenuId((current) => current === item.id ? "" : item.id)}
        >
          <MoreHorizontal size={16} />
        </button>
        {conversationMenuId === item.id && (
          <div className="bcx-conversation-menu" role="group" aria-label={`Options pour ${item.title}`}>
            <button type="button" onClick={() => { setTitleDraft(item.title); setRenamingConversationId(item.id); setConversationMenuId(""); }}><Pencil size={14} /> Renommer</button>
            <button type="button" onClick={() => updateConversation(item.id, { pinned: !item.pinned })}><Pin size={14} /> {item.pinned ? "Désépingler" : "Épingler"}</button>
            <button type="button" onClick={() => updateConversation(item.id, { archived: !item.archived })}><Archive size={14} /> {item.archived ? "Désarchiver" : "Archiver"}</button>
            {!item.archived && <button type="button" onClick={() => void createShareLink(item)}><Share2 size={14} /> Partager</button>}
            <button type="button" className="danger" onClick={() => deleteConversation(item.id)}><X size={14} /> Supprimer</button>
          </div>
        )}
      </div>
    );
  }

  function renderHistorySections() {
    const groups = showArchived
      ? ["Aujourd’hui", "Hier", "7 derniers jours", "30 derniers jours", "Plus anciens"]
      : ["Aujourd’hui", "Hier", "7 derniers jours", "30 derniers jours", "Plus anciens"];
    return (
      <>
        {!showArchived && pinnedHistory.length > 0 && (
          <section className="bcx-history-group">
            <div className="bcx-history-group-title">Épinglées</div>
            {pinnedHistory.map(renderConversationRow)}
          </section>
        )}
        {groups.map((group) => {
          const items = datedHistory.filter((item) => conversationGroup(item.updatedAt) === group);
          return items.length ? (
            <section className="bcx-history-group" key={group}>
              <div className="bcx-history-group-title">{group}</div>
              {items.map(renderConversationRow)}
            </section>
          ) : null;
        })}
        {visibleHistory.length === 0 && (
          <p className="classic-history-empty">
            {historySearch ? "Aucune conversation correspondante." : showArchived ? "Aucune conversation archivée." : "Tes conversations apparaîtront ici."}
          </p>
        )}
      </>
    );
  }

  function renderSidebarLinks() {
    return (
      <nav className="bcx-rail-nav" aria-label="Espaces BCX">
        {NAV_GROUPS[0].items.slice(1).map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} onClick={() => setShowNav(false)}><Icon size={16} />{label}</Link>
        ))}
        <details className="bcx-tools-menu">
          <summary><Plug size={16} /> Outils et réglages <ChevronDown size={14} /></summary>
          <div className="bcx-tools-menu-links">
            {NAV_GROUPS.slice(1).flatMap(({ items }) => items).map(({ href, label, icon: Icon }) => (
              <Link key={href} href={href} onClick={() => setShowNav(false)}><Icon size={16} />{label}</Link>
            ))}
          </div>
        </details>
      </nav>
    );
  }

  function renderAccountActions() {
    if (!user) {
      return (
        <>
          <Link href="/login?mode=signup" className="bcx-account-card bcx-create-account" onClick={() => setShowNav(false)}>
            <span className="bcx-account-avatar"><UserPlus size={15}/></span>
            <span className="bcx-account-copy"><strong>Créer un compte</strong><small>Enregistrer tes conversations</small></span>
          </Link>
          <Link href="/login" className="bcx-auth-login" onClick={() => setShowNav(false)}><LogIn size={15}/> Se connecter</Link>
        </>
      );
    }

    return (
      <div className="bcx-account-card">
        <Link href="/settings" className="bcx-account-profile" onClick={() => setShowNav(false)}>
          <span className="bcx-account-avatar">{(user.email?.[0] ?? "B").toUpperCase()}</span>
          <span className="bcx-account-copy"><strong>{user.email?.split("@")[0] ?? "Compte BCX"}</strong><small>{user.email ?? "Compte connecté"}</small></span>
        </Link>
        <button type="button" className="bcx-signout-button" onClick={() => void signOut()} aria-label="Se déconnecter" title="Se déconnecter"><LogOut size={15}/></button>
      </div>
    );
  }

  return (
    <main className={`chat bcx-classic-chat ${sidebarCollapsed ? "is-sidebar-collapsed" : ""}`}>
      <aside className="classic-chat-sidebar" aria-label="Historique des conversations">
        <div className="classic-sidebar-brand"><Logo subtitle="Espace de travail" /></div>
        <button type="button" className="classic-new-chat" onClick={newChat}><SquarePen size={17}/> Nouveau chat</button>
        <label className="bcx-history-search"><Search size={15}/><input value={historySearch} onChange={(event) => setHistorySearch(event.target.value)} placeholder="Rechercher" aria-label="Rechercher dans l’historique"/></label>
        {renderSidebarLinks()}
        <div className="bcx-history-heading-row">
          <div className="classic-history-heading">{showArchived ? "Archives" : "Récents"}</div>
          <button type="button" className="bcx-archive-toggle" onClick={() => setShowArchived((value) => !value)} aria-pressed={showArchived}>
            {showArchived ? "Voir l’historique" : `Archives${history.filter((item) => item.archived).length ? ` · ${history.filter((item) => item.archived).length}` : ""}`}
          </button>
        </div>
        <div className="classic-history-list">{renderHistorySections()}</div>
        <div className="classic-sidebar-bottom">
          {renderAccountActions()}
        </div>
      </aside>
      <header className="bcx-chat-toolbar" aria-label="Barre supérieure Bickri AI">
        <div className="bcx-toolbar-brand">
          <button type="button" className="btn btn-ghost btn-icon bcx-toolbar-menu" aria-label="Ouvrir la navigation et l’historique" aria-expanded={showNav} onClick={() => setShowNav((v) => !v)}><Menu size={19} /></button>
          <button type="button" className="btn btn-ghost btn-icon bcx-sidebar-collapse" aria-label={sidebarCollapsed ? "Afficher la barre latérale" : "Réduire la barre latérale"} aria-expanded={!sidebarCollapsed} onClick={() => setSidebarCollapsed((value) => !value)}><Menu size={18} /></button>
        </div>
        <nav className="bcx-workspace-tabs" aria-label="Espaces de travail">
          <button type="button" aria-pressed={workspaceMode === "chat"} onClick={() => setWorkspaceMode("chat")}>Chats</button>
          <button type="button" aria-pressed={workspaceMode === "code"} onClick={() => setWorkspaceMode("code")}>Code</button>
        </nav>
        <div className="bcx-toolbar-actions">
          <ThemeToggle />
          {cloudStatus === "error" ? (
            <button type="button" className="bcx-cloud-status error" onClick={() => setSyncAttempt((attempt) => attempt + 1)} title="Réessayer la synchronisation">Cloud · Réessayer</button>
          ) : cloudStatus !== "local" && (
            <span className="bcx-cloud-status" role="status">{cloudStatus === "loading" ? "Synchronisation…" : cloudStatus === "saving" ? "Enregistrement…" : "Synchronisé"}</span>
          )}
          <button type="button" className="btn btn-ghost btn-icon bcx-toolbar-new-chat" aria-label="Nouvelle conversation" title="Nouvelle conversation" onClick={newChat}><SquarePen size={18} /></button>
        </div>
      </header>
      {showNav && <div className="plugin-popover bcx-nav-popover" role="dialog" aria-label="Historique des conversations">
        <div className="row"><div className="grow"><Logo subtitle="Espace de travail" /></div><button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => setShowNav(false)} aria-label="Fermer"><X /></button></div>
        <button type="button" className="btn btn-ghost" style={{width:"100%",justifyContent:"flex-start"}} onClick={() => { setShowNav(false); newChat(); }}><SquarePen size={18}/> Nouvelle conversation</button>
        <label className="bcx-history-search bcx-mobile-history-search"><Search size={15}/><input value={historySearch} onChange={(event) => setHistorySearch(event.target.value)} placeholder="Rechercher dans l’historique…" aria-label="Rechercher dans l’historique"/></label>
        {renderSidebarLinks()}
        <div className="bcx-history-heading-row"><div className="classic-history-heading">Récents</div><button type="button" className="bcx-archive-toggle" onClick={() => setShowArchived((value) => !value)}>{showArchived ? "Historique" : "Archives"}</button></div>
        <div className="bcx-history-list">{renderHistorySections()}</div>
        <div className="bcx-mobile-account-actions">{renderAccountActions()}</div>
      </div>}
      <div className="chat-main">
        <div className="chat-scroll">
          <div className="chat-inner">
            {messages.length === 0 ? (
              <>
                <div className={`chat-hero ${workspaceMode === "code" ? "is-codex-mode" : ""}`}>
                  <span className="bcx-chat-emblem"><LogoMark /></span>
                  {workspaceMode === "code" && <span className="bcx-mode-eyebrow"><Code2 size={12}/> BICKRI CODEX · {language}</span>}
                  <h1>{workspaceMode === "code" ? "Qu’allons-nous coder aujourd’hui ?" : "Que souhaites-tu créer ?"}</h1>
                  <p>{workspaceMode === "code" ? "Décris ce que tu veux construire, corriger ou comprendre. Bickri Codex travaille avec toi dans cette conversation." : "Écris une demande ou joins un fichier pour commencer."}</p>
                </div>
                <div className="starter-grid">
                  {(workspaceMode === "code" ? CODE_STARTERS : STARTERS).map(({ icon: Icon, title, description, prompt: starterPrompt }) => (
                    <button key={title} className="starter bcx-quick-start" onClick={() => { setPrompt(starterPrompt); inputRef.current?.focus(); }}>
                      <Icon aria-hidden="true" /><span><strong>{title}</strong><small>{description}</small></span>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <div aria-live="polite" className="bcx-message-list" style={{ display: "grid", gap: 16 }}>
                {messages.map((m, i) => {
                  const isLast = i === messages.length - 1;
                  if (m.role === "assistant" && !m.content && !m.events?.length && !(isLast && loading)) return null;
                  return (
                    <article key={i} className={`msg bcx-clean-message ${m.role}`}>
                      <div className="bcx-message-content" style={{ minWidth: 0, width: "100%" }}>
                        {m.role === "user" ? (
                          <>
                            <div className="msg-text">{m.content}</div>
                            {m.attachment?.preview && <img src={m.attachment.preview} alt={`Pièce jointe : ${m.attachment.name}`} loading="lazy" style={{ display: "block", maxWidth: "min(100%, 360px)", maxHeight: 320, objectFit: "contain", borderRadius: 14, border: "1px solid var(--border)", marginTop: 10 }} />}
                            {m.attachment && <small className="muted" style={{ display: "block", marginTop: 6 }}>{m.attachment.name} · {m.attachment.mimeType}</small>}
                            <div className="row" style={{ gap: 6, marginTop: 8 }}>
                              {!m.attachment && <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setEditingMessageIndex(i); setPrompt(m.content); inputRef.current?.focus(); }} aria-label="Modifier le message" title="Modifier le message"><Pencil size={14}/> Modifier</button>}
                              <button
                                type="button"
                                className="btn btn-ghost btn-sm"
                                onClick={async () => {
                                  try {
                                    await navigator.clipboard.writeText(m.content);
                                    setCopiedPromptIndex(i);
                                    window.setTimeout(() => setCopiedPromptIndex((current) => current === i ? null : current), 1800);
                                  } catch {
                                    setError("Impossible de copier le prompt sur cet appareil.");
                                  }
                                }}
                                aria-label="Copier la question ou le prompt"
                                title="Copier la question ou le prompt"
                              >
                                {copiedPromptIndex === i ? <Check size={15} /> : <Copy size={15} />}
                                {copiedPromptIndex === i ? "Copié" : "Copier le prompt"}
                              </button>
                            </div>
                          </>
                        ) : (
                          <>
                            {!!m.events?.length && <details className="bcx-research-timeline" open={isLast && loading}>
                              <summary><span>{isLast && loading ? "Réflexion en cours" : "Réflexion terminée"}</span><small>{m.events.length} opérations · journal opérationnel</small></summary>
                              <ToolEvents events={m.events} />
                            </details>}


                            {m.content && <Markdown>{m.content}</Markdown>}
                            {m.generatedImage && <figure style={{ margin: "14px 0 0", maxWidth: 760 }}><a href={m.generatedImage} target="_blank" rel="noopener noreferrer"><img src={m.generatedImage} alt="Image créée par Bickri IA" style={{ display: "block", width: "100%", height: "auto", maxHeight: 640, objectFit: "contain", borderRadius: 14, border: "1px solid var(--border)", background: "var(--surface-muted)" }} /></a><figcaption style={{ marginTop: 8, fontSize: 12, color: "var(--muted-foreground)" }}>Image générée par Bickri IA</figcaption></figure>}
                            {!!m.sources?.length && (
                              <div className="bcx-source-favicons" aria-label="Sources consultées" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
                                <span style={{ fontSize: 12, color: "var(--muted-foreground)", fontWeight: 600 }}>Sources</span>
                                {Array.from(new Map(m.sources.map((source) => {
                                  try { return [new URL(source.url).hostname, source]; } catch { return [source.url, source]; }
                                })).values()).slice(0, 6).map((source) => (
                                  <a key={source.url} href={source.url} target="_blank" rel="noopener noreferrer" title={source.title || source.url} aria-label={`Ouvrir la source : ${source.title || source.url}`} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 27, height: 27, border: "1px solid var(--border)", borderRadius: "50%", background: "var(--surface)", overflow: "hidden" }}>
                                    {sourceFavicon(source.url) ? <img src={sourceFavicon(source.url)} alt="" loading="lazy" referrerPolicy="no-referrer" style={{ width: 18, height: 18, objectFit: "contain" }} /> : <span aria-hidden="true" style={{ fontSize: 14 }}>🌐</span>}
                                  </a>
                                ))}
                              </div>
                            )}
                            {!!m.images?.length && (
                              <div className="bcx-image-search-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 180px), 1fr))", gap: 12, marginTop: 14 }}>
                                {m.images.map((image, imageIndex) => (
                                  <article key={image.imageUrl + imageIndex} style={{ minWidth: 0, border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden", background: "var(--surface)" }}>
                                    <a href={image.sourceUrl || image.imageUrl} target="_blank" rel="noopener noreferrer" style={{ display: "block" }} aria-label={`Ouvrir la source de ${image.title}`}>
                                      <img src={image.thumbnailUrl || image.imageUrl} alt={image.title} loading="lazy" referrerPolicy="no-referrer" style={{ display: "block", width: "100%", height: 180, objectFit: "cover", background: "var(--surface-muted)" }} />
                                    </a>
                                    <div style={{ padding: 10 }}>
                                      <p style={{ fontSize: 13, margin: "0 0 6px", overflowWrap: "anywhere" }}>{image.title}</p>
                                      {image.sourceUrl && <a href={image.sourceUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: "var(--muted-foreground)" }}>{image.sourceName || "Voir la source"} ↗</a>}
                                    </div>
                                  </article>
                                ))}
                              </div>
                            )}
                            {m.content && (
                              <div className="row" style={{ gap: 6, marginTop: 10, flexWrap: "wrap" }} aria-label="Actions sur la réponse">
                                <button type="button" className="btn btn-ghost btn-sm" onClick={() => { void navigator.clipboard.writeText(m.content).catch(() => setError("Impossible de copier la réponse sur cet appareil.")); }} aria-label="Copier la réponse" title="Copier la réponse"><Copy size={15} /> Copier</button>
                                <button type="button" className={`btn btn-ghost btn-sm ${feedbackByIndex[i] === 1 ? "is-rated" : ""}`} onClick={() => void rateAnswer(i, 1)} disabled={Boolean(feedbackByIndex[i])} aria-label="Évaluer positivement la réponse" title="Bonne réponse"><ThumbsUp size={15}/></button>
                                <button type="button" className={`btn btn-ghost btn-sm ${feedbackByIndex[i] === -1 ? "is-rated" : ""}`} onClick={() => void rateAnswer(i, -1)} disabled={Boolean(feedbackByIndex[i])} aria-label="Évaluer négativement la réponse" title="Réponse à améliorer"><ThumbsDown size={15}/></button>
                                {hasStudioCode(m.content) && <Link href="/studio" className="btn btn-ghost btn-sm" onClick={() => transferToStudio(m.content)}><Layers size={15} /> Ouvrir dans le Studio</Link>}
                                {isLast && !loading && <button type="button" className="btn btn-ghost btn-sm" onClick={retry} disabled={!lastMessage || Boolean(pending)} aria-label="Régénérer la réponse" title="Régénérer la réponse"><RefreshCw size={15} /> Régénérer</button>}
                              </div>
                            )}
                            {isLast && loading && (
                              <div className="bcx-response-activity">
                                <div className="bcx-reflection" role="status">
                                  <span className="bcx-reflection-mark" aria-hidden="true"><Sparkles size={19} /></span>
                                  <span>{m.content ? "Réponse en cours…" : "Réflexion en cours…"}</span>
                                </div>
                                {!!m.events?.length && <LiveThinkingCenter events={m.events} mode={thinkingMode} />}
                              </div>
                            )}
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
              <div className="alert alert-warning bcx-friendly-error" role="status">
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
          {showTools && <div className="plugin-popover bcx-tools-popover" role="dialog" aria-label="Ajouter à la conversation">
            <div className="row"><b className="grow">Ajouter à la conversation</b><button type="button" className="btn btn-ghost btn-icon btn-sm" aria-label="Fermer les outils" onClick={() => setShowTools(false)}><X size={16} /></button></div>
            <div className="bcx-tool-grid">
              <button type="button" className={`btn bcx-attach-action ${researchMode ? "is-active" : ""}`} aria-pressed={researchMode} onClick={() => setResearchMode((value) => !value)} disabled={loading}><Search size={17} /> {researchMode ? "Recherche Web activée" : "Activer la recherche Web"}</button>
              <button type="button" className="btn bcx-attach-action" onClick={() => { setShowTools(false); imageFileRef.current?.click(); }}><ImagePlus size={17} /> Joindre une photo à analyser</button>
              <button type="button" className="btn bcx-attach-action" onClick={() => { setShowTools(false); fileInputRef.current?.click(); }}><FileText size={17} /> Importer un fichier ou du code</button>
              <div className="bcx-voice-control"><span>Conversation vocale</span><VoiceAssistant onSend={(text) => send(text)} assistantResponse={messages.slice().reverse().find((message) => message.role === "assistant")?.content ?? ""} busy={loading} blocked={Boolean(pending)} /></div>
              {messages.length > 0 && <button type="button" className="btn bcx-attach-action" onClick={() => {
                const payload = { app: "BICKRI CODEX SYSTEM", exportedAt: new Date().toISOString(), language, messages };
                const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
                const url = URL.createObjectURL(blob);
                const anchor = document.createElement("a");
                anchor.href = url;
                anchor.download = `bcx-conversation-${new Date().toISOString().slice(0, 10)}.json`;
                document.body.appendChild(anchor);
                anchor.click();
                anchor.remove();
                URL.revokeObjectURL(url);
                setShowTools(false);
              }}><FileText size={17} /> Exporter la conversation</button>}
              <Link className="btn" href="/studio" onClick={() => setShowTools(false)}><Layers size={17} /> Ouvrir l’éditeur</Link>
              <Link className="btn bcx-attach-action" href="/plugins" onClick={() => setShowTools(false)}><Plug size={17} /> Plugins et intégrations</Link>
              <Link className="btn bcx-attach-action" href="/ai/memories" onClick={() => setShowTools(false)}><User size={17} /> Mémoire personnelle</Link>
              <Link className="btn bcx-attach-action" href="/ai/spreadsheets" onClick={() => setShowTools(false)}><FileText size={17} /> Analyse Excel</Link>
              <Link className="btn bcx-attach-action" href="/ai/documents" onClick={() => setShowTools(false)}><FileText size={17} /> Documents</Link>
              <Link className="btn bcx-attach-action" href="/ai/execute" onClick={() => setShowTools(false)}><Bug size={17} /> Exécuter du code</Link>
              <Link className="btn bcx-attach-action" href="/images" onClick={() => setShowTools(false)}><ImageIcon size={17} /> Studio d’images</Link>
              <Link className="btn bcx-attach-action" href="/settings" onClick={() => setShowTools(false)}><User size={17} /> Paramètres</Link>
              
            </div>
          </div>}
          {chatAttachment && <div className="bcx-image-attachment"><span className="attachment-preview-icon">{chatAttachment.preview ? <img src={chatAttachment.preview} alt="" /> : <FileText size={22} />}</span><div className="grow"><b>Pièce jointe prête</b><small>{chatAttachment.name} · {chatAttachment.mimeType}</small></div><button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => setChatAttachment(null)} aria-label="Retirer la pièce jointe"><X size={16} /></button></div>}
          {imageSource && <div className="bcx-image-attachment"><img src={imageSource.preview} alt="Image à modifier" /><div className="grow"><b>Image à modifier</b><small>{imageSource.file.name}</small></div><button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => { setImageSource(null); setImageMode("create"); }} aria-label="Retirer l’image"><X size={16} /></button></div>}
          <form className="composer" onSubmit={onSubmit}>
            <label htmlFor="ai-input" className="sr-only">Message</label>
            {editingMessageIndex !== null && <div className="bcx-editing-indicator"><Pencil size={13}/> Modification du message <button type="button" onClick={() => { setEditingMessageIndex(null); setPrompt(""); }} aria-label="Annuler la modification"><X size={14}/></button></div>}
            <textarea id="ai-input" ref={inputRef} rows={1} value={prompt} maxLength={8000} onChange={(e) => setPrompt(e.target.value)} onKeyDown={onKeyDown} disabled={Boolean(pending)} placeholder={pending ? "Valide ou refuse l'action en attente…" : editingMessageIndex !== null ? "Modifie ton message puis envoie-le" : workspaceMode === "code" ? "Décris le code que tu veux créer ou corriger…" : "Écris à Bickri AI…"} />
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
              <span className="bcx-composer-spacer" aria-hidden="true" />
              {workspaceMode === "code" && (
                <select className="bcx-code-language-picker" value={language} onChange={(event) => setLanguage(event.target.value)} aria-label="Langage du projet">
                  {LANGUAGES.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              )}
              <div className="bcx-composer-profiles" role="group" aria-label="Choisir le profil IA">
                {(["auto", "luna", "terra", "sol", "bcx"] as const).map((profile) => (
                  <button key={profile} type="button" className={assistantProfile === profile ? "is-active" : ""} aria-pressed={assistantProfile === profile} onClick={() => changeAssistantProfile(profile)} disabled={loading} title={profile === "bcx" ? "Option C : orchestration hybride, revue multi-agents, outils et vérifications renforcées" : undefined}>
                    {profile === "bcx" ? "BCX C" : profile.toUpperCase()}
                  </button>
                ))}
              </div>
              {loading ? (
                <button type="button" className="btn btn-ghost btn-sm bcx-stop-generation" onClick={() => abortControllerRef.current?.abort()} aria-label="Arrêter la génération" title="Arrêter la génération"><X size={14}/><span>Arrêter</span></button>
              ) : null}
              <button
                className="btn btn-primary btn-icon btn-sm composer-send"
                type="button"
                onClick={submitPrompt}
                disabled={imageLoading || loading || (!prompt.trim() && !chatAttachment) || Boolean(pending)}
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

      {shareConversationId && (
        <div className="bcx-dialog-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) { setShareConversationId(""); setShareUrl(""); setShareError(""); }
        }}>
          <section className="bcx-share-dialog" role="dialog" aria-modal="true" aria-labelledby="bcx-share-title">
            <header><div><h2 id="bcx-share-title">Partager la conversation</h2><p>Le lien ouvre une copie en lecture seule.</p></div><button type="button" className="btn btn-ghost btn-icon" onClick={() => { setShareConversationId(""); setShareUrl(""); setShareError(""); }} aria-label="Fermer"><X size={18}/></button></header>
            {shareUrl && <label className="bcx-share-link"><span>Lien de partage</span><input readOnly value={shareUrl} onFocus={(event) => event.currentTarget.select()} aria-label="Lien de partage en lecture seule"/></label>}
            {sharing && <p className="bcx-share-status" role="status">Préparation du lien sécurisé…</p>}
            {shareError && <p className="bcx-share-status" role="status">{shareError}</p>}
            <footer>
              {shareUrl && <button type="button" className="btn btn-ghost" disabled={sharing} onClick={() => {
                if (!navigator.clipboard) { setShareError("Sélectionne le lien pour le copier manuellement."); return; }
                void navigator.clipboard.writeText(shareUrl).then(() => setShareError("Lien copié.")).catch(() => setShareError("Sélectionne le lien pour le copier manuellement."));
              }}><Link2 size={16}/> Copier le lien</button>}
              {shareUrl && <button type="button" className="btn btn-ghost danger" disabled={sharing} onClick={() => void revokeShare()}>Révoquer</button>}
              <button type="button" className="btn btn-primary" onClick={() => { setShareConversationId(""); setShareUrl(""); setShareError(""); }}>Terminé</button>
            </footer>
          </section>
        </div>
      )}
    </main>
  );
}

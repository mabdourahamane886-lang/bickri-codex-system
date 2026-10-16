"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import {
  ArrowUp, Bug, Check, CircleAlert, CircleCheck, CircleX, Fingerprint, GitBranch, Globe, Layers, Loader2, LogIn,
  Plug, RefreshCw, ShieldAlert, Sparkles, SquarePen, User, X, Plus, ImagePlus, WandSparkles, Menu, BookOpen, Folder, Clock3, Compass, FileText,
} from "lucide-react";
import { Markdown } from "@/components/ai/Markdown";
import { VoiceAssistant } from "@/components/ai/VoiceAssistant";
import { Badge } from "@/components/ui/Badge";
import { useConfig } from "@/hooks/useConfig";

type AgentEvent = { tool: string; label: string; write: boolean; status: "ok" | "error" | "refused" | "pending" };
type Pending = { tool: string; label: string; args: Record<string, unknown> };
type PluginStatus = { id: string; name: string; description: string; available: boolean; reason?: string; tools: number; writeTools: number };
type ChatMessage = { role: "user" | "assistant"; content: string; events?: AgentEvent[]; model?: string; generatedImage?: string };
type AgentResponse = {
  contents: unknown[]; events: AgentEvent[]; answer?: string; pending?: Pending[]; continue?: boolean; model?: string; error?: string;
};

const CHAT_KEY = "bcx_ai_chat_v2";
const PLUGINS_KEY = "bcx_ai_plugins_v1";
const MAX_CONTINUATIONS = 4;
const LANGUAGES = ["TypeScript / Next.js", "JavaScript", "HTML / CSS", "Python", "Python / Django", "Dart / Flutter", "Kotlin / Android", "Java", "C / C++", "Rust", "PHP", "SQL / Supabase", "Autre langage"];
const PLUGIN_ICONS: Record<string, typeof GitBranch> = { github: GitBranch, registry: Fingerprint, web: Globe };
const STARTERS = [
  { icon: GitBranch, text: "Liste les branches et les derniers commits de mabdourahamane886-lang/bickri-codex-system." },
  { icon: Layers, text: "Crée une application web responsive en Next.js avec authentification Supabase." },
  { icon: Bug, text: "Explique et corrige cette erreur TypeScript : " },
  { icon: Fingerprint, text: "Quel serait le prochain identifiant BCX libre pour la catégorie AI en série THETA ?" },
];

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
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showNav, setShowNav] = useState(false);
  const [imageMode, setImageMode] = useState(false);
  const [attachedImage, setAttachedImage] = useState<{ data: string; type: string; name: string } | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
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
      const p = JSON.parse(localStorage.getItem(PLUGINS_KEY) || "null");
      if (Array.isArray(p)) setEnabled(p);
    } catch { /* ignoré */ }
  }, []);
  useEffect(() => {
    try { sessionStorage.setItem(CHAT_KEY, JSON.stringify({ messages, contents, pending, language })); } catch { /* quota : ignoré */ }
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, contents, pending, language, loading]);
  useEffect(() => { try { localStorage.setItem(PLUGINS_KEY, JSON.stringify(enabled)); } catch { /* ignoré */ } }, [enabled]);

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
    const shouldGenerateImage = /image|illustration|dessin|dessine|génère|genere|crée une image|cree une image|logo|affiche|visuel|maquette|diagramme|infographie|schéma|schema|visualise|visualisation|render|rendu graphique/i.test(originalPrompt);
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
          if (shouldGenerateImage && originalPrompt) {
            try {
              const imageRes = await fetch("/api/ai/images", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ mode: "generate", prompt: `Crée une illustration visuelle de haute qualité qui accompagne cette demande et sa réponse. Demande : ${originalPrompt.slice(0, 1200)}. Réponse : ${data.answer!.slice(0, 1000)}. Produis uniquement l’image, sans texte explicatif ajouté.` }),
              });
              const imageData = await imageRes.json().catch(() => ({}));
              if (imageRes.ok && typeof imageData.image === "string" && imageData.image.startsWith("data:image/")) {
                patchAssistant((m) => ({ ...m, generatedImage: imageData.image }));
              } else if (!imageRes.ok) {
                console.warn("Image contextuelle indisponible:", imageData.error || imageRes.status);
              }
            } catch (imageError) {
              console.warn("La génération d’image contextuelle a échoué.", imageError);
            }
          }
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

  async function send(text: string) {
    const content = text.trim();
    if (!content || loading || pending || sendLockRef.current) return;
    sendLockRef.current = true;
    const imageTask = imageMode || Boolean(attachedImage);
    setMessages((all) => [...all, { role: "user", content }, { role: "assistant", content: "", events: [] }]);
    setPrompt(""); setLastMessage(content);
    try {
      if (imageTask) {
        setLoading(true); setError("");
        const response = await fetch("/api/ai/images", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: attachedImage ? "edit" : "generate", prompt: content, ...(attachedImage ? { imageData: attachedImage.data, mimeType: attachedImage.type } : {}) }) });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || typeof data.image !== "string") throw new Error(data.error || "La génération d’image a échoué.");
        patchAssistant((m) => ({ ...m, content: "Voici le résultat de ta création.", generatedImage: data.image }));
        setImageMode(false); setAttachedImage(null);
      } else { await runAgent({ message: content }, contents); }
    } catch (err) { setError(err instanceof Error ? err.message : "Une erreur est survenue."); }
    finally { setLoading(false); sendLockRef.current = false; }
  }

  async function decide(decision: "approve" | "reject") {
    if (!pending || loading) return;
    setPending(null);
    await runAgent({ decision }, contents);
  }

  function onSubmit(e: FormEvent) { e.preventDefault(); void send(prompt); }
  function readImage(event: React.ChangeEvent<HTMLInputElement>) { const file = event.target.files?.[0]; event.target.value = ""; if (!file) return; if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 8 * 1024 * 1024) { setError("Image JPG, PNG ou WebP de 8 Mo maximum."); return; } const reader = new FileReader(); reader.onload = () => { if (typeof reader.result === "string") { setAttachedImage({ data: reader.result, type: file.type, name: file.name }); setImageMode(true); setShowAttachMenu(false); } }; reader.readAsDataURL(file); }
  async function readDocument(event: React.ChangeEvent<HTMLInputElement>) { const file = event.target.files?.[0]; event.target.value = ""; if (!file) return; if (file.size > 2 * 1024 * 1024 || !/\.(txt|md|json|csv|ts|tsx|js|jsx|py|html|css|xml|log)$/i.test(file.name)) { setError("Formats acceptés : TXT, MD, JSON, CSV et code, 2 Mo maximum."); return; } const text = await file.text(); setPrompt((old) => old + (old ? "\n\n" : "") + "Fichier joint : " + file.name + "\n\n" + text.slice(0, 30000)); setShowAttachMenu(false); inputRef.current?.focus(); }

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
  function newChat() { setMessages([]); setContents([]); setPending(null); setError(""); inputRef.current?.focus(); }
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
      <div className="row" style={{ padding: "8px 12px", borderBottom: "1px solid var(--border)", justifyContent: "space-between" }}><button type="button" className="btn btn-ghost btn-icon" aria-label="Ouvrir le menu" onClick={() => setShowNav((v) => !v)}><Menu /></button><strong>Bickri Code AI</strong><button type="button" className="btn btn-ghost btn-icon" aria-label="Nouvelle conversation" onClick={newChat}><SquarePen /></button></div>
      {showNav && <div className="plugin-popover" role="dialog" aria-label="Navigation Bickri" style={{ position: "fixed", zIndex: 100, top: 72, left: 12, width: "min(320px, calc(100vw - 24px))", maxHeight: "75vh", overflowY: "auto", boxShadow: "0 12px 36px #0002" }}><div className="row"><b className="grow">Bickri Codex System</b><button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => setShowNav(false)} aria-label="Fermer"><X /></button></div><button type="button" className="btn btn-ghost" style={{width:"100%",justifyContent:"flex-start"}} onClick={() => setShowNav(false)}><Sparkles size={18}/> Chat</button><button type="button" className="btn btn-ghost" style={{width:"100%",justifyContent:"flex-start"}} onClick={() => setShowNav(false)}><BookOpen size={18}/> Bibliothèque</button><button type="button" className="btn btn-ghost" style={{width:"100%",justifyContent:"flex-start"}} onClick={() => setShowNav(false)}><Folder size={18}/> Projets</button><button type="button" className="btn btn-ghost" style={{width:"100%",justifyContent:"flex-start"}} onClick={() => setShowNav(false)}><Clock3 size={18}/> Planifiées</button><button type="button" className="btn btn-ghost" style={{width:"100%",justifyContent:"flex-start"}} onClick={() => setShowNav(false)}><Compass size={18}/> Explorer</button><hr className="divider"/><b>Plugins</b>{pluginList}</div>}
      <div className="chat-main">
        <div className="chat-scroll">
          <div className="chat-inner">
            {config && !config.ai && (
              <div className="alert alert-warning"><CircleAlert /><span>L&apos;assistant n&apos;est pas encore configuré : ajoute <code className="mono">GEMINI_API_KEY</code> dans les variables d&apos;environnement Vercel, puis redéploie.</span></div>
            )}

            {messages.length === 0 ? (
              <>
                <div className="chat-hero">
                  <Badge tone="accent">Bickri Code AI</Badge>
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
                        <div className="msg-role">{m.role === "user" ? "Toi" : "Bickri Code AI"}</div>
                        {m.role === "user" ? <div className="msg-text">{m.content}</div> : (
                          <>
                            <ToolEvents events={m.events ?? []} />
                            {m.content && <Markdown>{m.content}</Markdown>}
{m.generatedImage && (
  <figure style={{ margin: "14px 0 0", maxWidth: 720 }}>
    <a href={m.generatedImage} target="_blank" rel="noreferrer noopener" aria-label="Ouvrir l’image générée en grand">
      <img src={m.generatedImage} alt="Illustration générée par Bickri Code AI pour accompagner cette réponse" loading="lazy" style={{ display: "block", width: "100%", height: "auto", maxHeight: 560, objectFit: "contain", borderRadius: 14, border: "1px solid var(--border, #dbe2ea)", background: "var(--surface, #fff)" }} />
    </a>
    <figcaption style={{ fontSize: 12, opacity: 0.7, marginTop: 6 }}>Illustration générée par Bickri Code AI</figcaption>
  </figure>
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
          <input ref={imageInputRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={readImage} />\n          <input ref={fileInputRef} type="file" accept=".txt,.md,.json,.csv,.ts,.tsx,.js,.jsx,.py,.html,.css,.xml,.log" hidden onChange={readDocument} />
          {showAttachMenu && <div className="plugin-popover" role="dialog" aria-label="Ajouter au message"><b>Ajouter au message</b><button type="button" className="btn btn-ghost" onClick={() => imageInputRef.current?.click()}><ImagePlus size={18} /> Importer une photo</button><button type="button" className="btn btn-ghost" onClick={() => fileInputRef.current?.click()}><FileText size={18} /> Importer un fichier ou du code</button><button type="button" className="btn btn-ghost" onClick={() => { setImageMode(true); setAttachedImage(null); setShowAttachMenu(false); }}><WandSparkles size={18} /> Créer une image avec l’IA</button></div>}
          {imageMode && <div className="row" style={{ padding: 8 }}><span className="grow">{attachedImage ? "Photo : " + attachedImage.name : "Mode création d’image activé"}</span><button type="button" className="btn btn-ghost btn-sm" onClick={() => { setImageMode(false); setAttachedImage(null); }}>Annuler</button></div>}
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

              <VoiceAssistant
                onSend={(text) => send(text)}
                assistantResponse={messages.slice().reverse().find((message) => message.role === "assistant")?.content ?? ""}
                busy={loading}
                blocked={Boolean(pending)}
              />
              <select className="select" style={{ width: "auto", height: 28, fontSize: "var(--text-xs)" }} value={language} onChange={(e) => setLanguage(e.target.value)} aria-label="Langage de travail">
                {LANGUAGES.map((l) => <option key={l}>{l}</option>)}
              </select>
              <button type="button" className={`btn btn-sm ${activePlugins.length ? "btn-plugins-on" : ""}`} onClick={() => setShowPlugins((v) => !v)} aria-expanded={showPlugins} style={{ height: 28 }}>
                <Plug /> Plugins{activePlugins.length ? ` · ${activePlugins.length}` : ""}
              </button>
              <small className="grow hide-sm"><span className="kbd">Entrée</span> envoyer · <span className="kbd">Maj + Entrée</span> nouvelle ligne</small>
              {messages.length > 0 && <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={newChat} aria-label="Nouvelle conversation" title="Nouvelle conversation"><SquarePen /></button>}
              <button className="btn btn-primary btn-icon btn-sm" type="submit" disabled={loading || !prompt.trim() || Boolean(pending)} aria-label="Envoyer"><ArrowUp /></button>
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

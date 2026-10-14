"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { ArrowUp, Bug, CircleAlert, CircleCheck, Code, GitBranch, Layers, RefreshCw, Sparkles, SquarePen, Unlink, User } from "lucide-react";
import { Markdown } from "@/components/ai/Markdown";
import { Badge } from "@/components/ui/Badge";
import { useConfig } from "@/hooks/useConfig";

type ChatMessage = { role: "user" | "assistant"; content: string };

const CHAT_KEY = "bcx_ai_chat_v1";
const LANGUAGES = ["TypeScript / Next.js", "JavaScript", "HTML / CSS", "Python", "Python / Django", "Dart / Flutter", "Kotlin / Android", "Java", "C / C++", "Rust", "PHP", "SQL / Supabase", "Autre langage"];
const STARTERS = [
  { icon: Layers, text: "Crée une application web responsive en Next.js avec authentification Supabase." },
  { icon: Bug, text: "Explique et corrige cette erreur TypeScript : " },
  { icon: Code, text: "Écris un script Python propre et commenté qui lit un fichier CSV." },
  { icon: Sparkles, text: "Propose une architecture claire pour un projet Flutter." },
];

export default function CodeAIPage() {
  const { config } = useConfig();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [prompt, setPrompt] = useState("");
  const [language, setLanguage] = useState(LANGUAGES[0]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [repo, setRepo] = useState("");
  const [repoContext, setRepoContext] = useState("");
  const [repoName, setRepoName] = useState("");
  const [repoLoading, setRepoLoading] = useState(false);
  const [repoError, setRepoError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(CHAT_KEY) || "null");
      if (saved?.messages) setMessages(saved.messages);
      if (saved?.language) setLanguage(saved.language);
    } catch { /* ignoré */ }
  }, []);
  useEffect(() => {
    try { sessionStorage.setItem(CHAT_KEY, JSON.stringify({ messages, language })); } catch { /* ignoré */ }
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, language, loading]);

  // Hauteur automatique du champ de saisie.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
  }, [prompt]);

  async function send(text: string) {
    const content = text.trim();
    if (!content || loading) return;
    const next = [...messages, { role: "user" as const, content }];
    setMessages(next);
    setPrompt("");
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/ai/code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next, language, projectContext: repoContext }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "La requête a échoué.");
      setMessages([...next, { role: "assistant", content: data.answer }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Une erreur est survenue.");
    } finally {
      setLoading(false);
    }
  }

  function onSubmit(e: FormEvent) { e.preventDefault(); void send(prompt); }
  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(prompt); }
  }
  function retry() {
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    if (!lastUser) return;
    setMessages((all) => all.slice(0, all.lastIndexOf(lastUser)));
    void send(lastUser.content);
  }
  function newChat() { setMessages([]); setError(""); inputRef.current?.focus(); }

  async function connectRepo(e: FormEvent) {
    e.preventDefault();
    if (!repo.trim() || repoLoading) return;
    setRepoLoading(true); setRepoError("");
    try {
      const res = await fetch("/api/ai/github", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ repository: repo.trim() }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error([data.error, data.hint].filter(Boolean).join(" ") || "Impossible de lire ce dépôt.");
      setRepoContext(data.context);
      setRepoName(data.repository.full_name);
    } catch (err) {
      setRepoContext(""); setRepoName("");
      setRepoError(err instanceof Error ? err.message : "Erreur de connexion GitHub.");
    } finally {
      setRepoLoading(false);
    }
  }

  return (
    <main className="chat">
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
                  <p>Décris une fonctionnalité, colle une erreur ou demande du code. Les réponses s&apos;adaptent au langage choisi{repoName ? ` et au dépôt ${repoName}` : ""}.</p>
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
                {messages.map((m, i) => (
                  <article key={i} className={`msg ${m.role}`}>
                    <div className="msg-avatar" aria-hidden="true">{m.role === "user" ? <User /> : <Sparkles />}</div>
                    <div style={{ minWidth: 0 }}>
                      <div className="msg-role">{m.role === "user" ? "Toi" : "Bickri Code AI"}</div>
                      {m.role === "user" ? <div className="msg-text">{m.content}</div> : <Markdown>{m.content}</Markdown>}
                    </div>
                  </article>
                ))}
                {loading && (
                  <article className="msg assistant">
                    <div className="msg-avatar" aria-hidden="true"><Sparkles /></div>
                    <div><div className="msg-role">Bickri Code AI</div><span className="typing" aria-label="Réponse en cours"><i /><i /><i /></span></div>
                  </article>
                )}
              </div>
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
          <form className="composer" onSubmit={onSubmit}>
            <label htmlFor="ai-input" className="sr-only">Message</label>
            <textarea id="ai-input" ref={inputRef} rows={1} value={prompt} maxLength={8000} onChange={(e) => setPrompt(e.target.value)} onKeyDown={onKeyDown} placeholder="Décris ton application, colle une erreur ou demande du code…" />
            <div className="composer-bar">
              <select className="select" style={{ width: "auto", height: 28, fontSize: "var(--text-xs)" }} value={language} onChange={(e) => setLanguage(e.target.value)} aria-label="Langage de travail">
                {LANGUAGES.map((l) => <option key={l}>{l}</option>)}
              </select>
              {repoName && <Badge tone="success">{repoName}</Badge>}
              <small className="grow hide-sm"><span className="kbd">Entrée</span> envoyer · <span className="kbd">Maj + Entrée</span> nouvelle ligne</small>
              {messages.length > 0 && <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={newChat} aria-label="Nouvelle conversation" title="Nouvelle conversation"><SquarePen /></button>}
              <button className="btn btn-primary btn-icon btn-sm" type="submit" disabled={loading || !prompt.trim()} aria-label="Envoyer"><ArrowUp /></button>
            </div>
          </form>
          <p className="composer-note">Les réponses sont générées par IA : vérifie le code avant une mise en production. Ne partage jamais de clé secrète ni de mot de passe.</p>
        </div>
      </div>

      <aside className="chat-side" aria-label="Contexte">
        <div>
          <h3>Conversation</h3>
          <p>{messages.length ? `${messages.length} message(s) dans cette session.` : "Aucun message pour l'instant."}</p>
          <button className="btn btn-sm" style={{ marginTop: 10 }} onClick={newChat} disabled={!messages.length}><SquarePen /> Nouvelle conversation</button>
        </div>
        <hr className="divider" />
        <form onSubmit={connectRepo} className="stack" style={{ gap: 10 }}>
          <div>
            <h3 className="row"><GitBranch size={14} /> Dépôt GitHub</h3>
            <p>Donne à l&apos;IA le contexte d&apos;un dépôt (lecture seule, via le serveur GitHub MCP).</p>
          </div>
          {config && !config.githubMcp && <div className="alert alert-warning" style={{ fontSize: "var(--text-xs)" }}><CircleAlert /><span>GITHUB_MCP_URL n&apos;est pas configurée.</span></div>}
          {repoName ? (
            <div className="alert alert-success" style={{ fontSize: "var(--text-xs)" }}>
              <CircleCheck />
              <div className="grow"><b>{repoName}</b><p className="muted">README, package.json et fichiers d&apos;entrée chargés.</p></div>
              <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => { setRepoContext(""); setRepoName(""); }} aria-label="Déconnecter le dépôt"><Unlink /></button>
            </div>
          ) : (
            <>
              <input className="input" value={repo} onChange={(e) => setRepo(e.target.value)} placeholder="proprietaire/depot" aria-label="Dépôt GitHub" />
              <button className="btn btn-sm" type="submit" disabled={repoLoading || !repo.trim()}>{repoLoading ? <RefreshCw className="spin" /> : <GitBranch />} {repoLoading ? "Connexion…" : "Connecter"}</button>
            </>
          )}
          {repoError && <p className="field-error">{repoError}</p>}
        </form>
        <hr className="divider" />
        <div>
          <h3>Modèle</h3>
          <p>{config ? `${config.aiModel} (repli : ${config.aiFallbackModel})` : "Chargement…"}</p>
        </div>
      </aside>
    </main>
  );
}

"use client";

import { FormEvent, useState } from "react";

type ChatMessage = { role: "user" | "assistant"; content: string };
const starters = [
  "Crée une application web responsive en Next.js.",
  "Explique et corrige cette erreur TypeScript.",
  "Écris un script Python propre et commenté.",
  "Prépare un projet Flutter avec une architecture claire.",
];

export default function CodeAIPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [prompt, setPrompt] = useState("");
  const [language, setLanguage] = useState("TypeScript / Next.js");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [githubRepo, setGithubRepo] = useState("");
  const [githubContext, setGithubContext] = useState("");
  const [githubStatus, setGithubStatus] = useState("");
  const [githubLoading, setGithubLoading] = useState(false);

  async function connectGithub(event: FormEvent) {
    event.preventDefault();
    if (!githubRepo.trim() || githubLoading) return;
    setGithubLoading(true);
    setGithubStatus("");
    setError("");
    try {
      const response = await fetch("/api/ai/github", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repository: githubRepo.trim() }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Impossible de lire ce dépôt GitHub.");
      setGithubContext(data.context);
      setGithubStatus(`Dépôt connecté en lecture seule : ${data.repository.full_name}`);
    } catch (err) {
      setGithubContext("");
      setGithubStatus("");
      setError(err instanceof Error ? err.message : "Erreur de connexion GitHub.");
    } finally {
      setGithubLoading(false);
    }
  }

  async function send(event?: FormEvent, suggestion?: string) {
    event?.preventDefault();
    const text = (suggestion ?? prompt).trim();
    if (!text || loading) return;
    const next = [...messages, { role: "user" as const, content: text }];
    setMessages(next);
    setPrompt("");
    setError("");
    setLoading(true);
    try {
      const response = await fetch("/api/ai/code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next, language, projectContext: githubContext }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "La requête a échoué.");
      setMessages([...next, { role: "assistant", content: data.answer }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Une erreur est survenue.");
    } finally {
      setLoading(false);
    }
  }

  return <main className="ai-shell">
    <header className="ai-header">
      <a href="/" className="ai-brand"><span>Θ</span><b>BICKRI <em>CODEX</em></b></a>
      <nav><a href="/cloud">☁ Cloud</a><a href="/studio">⌘ Studio</a><a href="/">Tableau de bord</a></nav>
    </header>
    <section className="ai-main">
      <div className="ai-kicker">BCX · INTELLIGENCE DE PROGRAMMATION</div>
      <h1>Construisons avec <span>Bickri Code AI.</span></h1>
      <p className="ai-intro">Ton assistant de codage pour comprendre, écrire, corriger et améliorer tes projets dans plusieurs langages.</p>
      <form className="github-connect" onSubmit={connectGithub}>
        <div><strong>⌘ Connecter un dépôt GitHub</strong><p>Connexion au serveur GitHub MCP côté serveur. Le serveur MCP doit être configuré dans Vercel.</p></div>
        <div className="github-row"><input aria-label="Dépôt GitHub public" value={githubRepo} onChange={(e) => setGithubRepo(e.target.value)} placeholder="https://github.com/proprietaire/depot ou proprietaire/depot" /><button disabled={githubLoading || !githubRepo.trim()}>{githubLoading ? "Connexion…" : "Connecter"}</button></div>
        {githubStatus && <p className="github-status" role="status">✓ {githubStatus}</p>}
      </form>
      <label className="ai-language">LANGAGE DE TRAVAIL
        <select value={language} onChange={(e) => setLanguage(e.target.value)}>
          {["TypeScript / Next.js", "JavaScript", "HTML / CSS", "Python", "Dart / Flutter", "Kotlin / Android", "Java", "C / C++", "Rust", "PHP", "SQL / Supabase", "Autre langage"].map((item) => <option key={item}>{item}</option>)}
        </select>
      </label>

      {messages.length === 0 ? <div className="ai-starters">
        <h2>Que veux-tu coder aujourd’hui ?</h2>
        <div className="ai-starter-grid">{starters.map((item) => <button key={item} onClick={() => send(undefined, item)}>{item}<span>↗</span></button>)}</div>
      </div> : <div className="ai-chat" aria-live="polite">
        {messages.map((message, index) => <article className={message.role === "user" ? "ai-message user" : "ai-message assistant"} key={index}>
          <div className="ai-message-role">{message.role === "user" ? "VOUS" : "BICKRI CODE AI"}</div>
          <pre>{message.content}</pre>
        </article>)}
        {loading && <div className="ai-thinking"><span className="ai-pulse" /> Bickri Code AI prépare une réponse…</div>}
        <div id="ai-bottom" />
      </div>}

      {error && <div className="ai-error" role="alert">{error}</div>}
      <form className="ai-composer" onSubmit={(e) => send(e)}>
        <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Décris ton application, colle une erreur ou demande du code…" rows={3} maxLength={8000} />
        <div className="ai-composer-bottom"><span>Ne partage aucune clé secrète ni mot de passe.</span><button disabled={loading || !prompt.trim()}>{loading ? "Réflexion…" : "Envoyer ↑"}</button></div>
      </form>
      <p className="ai-footnote">Les réponses sont générées par IA et doivent être vérifiées avant une mise en production. L’exécution du code dans un conteneur cloud n’est pas encore activée.</p>
    </section>
    <style jsx>{`
      .ai-shell{min-height:100vh;background:#080d17;color:#edf4ff}.ai-header{height:76px;border-bottom:1px solid #213047;display:flex;align-items:center;justify-content:space-between;padding:0 clamp(18px,5vw,70px)}.ai-brand{display:flex;align-items:center;gap:10px;letter-spacing:.08em}.ai-brand>span{font-size:28px;color:#67e8f9;border:1px solid #29495b;border-radius:10px;padding:4px 9px}.ai-brand em{font-style:normal;color:#67e8f9}.ai-header nav{display:flex;gap:20px;color:#a7b8ca;font-size:12px}.ai-header nav a:hover{color:#67e8f9}.ai-main{max-width:900px;margin:0 auto;padding:58px 22px 38px}.ai-kicker{font-size:10px;letter-spacing:.2em;color:#eacb7b;font-weight:800}.ai-main h1{font-size:clamp(30px,5vw,48px);letter-spacing:-.045em;margin:18px 0 10px;line-height:1.12}.ai-main h1 span{color:#67e8f9}.ai-intro{color:#99abc0;line-height:1.7;max-width:660px}.ai-language{display:flex;align-items:center;gap:14px;margin:28px 0;color:#8296ad;font-size:10px;letter-spacing:.12em;font-weight:800}.ai-language select{background:#111d2d;border:1px solid #294057;color:#edf4ff;border-radius:9px;padding:10px;max-width:100%;letter-spacing:0;font-size:12px}.ai-starters{margin:44px 0 30px}.ai-starters h2{font-size:17px;margin-bottom:14px}.ai-starter-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.ai-starter-grid button{text-align:left;display:flex;justify-content:space-between;gap:12px;align-items:center;background:#0d1523;color:#cbd8e7;border:1px solid #213047;border-radius:12px;padding:17px;line-height:1.5}.ai-starter-grid button:hover{border-color:#67e8f9;color:#fff}.ai-starter-grid span{color:#67e8f9}.ai-chat{margin:30px 0;display:grid;gap:15px}.ai-message{padding:17px;border:1px solid #213047;border-radius:13px;background:#0d1523;min-width:0}.ai-message.user{background:#101e2c;border-color:#294255}.ai-message-role{font-size:9px;letter-spacing:.16em;font-weight:800;color:#67e8f9;margin-bottom:12px}.ai-message pre{white-space:pre-wrap;overflow-wrap:anywhere;font:13px/1.75 ui-monospace,SFMono-Regular,Consolas,monospace;color:#d7e3f1;margin:0}.ai-thinking{color:#a9bacd;padding:10px;font-size:12px}.ai-pulse{display:inline-block;width:8px;height:8px;border-radius:50%;background:#67e8f9;margin-right:8px;animation:pulse 1s infinite alternate}.ai-composer{border:1px solid #2a4058;background:#0d1523;border-radius:15px;padding:12px}.ai-composer textarea{width:100%;resize:vertical;min-height:90px;background:transparent;color:#edf4ff;border:0;outline:none;padding:9px;font:13px/1.6 system-ui,sans-serif}.ai-composer-bottom{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:6px}.ai-composer-bottom span{font-size:10px;color:#8193a8}.ai-composer-bottom button{background:#67e8f9;color:#06131e;border:0;border-radius:8px;padding:10px 15px;font-weight:800;font-size:12px}.ai-composer-bottom button:disabled{opacity:.45;cursor:not-allowed}.ai-error{margin:12px 0;padding:12px;border:1px solid #7f343b;border-radius:9px;background:#30151b;color:#ffc7cc;font-size:12px}.ai-footnote{font-size:10px;line-height:1.6;color:#74869c;margin-top:15px}@keyframes pulse{to{opacity:.3}}@media(max-width:600px){.ai-header{height:auto;min-height:68px;align-items:flex-start;padding-top:15px;padding-bottom:15px;gap:15px}.ai-header nav{gap:10px;flex-wrap:wrap;justify-content:flex-end}.ai-header nav a{font-size:10px}.ai-main{padding-top:38px}.ai-starter-grid{grid-template-columns:1fr}.github-row{flex-direction:column}.github-row button{width:100%}.ai-language{align-items:flex-start;flex-direction:column}.ai-language select{width:100%}.ai-composer-bottom span{max-width:60%}}
    `}</style>
  </main>;
}

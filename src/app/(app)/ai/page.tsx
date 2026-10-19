"use client";

import { useRef, useState, type FormEvent } from "react";
import { ArrowUp, ChevronDown, Download, ImagePlus, Link2, Menu, Paperclip, Plus, Search, Sparkles, WandSparkles, X } from "lucide-react";
import { Markdown } from "@/components/ai/Markdown";

type Message = { role: "user" | "assistant"; content: string; image?: string };

const starters = [
  { icon: Sparkles, title: "Synthesize Data", text: "Summarize my meeting notes into 5 key bullet points for the team" },
  { icon: WandSparkles, title: "Creative Brainstorm", text: "Generate 3 concepts for a sustainable fashion brand" },
  { icon: Search, title: "Check Facts", text: "Compare the differences between GDPR and CCPA" },
];

export default function CodeAIPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [imageMode, setImageMode] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    const text = prompt.trim();
    if (!text || loading) return;
    setPrompt(""); setError("");
    setMessages((current) => [...current, { role: "user", content: text }, { role: "assistant", content: "" }]);
    setLoading(true);
    try {
      const endpoint = imageMode ? "/api/ai/images" : "/api/ai/agent";
      const body = imageMode ? { prompt: text, mode: "generate" } : { prompt: text, contents: [], plugins: [] };
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "La requête a échoué.");
      if (imageMode) {
        setMessages((current) => { const next = [...current]; next[next.length - 1] = { role: "assistant", content: "Image générée avec Gemini.", image: data.image }; return next; });
      } else {
        const answer = data.answer || "Je suis prêt à vous aider. Décrivez votre demande plus précisément.";
        setMessages((current) => { const next = [...current]; next[next.length - 1] = { role: "assistant", content: answer }; return next; });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Une erreur est survenue.";
      setError(message);
      setMessages((current) => current.slice(0, -2));
    } finally { setLoading(false); }
  }

  return (
    <div className="cortex-app">
      <button className="cortex-mobile-menu" onClick={() => setMobileOpen(true)} aria-label="Ouvrir le menu"><Menu /></button>
      {mobileOpen && <button className="cortex-backdrop" onClick={() => setMobileOpen(false)} aria-label="Fermer le menu" />}
      <aside className={`cortex-sidebar ${mobileOpen ? "is-open" : ""}`}>
        <div className="cortex-brand"><span className="cortex-brand-mark"><Sparkles /></span><strong>Cortex</strong><button className="cortex-collapse" aria-label="Réduire le menu"><X /></button></div>
        <button className="cortex-new" onClick={() => { setMessages([]); setMobileOpen(false); }}><Plus /> New chat</button>
        <label className="cortex-search"><Search /><input placeholder="Search" aria-label="Rechercher" /></label>
        <nav className="cortex-nav" aria-label="Navigation Cortex">
          {["Explore", "Library", "Files", "History"].map((item, index) => <button key={item} className={index === 0 ? "active" : ""}><span className="cortex-nav-dot" />{item}<span>{index === 0 ? "✦" : ""}</span></button>)}
        </nav>
        <div className="cortex-history"><p>Today</p>{["Create a detailed 7-day sprint plan...", "Draft a concise email to stakeholders...", "Analyze the 'Etherium Matrix' an..."].map((item) => <button key={item}>{item}</button>)}<p>Yesterday</p>{["Summarize the main differences be...", "I need to negotiate an extension for...", "Generate 5 effective morning habits..."].map((item) => <button key={item}>{item}</button>)}</div>
        <div className="cortex-account"><span className="cortex-avatar">ES</span><span><b>Emerson Sterling</b><small>esterling@gmail.com</small></span><span className="cortex-logout">↪</span></div>
      </aside>
      <main className="cortex-main">
        <header className="cortex-header"><div className="cortex-model"><Sparkles /> Cortex <ChevronDown /></div><div className="cortex-actions"><button aria-label="Plus d'options">···</button><button aria-label="Copier le lien"><Link2 /></button><button className="cortex-export"><Download /> Export chat</button><button className="cortex-upgrade">Upgrade</button></div></header>
        <section className={`cortex-content ${messages.length ? "has-messages" : ""}`}>
          {!messages.length ? <div className="cortex-welcome"><div className="cortex-orb" /><p className="cortex-hello">Hello, Jackson</p><h1>How can I assist you today?</h1></div> : <div className="cortex-messages">{messages.map((message, index) => <article className={`cortex-message ${message.role}`} key={`${message.role}-${index}`}><div className="cortex-message-avatar">{message.role === "assistant" ? <Sparkles /> : "J"}</div><div><div className="cortex-message-role">{message.role === "assistant" ? "Cortex" : "You"}</div>{message.content && (message.role === "assistant" ? <Markdown>{message.content}</Markdown> : <p>{message.content}</p>)}{loading && index === messages.length - 1 && <span className="cortex-typing">Cortex réfléchit…</span>}{message.image && <img className="cortex-generated-image" src={message.image} alt="Image générée par Cortex" />} </div></article>)}</div>}
          <form className="cortex-composer" onSubmit={submit}><textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229) { event.preventDefault(); void submit(); } }} placeholder={imageMode ? "Describe the image you want to create..." : "Ask me anything..."} rows={2} aria-label="Votre message" /><div className="cortex-composer-tools"><div><button type="button" className="cortex-tool" onClick={() => fileRef.current?.click()} aria-label="Joindre un fichier"><Paperclip /> Attach file</button><button type="button" className={`cortex-tool ${imageMode ? "selected" : ""}`} onClick={() => setImageMode((value) => !value)}><ImagePlus /> {imageMode ? "Image mode" : "Generate image"}</button><input ref={fileRef} type="file" hidden accept="image/png,image/jpeg,image/webp" /></div><button className="cortex-send" type="submit" disabled={!prompt.trim() || loading} aria-label="Envoyer"><ArrowUp /></button></div></form>
          {error && <p className="cortex-error" role="alert">{error}</p>}
          {!messages.length && <><p className="cortex-saved"><Sparkles /> Saved prompts</p><div className="cortex-starters">{starters.map(({ icon: Icon, title, text }) => <button key={title} onClick={() => setPrompt(text)}><Icon /><b>{title}</b><span>{text}</span></button>)}</div></>}
          <p className="cortex-footer">Join the various community for more insights. <u>Join Discord</u></p>
        </section>
      </main>
    </div>
  );
}

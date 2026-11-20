"use client";

import { Suspense, useState, type FormEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, CircleAlert, Code2, Info, MessageSquare, RefreshCw, ShieldCheck } from "lucide-react";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";

type OAuthProvider = "google" | "github" | "facebook";

const PROVIDERS: { id: OAuthProvider; label: string }[] = [
  { id: "google", label: "Google" },
  { id: "github", label: "GitHub" },
  { id: "facebook", label: "Facebook" },
];

function ProviderMark({ provider }: { provider: OAuthProvider }) {
  if (provider === "google") {
    return (
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z"/>
        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.14-3.08-.4-4.55H24v9.02h12.94a11.05 11.05 0 0 1-4.8 7.24l7.73 6c4.5-4.16 7.11-10.3 7.11-17.71Z"/>
        <path fill="#FBBC05" d="M10.53 28.59a14.4 14.4 0 0 1 0-9.18l-7.98-6.2a23.92 23.92 0 0 0 0 21.58l7.98-6.2Z"/>
        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.9-5.8l-7.73-6c-2.14 1.44-4.89 2.3-8.17 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.2C6.51 42.62 14.62 48 24 48Z"/>
      </svg>
    );
  }

  if (provider === "facebook") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path fill="#0866FF" d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073c0 6.02 4.388 11.02 10.125 11.927v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.695 4.533-4.695 1.313 0 2.686.236 2.686.236v2.97h-1.514c-1.49 0-1.955.93-1.955 1.886v2.266h3.328l-.532 3.49h-2.796V24C19.612 23.093 24 18.093 24 12.073Z"/>
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M12 .297a12 12 0 0 0-3.797 23.382c.6.112.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61-.546-1.386-1.332-1.755-1.332-1.755-1.09-.745.083-.729.083-.729 1.205.085 1.84 1.24 1.84 1.24 1.07 1.835 2.809 1.305 3.495.998.108-.776.42-1.305.763-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.468-2.38 1.235-3.22-.123-.303-.536-1.523.117-3.176 0 0 1.008-.322 3.3 1.23a11.5 11.5 0 0 1 6 0c2.29-1.552 3.297-1.23 3.297-1.23.655 1.653.243 2.873.12 3.176.77.84 1.233 1.91 1.233 3.22 0 4.61-2.805 5.625-5.476 5.92.43.372.814 1.102.814 2.22 0 1.604-.015 2.896-.015 3.29 0 .322.216.694.825.576A12.005 12.005 0 0 0 12 .297"/>
    </svg>
  );
}

function LoginForm() {
  const params = useSearchParams();
  const [mode, setMode] = useState<"login" | "signup">(params.get("mode") === "signup" ? "signup" : "login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "info" | "danger"; text: string } | null>(
    params.get("error") === "auth_callback" ? { tone: "danger", text: "Le lien de connexion est invalide ou a expiré. Réessaie." } : null,
  );
  const configured = isSupabaseConfigured();
  const next = params.get("next");
  const safeNext = next?.startsWith("/") && !next.startsWith("//") ? next : "/";

  function callbackUrl() {
    const callback = new URL("/auth/callback", window.location.origin);
    callback.searchParams.set("next", safeNext);
    return callback.toString();
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (mode === "signup" && password !== confirmPassword) {
      setMessage({ tone: "danger", text: "Les mots de passe ne correspondent pas." });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const supabase = createClient();
      const result = mode === "login"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password, options: { emailRedirectTo: callbackUrl() } });
      if (result.error) throw result.error;
      if (mode === "signup" && !result.data.session) {
        setMessage({ tone: "info", text: "Compte créé. Vérifie ta boîte mail pour confirmer ton adresse, puis connecte-toi." });
      } else {
        window.location.assign(safeNext);
      }
    } catch (err) {
      const raw = err instanceof Error ? err.message : "";
      const text = /invalid login credentials/i.test(raw) ? "E-mail ou mot de passe incorrect."
        : /email not confirmed/i.test(raw) ? "Confirme d'abord ton adresse e-mail grâce au lien reçu."
        : /already registered/i.test(raw) ? "Un compte existe déjà avec cette adresse. Connecte-toi."
        : raw || "Connexion impossible. Vérifie la configuration Supabase.";
      setMessage({ tone: "danger", text });
    } finally {
      setBusy(false);
    }
  }

  async function signInWithProvider(provider: OAuthProvider, label: string) {
    setBusy(true);
    setMessage(null);
    try {
      const { error } = await createClient().auth.signInWithOAuth({
        provider,
        options: { redirectTo: callbackUrl() },
      });
      if (error) throw error;
    } catch (err) {
      const raw = err instanceof Error ? err.message : "";
      const text = /provider.*(?:not enabled|unsupported|disabled)|unsupported provider/i.test(raw)
        ? `La connexion ${label} n'est pas encore activée dans Supabase.`
        : raw || `Impossible de démarrer la connexion ${label}.`;
      setMessage({ tone: "danger", text });
      setBusy(false);
    }
  }

  return (
    <div className="auth-card auth-card-modern">
      <Link href="/" className="auth-wordmark" aria-label="Bickri Codex System">BICKRI <span>CODEX</span></Link>
      <div className="auth-intro">
        <span className="auth-eyebrow">VOTRE ESPACE BCX</span>
        <h1>{mode === "login" ? "Ravi de te revoir." : "Crée ton compte."}</h1>
        <p>{mode === "login" ? "Connecte-toi pour retrouver tes projets et conversations." : "Un seul compte pour garder tes projets et conversations synchronisés."}</p>
      </div>

      <div className="auth-provider-list" aria-label="Se connecter avec un fournisseur">
        {PROVIDERS.map(({ id, label }) => (
          <button key={id} type="button" className={`auth-provider auth-provider-${id}`} onClick={() => void signInWithProvider(id, label)} disabled={busy || !configured}>
            <ProviderMark provider={id}/>
            <span>Continuer avec {label}</span>
            {busy && <RefreshCw className="spin auth-provider-spinner" size={15}/>}
          </button>
        ))}
      </div>

      <div className="auth-divider"><span>OU AVEC TON E-MAIL</span></div>

      {!configured && <div className="alert alert-warning auth-config-note" role="status"><CircleAlert /><span>La connexion est prête, mais Supabase doit être configuré pour créer un compte ou utiliser les fournisseurs sociaux.</span></div>}

      <form onSubmit={submit} className="form-grid auth-email-form">
        <label className="field">
          <span className="field-label">Adresse e-mail</span>
          <input className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="toi@exemple.com" />
        </label>
        <label className="field">
          <span className="field-label">Mot de passe</span>
          <input className="input" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="8 caractères minimum" />
        </label>
        {mode === "signup" && (
          <label className="field">
            <span className="field-label">Confirmer le mot de passe</span>
            <input className="input" type="password" autoComplete="new-password" minLength={8} required value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Répète ton mot de passe" />
          </label>
        )}
        <button className="btn btn-primary btn-lg btn-block auth-submit" type="submit" disabled={busy || !configured}>
          {busy && <RefreshCw className="spin" />}{busy ? "Patiente…" : mode === "login" ? "Se connecter par e-mail" : "Créer mon compte"}
        </button>
      </form>

      {message && (
        <div className={`alert alert-${message.tone}`} role="status">{message.tone === "danger" ? <CircleAlert /> : <Info />}<span>{message.text}</span></div>
      )}

      <p className="auth-switch">
        {mode === "login" ? "Pas encore de compte ? " : "Tu as déjà un compte ? "}
        <button type="button" onClick={() => { setMode(mode === "login" ? "signup" : "login"); setPassword(""); setConfirmPassword(""); setMessage(null); }}>{mode === "login" ? "Créer un compte" : "Se connecter"}</button>
      </p>
      <Link href="/" className="auth-back-link"><ArrowLeft size={15}/> Retour au chat</Link>
    </div>
  );
}

export default function LoginPage() {
  return (
    <main className="auth auth-modern">
      <section className="auth-panel auth-modern-panel"><Suspense><LoginForm /></Suspense></section>
      <aside className="auth-aside auth-modern-aside">
        <div className="auth-modern-glow" aria-hidden="true"/>
        <div className="auth-modern-content">
          <span className="auth-eyebrow">BICKRI CODEX SYSTEM</span>
          <h2>De l’idée au code, dans un seul espace.</h2>
          <p>Discute, construis et développe tes projets avec tes outils et ton historique toujours à portée de main.</p>
          <div className="auth-feature-preview" aria-hidden="true">
            <div className="auth-feature-top"><span><i/> Chats</span><span><i/> Codex</span><span><i/> Projets</span></div>
            <div className="auth-feature-code"><Code2 size={16}/><span>Ton prochain projet commence ici.</span><span className="auth-feature-caret"/></div>
            <div className="auth-feature-chat"><MessageSquare size={15}/><span>Prêt à construire quelque chose de remarquable ?</span></div>
          </div>
        </div>
        <footer className="auth-modern-footer"><ShieldCheck size={14}/> Tes sessions sont protégées par Supabase Auth.</footer>
      </aside>
    </main>
  );
}

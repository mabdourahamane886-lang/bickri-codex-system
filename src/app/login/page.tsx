"use client";

import { Suspense, useState, type FormEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, CircleAlert, Info, RefreshCw } from "lucide-react";
import { Logo, LogoMark } from "@/components/brand/Logo";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";

function LoginForm() {
  const params = useSearchParams();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "info" | "danger"; text: string } | null>(
    params.get("error") === "auth_callback" ? { tone: "danger", text: "Le lien de confirmation est invalide ou a expiré. Reconnecte-toi." } : null,
  );
  const configured = isSupabaseConfigured();

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setMessage(null);
    try {
      const supabase = createClient();
      const result = mode === "login"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password, options: { emailRedirectTo: `${window.location.origin}/auth/callback` } });
      if (result.error) throw result.error;
      if (mode === "signup" && !result.data.session) {
        setMessage({ tone: "info", text: "Compte créé. Vérifie ta boîte mail pour confirmer ton adresse, puis connecte-toi." });
      } else {
        const next = params.get("next");
        window.location.assign(next?.startsWith("/") && !next.startsWith("//") ? next : "/");
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

  return (
    <div className="auth-card">
      <Link href="/"><Logo /></Link>
      <div>
        <h1>{mode === "login" ? "Connexion" : "Créer un compte"}</h1>
        <p>{mode === "login" ? "Accède à ton registre de projets BICKRI CODEX SYSTEM." : "Un compte te permet d'enregistrer tes identifiants dans le registre partagé."}</p>
      </div>

      {!configured && <div className="alert alert-warning"><CircleAlert /><span>Supabase n&apos;est pas configuré sur ce déploiement. L&apos;application reste utilisable en mode local.</span></div>}

      <form onSubmit={submit} className="form-grid">
        <label className="field">
          <span className="field-label">Adresse e-mail</span>
          <input className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="toi@exemple.com" />
        </label>
        <label className="field">
          <span className="field-label">Mot de passe</span>
          <input className="input" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="8 caractères minimum" />
        </label>
        <button className="btn btn-primary btn-lg btn-block" type="submit" disabled={busy || !configured}>
          {busy && <RefreshCw className="spin" />}{busy ? "Patiente…" : mode === "login" ? "Se connecter" : "Créer mon compte"}
        </button>
      </form>

      {message && (
        <div className={`alert alert-${message.tone}`} role="status">{message.tone === "danger" ? <CircleAlert /> : <Info />}<span>{message.text}</span></div>
      )}

      <p className="auth-switch">
        {mode === "login" ? "Pas encore de compte ? " : "Tu as déjà un compte ? "}
        <button type="button" onClick={() => { setMode(mode === "login" ? "signup" : "login"); setMessage(null); }}>{mode === "login" ? "Créer un compte" : "Se connecter"}</button>
      </p>
      <Link href="/" className="btn btn-ghost btn-sm" style={{ justifySelf: "center" }}><ArrowLeft /> Retour au tableau de bord</Link>
    </div>
  );
}

export default function LoginPage() {
  return (
    <main className="auth">
      <section className="auth-panel"><Suspense><LoginForm /></Suspense></section>
      <aside className="auth-aside" aria-hidden="true">
        <div className="auth-aside-grid" />
        <LogoMark className="auth-aside-mark" />
        <blockquote>
          <p>Un identifiant unique pour chaque produit, un espace pour le construire, un assistant pour l&apos;améliorer.</p>
          <footer>BICKRI CODEX SYSTEM · Code. Build. Evolve.</footer>
        </blockquote>
      </aside>
    </main>
  );
}

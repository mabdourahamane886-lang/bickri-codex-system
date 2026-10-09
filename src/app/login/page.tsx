"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setMessage("");
    try {
      const supabase = createClient();
      const result = mode === "login"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password, options: { emailRedirectTo: `${window.location.origin}/auth/callback` } });
      if (result.error) throw result.error;
      if (mode === "signup" && !result.data.session) {
        setMessage("Compte créé. Vérifie ta boîte mail pour confirmer ton adresse, puis connecte-toi.");
      } else {
        window.location.assign("/");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Connexion impossible. Vérifie la configuration Supabase.");
    } finally { setBusy(false); }
  }
  return <main className="auth-shell">
    <section className="auth-card">
      <Link className="auth-brand" href="/"><span>Θ</span><b>BICKRI <em>CODEX</em></b></Link>
      <p className="section-kicker">ESPACE BCX SÉCURISÉ</p>
      <h1>{mode === "login" ? "Bon retour." : "Créer un compte."}</h1>
      <p className="auth-subtitle">Accède à ton registre de projets BICKRI CODEX SYSTEM.</p>
      <form onSubmit={submit} className="auth-form">
        <label>Adresse e-mail<input type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="toi@exemple.com"/></label>
        <label>Mot de passe<input type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={8} required value={password} onChange={e=>setPassword(e.target.value)} placeholder="8 caractères minimum"/></label>
        <button className="primary-button full-button" type="submit" disabled={busy}>{busy ? "Patiente…" : mode === "login" ? "Se connecter →" : "Créer mon compte →"}</button>
      </form>
      {message && <p className="auth-message" role="status">{message}</p>}
      <p className="auth-switch">{mode === "login" ? "Pas encore de compte ?" : "Tu as déjà un compte ?"} <button type="button" onClick={()=>{setMode(mode === "login" ? "signup" : "login");setMessage("");}}>{mode === "login" ? "Créer un compte" : "Se connecter"}</button></p>
      <p className="auth-note">La création d’un compte nécessite la configuration des clés publiques Supabase dans l’environnement de déploiement. Ne partage jamais une clé service_role.</p>
    </section>
  </main>;
}

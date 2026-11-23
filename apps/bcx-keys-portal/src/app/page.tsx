"use client";
import { useEffect, useMemo, useState } from "react";
import { createClient, type Session } from "@supabase/supabase-js";

type Key = { id: string; name: string; key_prefix: string; scopes: string[]; expires_at: string | null; revoked_at: string | null };
export default function Portal() {
  const client = useMemo(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    return url && key ? createClient(url, key) : null;
  }, []);
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("BCX Production");
  const [days, setDays] = useState(90);
  const [keys, setKeys] = useState<Key[]>([]);
  const [fresh, setFresh] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!client) return;
    void client.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, value) => setSession(value));
    return () => subscription.unsubscribe();
  }, [client]);
  async function request(method: "GET" | "POST" | "DELETE", body?: unknown, id?: string) {
    if (!client) throw new Error("Configuration Supabase absente.");
    const { data: { session: current } } = await client.auth.getSession();
    if (!current) throw new Error("Connecte-toi.");
    const response = await fetch("/api/keys" + (id ? "?id=" + encodeURIComponent(id) : ""), {
      method, headers: { Authorization: "Bearer " + current.access_token, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined, cache: "no-store",
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Requête impossible.");
    return data;
  }
  async function reload() {
    try { const data = await request("GET"); setKeys(data.keys ?? []); setError(""); }
    catch (e) { setError(e instanceof Error ? e.message : "Erreur."); }
  }
  useEffect(() => { if (session) void reload(); else { setKeys([]); setFresh(""); } }, [session?.user.id]);
  async function login(e: React.FormEvent) {
    e.preventDefault(); if (!client) return;
    setBusy(true); setError("");
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) setError("Connexion impossible. Vérifie les identifiants.");
    setBusy(false);
  }
  async function create(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError(""); setFresh("");
    try { const data = await request("POST", { name, expiresInDays: days }); setFresh(data.key); await reload(); }
    catch (e) { setError(e instanceof Error ? e.message : "Erreur."); }
    finally { setBusy(false); }
  }
  async function revoke(id: string) {
    if (!confirm("Révoquer définitivement cette clé ?")) return;
    setBusy(true);
    try { await request("DELETE", undefined, id); await reload(); } catch (e) { setError(e instanceof Error ? e.message : "Erreur."); }
    finally { setBusy(false); }
  }
  const card: React.CSSProperties = { background: "#151f33", padding: 24, borderRadius: 16, marginTop: 20, border: "1px solid #2c3d5d" };
  const input: React.CSSProperties = { display: "block", width: "100%", padding: 12, marginTop: 7, boxSizing: "border-box", borderRadius: 9, border: "1px solid #5a7295", background: "#0b1220", color: "white" };
  const button: React.CSSProperties = { background: "#3b82f6", color: "white", border: 0, borderRadius: 9, padding: "12px 18px", cursor: "pointer" };
  return <main style={{ maxWidth: 820, margin: "0 auto", padding: "36px 18px 90px" }}>
    <header><p style={{ color: "#93c5fd", fontWeight: 700 }}>BICKRI CODEX SYSTEM</p><h1 style={{ fontSize: 36, marginBottom: 8 }}>BCX Developer Portal</h1>
      <p>Un portail indépendant pour créer et révoquer les clés de l’écosystème BCX.</p></header>
    {!client && <p role="alert">Variables Supabase du portail non configurées.</p>}
    {error && <p role="alert" style={{ color: "#fca5a5" }}>{error}</p>}
    {!session ? <form style={card} onSubmit={login}>
      <h2>Connexion à ton compte BCX</h2>
      <label>E-mail<input style={input} type="email" required value={email} onChange={e => setEmail(e.target.value)} /></label>
      <label>Mot de passe<input style={input} type="password" required value={password} onChange={e => setPassword(e.target.value)} /></label>
      <button style={{ ...button, marginTop: 15 }} disabled={busy || !client}>Se connecter</button>
      <p style={{ color: "#aebbd0" }}>Utilise ton compte BCX existant. Aucun secret n'est demandé en dehors de la connexion.</p>
    </form> : <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <p>Compte : {session.user.email}</p><button style={button} onClick={() => void client?.auth.signOut()}>Se déconnecter</button>
      </div>
      <form style={card} onSubmit={create}>
        <h2>Nouvelle clé API</h2>
        <label>Nom<input style={input} required maxLength={80} value={name} onChange={e => setName(e.target.value)} /></label>
        <label>Expiration (jours)<input style={input} type="number" min={1} max={365} required value={days} onChange={e => setDays(Number(e.target.value))} /></label>
        <p>Permission actuelle : lecture de la mémoire de ce compte. Maximum 10 clés actives.</p>
        <button style={button} disabled={busy}>Générer ma clé BCX</button>
      </form>
      {fresh && <section style={card}><h2>⚠️ Copie ta clé maintenant</h2><p style={{ overflowWrap: "anywhere" }}><code>{fresh}</code></p>
        <button style={button} onClick={() => void navigator.clipboard.writeText(fresh)}>Copier la clé</button>
        <button style={{ ...button, marginLeft: 8, background: "#475569" }} onClick={() => setFresh("")}>Masquer</button>
      </section>}
      <section style={card}><h2>Mes clés</h2>
        {keys.length === 0 ? <p>Aucune clé enregistrée.</p> : keys.map(key => <article key={key.id} style={{ borderTop: "1px solid #334155", padding: "14px 0" }}>
          <strong>{key.name}</strong><p><code>{key.key_prefix}…</code> · {key.revoked_at ? "Révoquée" : "Active"} · Expiration : {key.expires_at ? new Date(key.expires_at).toLocaleDateString("fr-FR") : "Aucune"}</p>
          {!key.revoked_at && <button style={{ ...button, background: "#b91c1c" }} disabled={busy} onClick={() => void revoke(key.id)}>Révoquer</button>}
        </article>)}
      </section>
    </>}
    <footer style={{ marginTop: 40, color: "#aebbd0" }}>Ne publie jamais tes clés secrètes dans un dépôt GitHub ou le navigateur.</footer>
  </main>;
}

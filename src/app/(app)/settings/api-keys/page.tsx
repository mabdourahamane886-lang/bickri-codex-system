"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type KeyInfo = {
  id: string;
  name: string;
  key_prefix: string;
  scopes: string[];
  created_at: string;
  expires_at: string | null;
  revoked_at: string | null;
  last_used_at: string | null;
};

export default function BcxApiKeysPage() {
  const [keys, setKeys] = useState<KeyInfo[]>([]);
  const [name, setName] = useState("Mon application BCX");
  const [days, setDays] = useState(90);
  const [newKey, setNewKey] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    try {
      const response = await fetch("/api/bcx/keys", { cache: "no-store" });
      const data: { keys?: KeyInfo[]; error?: string } = await response.json();
      if (!response.ok) throw new Error(data.error || "Chargement impossible.");
      setKeys(data.keys ?? []);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de chargement.");
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  async function createKey(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError(""); setNewKey("");
    try {
      const response = await fetch("/api/bcx/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, expiresInDays: days }),
      });
      const data: { key?: string; error?: string } = await response.json();
      if (!response.ok || !data.key) throw new Error(data.error || "Création impossible.");
      setNewKey(data.key);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Création impossible.");
    } finally { setBusy(false); }
  }

  async function revokeKey(id: string) {
    if (!window.confirm("Révoquer définitivement cette clé BCX ?")) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/bcx/keys?id=" + encodeURIComponent(id), { method: "DELETE" });
      const data: { error?: string } = await response.json();
      if (!response.ok) throw new Error(data.error || "Révocation impossible.");
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Révocation impossible.");
    } finally { setBusy(false); }
  }

  return (
    <main style={{ maxWidth: 840, margin: "0 auto", padding: "28px 18px 100px" }}>
      <Link href="/ai">← Retour au chat</Link>
      <h1>Clés API BCX</h1>
      <p>Génère des clés pour tes applications. Elles donnent actuellement accès à la lecture de ta mémoire BCX uniquement.</p>
      <form onSubmit={createKey} style={{ display: "grid", gap: 12, maxWidth: 520, margin: "24px 0" }}>
        <label>Nom de la clé<input required maxLength={80} value={name} onChange={e => setName(e.target.value)} style={{ display: "block", width: "100%", padding: 10 }} /></label>
        <label>Expiration en jours (1–365)<input type="number" min={1} max={365} required value={days} onChange={e => setDays(Number(e.target.value))} style={{ display: "block", width: "100%", padding: 10 }} /></label>
        <button className="btn btn-primary" type="submit" disabled={busy}>Créer une clé BCX</button>
      </form>
      {error && <p role="alert" style={{ color: "crimson" }}>{error}</p>}
      {newKey && <section aria-label="Nouvelle clé" style={{ border: "1px solid currentColor", borderRadius: 12, padding: 16, overflowWrap: "anywhere" }}>
        <strong>Copie cette clé maintenant : elle ne sera plus affichée.</strong>
        <p><code>{newKey}</code></p>
        <button className="btn" onClick={() => void navigator.clipboard.writeText(newKey)}>Copier la clé</button>
        <button className="btn" onClick={() => setNewKey("")}>Masquer</button>
      </section>}
      <h2>Mes clés</h2>
      {keys.length === 0 ? <p>Aucune clé API créée.</p> : (
        <div style={{ display: "grid", gap: 12 }}>
          {keys.map(key => (
            <article key={key.id} style={{ padding: 16, border: "1px solid #8885", borderRadius: 12 }}>
              <strong>{key.name}</strong> <code>{key.key_prefix}…</code>
              <p>Accès : {key.scopes.join(", ")} · {key.revoked_at ? "Révoquée" : "Active"} · Expire : {key.expires_at ? new Date(key.expires_at).toLocaleDateString("fr-FR") : "jamais"}</p>
              {!key.revoked_at && <button className="btn" disabled={busy} onClick={() => void revokeKey(key.id)}>Révoquer</button>}
            </article>
          ))}
        </div>
      )}
      <h2>Exemple d'utilisation</h2>
      <pre style={{ overflowX: "auto", padding: 14, borderRadius: 12, background: "#80808015" }}><code>{'curl -H "Authorization: Bearer bcx_sk_VOTRE_CLE" https://bickri-codex-system.vercel.app/api/bcx/v1/memories'}</code></pre>
      <p>Ne place jamais une clé secrète dans le JavaScript public d’un site.</p>
    </main>
  );
}

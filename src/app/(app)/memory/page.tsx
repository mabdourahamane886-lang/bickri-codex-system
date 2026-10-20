"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft, Brain, Loader2, Pencil, Plus, Save, Trash2, X } from "lucide-react";

type Memory = {
  id: string;
  title: string;
  content: string;
  category: string;
  created_at: string;
  updated_at: string;
};

const CATEGORIES = [
  { value: "preference", label: "Préférences" },
  { value: "project", label: "Projets" },
  { value: "goal", label: "Objectifs" },
  { value: "learning", label: "Apprentissage" },
  { value: "general", label: "Général" },
];

export default function AIMemoryPage() {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState("general");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/ai/memories", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Impossible de charger la mémoire.");
      setMemories(Array.isArray(data.memories) ? data.memories : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Une erreur est survenue.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  function resetForm() {
    setEditing(null);
    setTitle("");
    setContent("");
    setCategory("general");
  }

  function startEdit(memory: Memory) {
    setEditing(memory.id);
    setTitle(memory.title);
    setContent(memory.content);
    setCategory(memory.category || "general");
    setNotice("");
    setError("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(editing ? `/api/ai/memories/${editing}` : "/api/ai/memories", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, content, category }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Enregistrement impossible.");
      resetForm();
      setNotice(editing ? "Souvenir mis à jour." : "Souvenir enregistré.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Une erreur est survenue.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(memory: Memory) {
    if (!window.confirm(`Supprimer le souvenir « ${memory.title} » ? Cette action est définitive.`)) return;
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/ai/memories/${memory.id}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Suppression impossible.");
      if (editing === memory.id) resetForm();
      setMemories((items) => items.filter((item) => item.id !== memory.id));
      setNotice("Souvenir supprimé.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Une erreur est survenue.");
    }
  }

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">
      <Link href="/ai" className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground transition hover:text-foreground">
        <ArrowLeft size={16} aria-hidden="true" /> Retour à Bickri AI
      </Link>

      <header className="mb-6 flex items-start gap-3">
        <div className="rounded-2xl border border-border bg-muted p-3"><Brain size={25} aria-hidden="true" /></div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Mémoire intelligente</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Enregistre les informations que tu souhaites que Bickri AI puisse réutiliser pour personnaliser ses réponses.
          </p>
        </div>
      </header>

      <div className="mb-6 rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
        <strong className="text-foreground">Tu gardes le contrôle.</strong> Ces souvenirs sont liés à ton compte. Tu peux les consulter, les modifier ou les supprimer. Évite d’y enregistrer des mots de passe, clés API ou autres secrets.
      </div>

      {error && <p role="alert" className="mb-4 rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-600">{error}</p>}
      {notice && <p role="status" className="mb-4 rounded-lg border border-border bg-muted p-3 text-sm">{notice}</p>}

      <section className="mb-8 rounded-2xl border border-border bg-card p-4 sm:p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="font-semibold">{editing ? "Modifier un souvenir" : "Ajouter un souvenir"}</h2>
          {editing && <button type="button" onClick={resetForm} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><X size={15} /> Annuler</button>}
        </div>
        <form onSubmit={submit} className="space-y-4">
          <label className="block text-sm font-medium">
            Titre
            <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} required placeholder="Ex. Mon projet principal" className="mt-1.5 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring" />
          </label>
          <label className="block text-sm font-medium">
            Information à retenir
            <textarea value={content} onChange={(event) => setContent(event.target.value)} maxLength={4000} required rows={4} placeholder="Décris clairement ce que Bickri AI doit retenir…" className="mt-1.5 w-full resize-y rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring" />
            <span className="mt-1 block text-right text-xs text-muted-foreground">{content.length}/4000</span>
          </label>
          <label className="block text-sm font-medium">
            Catégorie
            <select value={category} onChange={(event) => setCategory(event.target.value)} className="mt-1.5 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring">
              {CATEGORIES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>
          <button type="submit" disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60">
            {saving ? <Loader2 size={16} className="animate-spin" /> : editing ? <Save size={16} /> : <Plus size={16} />}
            {saving ? "Enregistrement…" : editing ? "Enregistrer les modifications" : "Enregistrer le souvenir"}
          </button>
        </form>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="font-semibold">Mes souvenirs</h2>
          <span className="text-xs text-muted-foreground">{memories.length}/100</span>
        </div>
        {loading ? (
          <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 size={18} className="animate-spin" /> Chargement de ta mémoire…</div>
        ) : memories.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border px-4 py-10 text-center">
            <Brain size={28} className="mx-auto mb-3 text-muted-foreground" />
            <p className="font-medium">Ta mémoire est vide</p>
            <p className="mt-1 text-sm text-muted-foreground">Ajoute une préférence ou un projet que tu souhaites retrouver plus tard.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {memories.map((memory) => (
              <article key={memory.id} className="rounded-2xl border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <span className="inline-block rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">{CATEGORIES.find((item) => item.value === memory.category)?.label || memory.category || "Général"}</span>
                    <h3 className="mt-2 break-words font-semibold">{memory.title}</h3>
                    <p className="mt-1 whitespace-pre-wrap break-words text-sm text-muted-foreground">{memory.content}</p>
                    <p className="mt-3 text-xs text-muted-foreground">Mis à jour le {new Date(memory.updated_at).toLocaleDateString("fr-FR")}</p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button type="button" onClick={() => startEdit(memory)} aria-label={`Modifier ${memory.title}`} className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground"><Pencil size={17} /></button>
                    <button type="button" onClick={() => void remove(memory)} aria-label={`Supprimer ${memory.title}`} className="rounded-lg p-2 text-muted-foreground hover:bg-red-500/10 hover:text-red-600"><Trash2 size={17} /></button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Brain, Plus, Save, Trash2, RefreshCw } from "lucide-react";

type Memory = { id: string; title: string; content: string; category: string; updated_at: string };
export default function MemoriesPage() {
  const [items,setItems]=useState<Memory[]>([]);
  const [title,setTitle]=useState(""); const [content,setContent]=useState(""); const [category,setCategory]=useState("general");
  const [editing,setEditing]=useState<string|null>(null); const [loading,setLoading]=useState(false); const [error,setError]=useState("");
  async function load(){setLoading(true);setError("");try{const r=await fetch("/api/ai/memories",{cache:"no-store"});const d=await r.json();if(!r.ok)throw new Error(d.error);setItems(d.memories??[]);}catch(e){setError(e instanceof Error?e.message:"Chargement impossible.");}finally{setLoading(false);}}
  useEffect(()=>{void load();},[]);
  function reset(){setEditing(null);setTitle("");setContent("");setCategory("general");}
  async function save(e:React.FormEvent){e.preventDefault();setLoading(true);setError("");try{const r=await fetch("/api/ai/memories",{method:editing?"PATCH":"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...(editing?{id:editing}:{}),title,content,category})});const d=await r.json();if(!r.ok)throw new Error(d.error);reset();await load();}catch(e){setError(e instanceof Error?e.message:"Enregistrement impossible.");}finally{setLoading(false);}}
  async function remove(id:string){if(!confirm("Supprimer définitivement ce souvenir ?"))return;setLoading(true);try{const r=await fetch("/api/ai/memories?id="+encodeURIComponent(id),{method:"DELETE"});const d=await r.json();if(!r.ok)throw new Error(d.error);setItems(x=>x.filter(m=>m.id!==id));if(editing===id)reset();}catch(e){setError(e instanceof Error?e.message:"Suppression impossible.");}finally{setLoading(false);}}
  return <main className="mx-auto w-full max-w-5xl space-y-6 p-5 md:p-8">
    <Link href="/ai" className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-950"><ArrowLeft size={16}/> Retour à Bickri AI</Link>
    <header className="flex items-center gap-3"><span className="rounded-2xl bg-blue-50 p-3 text-blue-700"><Brain/></span><div><h1 className="text-2xl font-semibold text-slate-900">Mémoire personnelle</h1><p className="text-sm text-slate-500">Gère les informations que Bickri AI peut retenir pour tes prochaines conversations.</p></div></header>
    {error&&<p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    <form onSubmit={save} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="font-semibold text-slate-900">{editing?"Modifier un souvenir":"Ajouter un souvenir"}</h2>
      <input required maxLength={120} value={title} onChange={e=>setTitle(e.target.value)} placeholder="Titre (ex. Préférence de réponse)" className="w-full rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-blue-500"/>
      <textarea required maxLength={4000} rows={4} value={content} onChange={e=>setContent(e.target.value)} placeholder="Décris précisément ce que Bickri AI doit retenir…" className="w-full rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-blue-500"/>
      <div className="flex flex-wrap gap-3"><select value={category} onChange={e=>setCategory(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm"><option value="general">Général</option><option value="preferences">Préférences</option><option value="projects">Projets</option><option value="work">Travail</option><option value="learning">Apprentissage</option></select><button disabled={loading} className="inline-flex items-center gap-2 rounded-xl bg-blue-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"><Save size={16}/> {editing?"Enregistrer":"Ajouter"}</button>{editing&&<button type="button" onClick={reset} className="rounded-xl border px-4 py-2 text-sm">Annuler</button>}</div>
    </form>
    <section className="space-y-3"><div className="flex items-center justify-between"><h2 className="font-semibold text-slate-900">Souvenirs enregistrés ({items.length})</h2><button onClick={()=>void load()} disabled={loading} className="inline-flex items-center gap-2 text-sm text-slate-600"><RefreshCw size={15}/> Actualiser</button></div>
      {loading&&!items.length?<p className="text-sm text-slate-500">Chargement…</p>:items.length===0?<p className="rounded-xl border border-dashed p-6 text-sm text-slate-500">Aucun souvenir enregistré pour le moment.</p>:items.map(m=><article key={m.id} className="rounded-xl border border-slate-200 bg-white p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-medium text-slate-900">{m.title}</h3><span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600">{m.category}</span></div><p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">{m.content}</p></div><div className="flex shrink-0 gap-2"><button onClick={()=>{setEditing(m.id);setTitle(m.title);setContent(m.content);setCategory(m.category);}} className="rounded-lg border px-3 py-2 text-xs">Modifier</button><button onClick={()=>void remove(m.id)} aria-label="Supprimer" className="rounded-lg border border-red-200 p-2 text-red-600"><Trash2 size={15}/></button></div></div></article>)}
    </section>
  </main>;
}

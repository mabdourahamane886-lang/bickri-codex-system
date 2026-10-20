"use client";

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { Download, ImagePlus, Loader2, RefreshCw, Sparkles, Upload, WandSparkles, X } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";

type Mode = "generate" | "edit";
type Result = { image: string; mimeType: string; model: string };

const EXAMPLES = [
  "Photo réaliste d’un marché animé à Niamey au coucher du soleil, lumière naturelle, détails photographiques",
  "Portrait professionnel d’un entrepreneur africain, studio premium, éclairage doux, photographie réaliste",
  "Affiche publicitaire élégante pour une marque de jus naturel, fruits frais, fond lumineux, rendu commercial",
];

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Lecture de l’image impossible."));
    reader.onerror = () => reject(new Error("Lecture de l’image impossible."));
    reader.readAsDataURL(file);
  });
}

export default function ImageStudioPage() {
  const [mode, setMode] = useState<Mode>("generate");
  const [prompt, setPrompt] = useState("");
  const [source, setSource] = useState<{ file: File; preview: string; data: string } | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => { if (source?.preview) URL.revokeObjectURL(source.preview); }, [source?.preview]);

  async function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Formats acceptés : JPG, PNG et WebP.");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setError("La photo doit faire 8 Mo maximum.");
      return;
    }
    try {
      setError("");
      const data = await fileToDataUrl(file);
      setSource({ file, preview: URL.createObjectURL(file), data });
      setMode("edit");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Impossible de lire cette image.");
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (loading) return;
    if (mode === "edit" && !source) {
      setError("Importe d’abord la photo que tu veux modifier.");
      return;
    }
    if (prompt.trim().length < 3) {
      setError("Décris précisément l’image que tu souhaites obtenir.");
      return;
    }
    setLoading(true);
    setError("");
    setResult(null);
    setPrompt(""); // Vider la saisie dès l’envoi, comme dans le chat BCX.
    try {
      const response = await fetch("/api/ai/images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          prompt: prompt.trim(),
          ...(mode === "edit" && source ? { imageData: source.data, mimeType: source.file.type } : {}),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "La demande a échoué.");
      if (typeof data.image !== "string" || !data.image.startsWith("data:image/")) {
        throw new Error("Le service n’a pas retourné de fichier image.");
      }
      setResult({ image: data.image, mimeType: data.mimeType, model: data.model });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Une erreur inattendue est survenue.");
    } finally {
      setLoading(false);
    }
  }

  const downloadName = `bcx-image-${new Date().toISOString().slice(0, 10)}.${result?.mimeType === "image/jpeg" ? "jpg" : result?.mimeType === "image/webp" ? "webp" : "png"}`;

  return (
    <main className="content">
      <PageHeader title="Studio d’images IA" description="Crée des images originales avec Gemini Imagen 3, ou transforme tes propres photos avec l’IA." />

      <div className="grid-2" style={{ alignItems: "start" }}>
        <section className="card card-pad stack" style={{ gap: 18 }}>
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <button type="button" className={`btn ${mode === "generate" ? "btn-primary" : ""}`} onClick={() => { setMode("generate"); setError(""); }}><Sparkles size={16} /> Créer une image</button>
            <button type="button" className={`btn ${mode === "edit" ? "btn-primary" : ""}`} onClick={() => { setMode("edit"); setError(""); }}><WandSparkles size={16} /> Modifier une photo</button>
          </div>

          {mode === "edit" && (
            <div className="stack" style={{ gap: 10 }}>
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={chooseFile} hidden />
              {source ? (
                <div className="card card-pad row" style={{ alignItems: "center", gap: 12 }}>
                  <img src={source.preview} alt="Photo originale à modifier" style={{ width: 88, height: 88, objectFit: "cover", borderRadius: 10 }} />
                  <div className="grow"><b>Photo importée</b><p className="muted" style={{ fontSize: 13 }}>{source.file.name} · {(source.file.size / 1024 / 1024).toFixed(1)} Mo</p><button type="button" className="btn btn-sm" onClick={() => fileRef.current?.click()}><RefreshCw size={14} /> Changer</button></div>
                  <button type="button" className="btn btn-icon btn-ghost" aria-label="Retirer la photo" onClick={() => setSource(null)}><X size={16} /></button>
                </div>
              ) : (
                <button type="button" className="card card-pad stack" style={{ textAlign: "center", alignItems: "center", padding: 28, borderStyle: "dashed", cursor: "pointer" }} onClick={() => fileRef.current?.click()}>
                  <Upload size={26} /><b>Importer une photo à modifier</b><span className="muted">JPG, PNG ou WebP · 8 Mo maximum</span>
                </button>
              )}
            </div>
          )}

          <form onSubmit={submit} className="stack" style={{ gap: 12 }}>
            <label htmlFor="image-prompt"><b>{mode === "edit" ? "Comment modifier cette photo ?" : "Décris l’image à créer"}</b></label>
            <textarea id="image-prompt" className="input" value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={5} maxLength={4000} placeholder={mode === "edit" ? "Ex. : améliore la lumière, conserve mon visage, remplace le fond par un studio professionnel…" : "Décris le sujet, le style, l’éclairage, le décor et le cadrage souhaités…"} style={{ width: "100%", resize: "vertical", lineHeight: 1.6 }} />
            <div className="row" style={{ justifyContent: "space-between" }}><span className="muted" style={{ fontSize: 12 }}>Décris les détails importants pour un résultat plus précis.</span><span className="muted" style={{ fontSize: 12 }}>{prompt.length}/4000</span></div>
            <button className="btn btn-primary" type="submit" disabled={loading || prompt.trim().length < 3 || (mode === "edit" && !source)} style={{ justifyContent: "center", minHeight: 44 }}>
              {loading ? <><Loader2 className="spin" size={17} /> Génération en cours…</> : mode === "edit" ? <><WandSparkles size={17} /> Modifier ma photo</> : <><ImagePlus size={17} /> Générer l’image</>}
            </button>
          </form>

          {error && <div className="alert alert-danger" role="alert">{error}</div>}

          {mode === "generate" && (
            <div className="stack" style={{ gap: 8 }}>
              <b style={{ fontSize: 13 }}>Exemples de descriptions</b>
              {EXAMPLES.map((example) => <button type="button" key={example} className="btn btn-ghost" style={{ justifyContent: "flex-start", textAlign: "left", whiteSpace: "normal", height: "auto", padding: 10 }} onClick={() => setPrompt(example)}>{example}</button>)}
            </div>
          )}
        </section>

        <section className="card card-pad stack" style={{ minHeight: 420, gap: 14 }}>
          <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}><h2 style={{ margin: 0, fontSize: 18 }}>Résultat</h2>{result && <a className="btn btn-sm" href={result.image} download={downloadName}><Download size={15} /> Télécharger</a>}</div>
          {result ? (
            <>
              <img src={result.image} alt={mode === "edit" ? "Photo modifiée par Bickri Code AI" : "Image générée par Bickri Code AI"} style={{ width: "100%", height: "auto", maxHeight: 720, objectFit: "contain", borderRadius: 12, background: "var(--surface-2)" }} />
              <p className="muted" style={{ fontSize: 12 }}>Image générée par le modèle {result.model}. Télécharge-la pour la conserver.</p>
              <button type="button" className="btn" onClick={() => { setMode("edit"); setSource({ file: new File([Uint8Array.from(atob(result.image.split(",")[1]), c => c.charCodeAt(0))], downloadName, { type: result.mimeType }), preview: result.image, data: result.image }); setPrompt("Améliore la netteté et l’éclairage sans modifier le sujet principal."); }}><WandSparkles size={15} /> Modifier ce résultat</button>
            </>
          ) : (
            <div className="stack" style={{ flex: 1, justifyContent: "center", alignItems: "center", textAlign: "center", padding: 24, border: "1px dashed var(--border)", borderRadius: 12, gap: 10 }}>
              {loading ? <><Loader2 className="spin" size={34} /><b>L’IA travaille sur ton image…</b><span className="muted">Cela peut prendre quelques instants.</span></> : <><ImagePlus size={36} /><b>Ton image apparaîtra ici</b><span className="muted">Création originale ou modification de ta photo.</span></>}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

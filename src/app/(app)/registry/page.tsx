"use client";

import { useMemo, useState, type FormEvent } from "react";
import { Cloud, Copy, Download, Fingerprint, HardDrive, Plus, RefreshCw, Search, Trash2, CircleAlert } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { CopyButton } from "@/components/ui/CopyButton";
import { useToast } from "@/components/ui/Toast";
import { useRegistry } from "@/hooks/useRegistry";
import { CATEGORIES, GREEK_LETTERS, STATUSES, categoryLabel, formatCode, greekSymbol, isValidVersion, nextSerial, type Status } from "@/lib/codex";
import { toCsv, type Entry } from "@/lib/registry";

export default function RegistryPage() {
  const { entries, ready, signedIn, cloudError, create, remove, refresh } = useRegistry();
  const { notify } = useToast();

  const [query, setQuery] = useState("");
  const [catFilter, setCatFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | Status>("all");

  const [name, setName] = useState("");
  const [category, setCategory] = useState("AI");
  const [greek, setGreek] = useState("THETA");
  const [version, setVersion] = useState("1.0.0");
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);

  const preview = useMemo(() => formatCode(category, greek, nextSerial(entries.map((e) => e.id), category, greek)), [entries, category, greek]);
  const versionOk = isValidVersion(version);
  const nameOk = name.trim().length > 0;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter((e) =>
      (!q || `${e.id} ${e.name} ${e.category} ${e.greek}`.toLowerCase().includes(q)) &&
      (catFilter === "all" || e.category === catFilter) &&
      (statusFilter === "all" || e.status === statusFilter));
  }, [entries, query, catFilter, statusFilter]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (!nameOk || !versionOk || busy) return;
    setBusy(true);
    try {
      const entry = await create({ name: name.trim(), category, greek, version: version.trim() });
      setName("");
      setTouched(false);
      notify(entry.source === "cloud"
        ? `${entry.id} créé dans le registre partagé.`
        : `${entry.id} créé sur cet appareil. Connecte-toi pour l'enregistrer dans le registre partagé.`, "success");
    } catch (err) {
      notify(err instanceof Error ? err.message : "La création a échoué.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(entry: Entry) {
    const where = entry.source === "cloud" ? "du registre partagé" : "de cet appareil";
    if (!window.confirm(`Supprimer ${entry.id} ${where} ? Cette action est définitive.`)) return;
    try {
      await remove(entry);
      notify(`${entry.id} supprimé.`, "success");
    } catch (err) {
      notify(err instanceof Error ? err.message : "Suppression impossible.", "error");
    }
  }

  async function copyId(id: string) {
    try { await navigator.clipboard.writeText(id); notify(`${id} copié.`, "success"); }
    catch { notify("Copie indisponible sur ce navigateur.", "error"); }
  }

  function exportCsv() {
    const url = URL.createObjectURL(new Blob([toCsv(visible)], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = `bcx-registre-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="content">
      <PageHeader
        title="Registre BCX"
        description="Identifiants officiels des produits de l'écosystème BICKRI. Chaque code est unique, lisible et traçable."
        actions={<>
          {signedIn && <button className="btn" onClick={() => refresh()}><RefreshCw /> Actualiser</button>}
          <button className="btn" onClick={exportCsv} disabled={!visible.length}><Download /> Exporter CSV</button>
        </>}
      />

      {cloudError && <div className="alert alert-warning" style={{ marginBottom: 16 }}><CircleAlert /><span>{cloudError}</span></div>}

      <div className="registry-layout">
        <section className="card" aria-labelledby="registry-title">
          <div className="card-head">
            <div><h2 id="registry-title">Identifiants</h2><p>{signedIn ? "Registre partagé et identifiants locaux" : "Identifiants enregistrés sur cet appareil"}</p></div>
            <Badge tone={signedIn ? "success" : "neutral"}>{signedIn ? "Synchronisé" : "Mode local"}</Badge>
          </div>
          <div className="toolbar">
            <label className="input-group">
              <Search aria-hidden="true" />
              <span className="sr-only">Rechercher</span>
              <input className="input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher un code ou un projet" />
            </label>
            <select className="select" value={catFilter} onChange={(e) => setCatFilter(e.target.value)} aria-label="Filtrer par catégorie">
              <option value="all">Toutes catégories</option>
              {CATEGORIES.map((c) => <option key={c.code} value={c.code}>{c.code} · {c.label}</option>)}
            </select>
            <select className="select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as "all" | Status)} aria-label="Filtrer par statut">
              <option value="all">Tous statuts</option>
              {Object.entries(STATUSES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>

          <div className="table-wrap">
            <table className="table registry-table">
              <thead>
                <tr><th>Identifiant</th><th>Projet</th><th className="hide-sm">Version</th><th>Statut</th><th className="hide-sm">Créé le</th><th><span className="sr-only">Actions</span></th></tr>
              </thead>
              <tbody>
                {!ready && Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i}><td colSpan={6}><div className="skeleton" style={{ height: 14 }} /></td></tr>
                ))}
                {ready && visible.map((e) => (
                  <tr key={e.id}>
                    <td>
                      <button className="id-button code-id" onClick={() => copyId(e.id)} title="Copier l'identifiant">{e.id}<Copy aria-hidden="true" /></button>
                      <span className="source-tag">{e.source === "cloud" ? <><Cloud aria-hidden="true" /> Partagé</> : <><HardDrive aria-hidden="true" /> Local</>}</span>
                    </td>
                    <td><b style={{ fontWeight: 500 }}>{e.name}</b><span className="cell-sub">{categoryLabel(e.category)} · {greekSymbol(e.greek)} {e.greek}</span></td>
                    <td className="hide-sm mono num">v{e.version}</td>
                    <td><Badge tone={STATUSES[e.status].tone}>{STATUSES[e.status].label}</Badge></td>
                    <td className="hide-sm num faint">{new Date(e.createdAt).toLocaleDateString("fr-FR")}</td>
                    <td style={{ textAlign: "right" }}>
                      <button className="btn btn-ghost btn-icon btn-sm btn-danger" onClick={() => onDelete(e)} aria-label={`Supprimer ${e.id}`} title="Supprimer"><Trash2 /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {ready && visible.length === 0 && (
              <EmptyState icon={<Fingerprint />} title={entries.length ? "Aucun résultat" : "Registre vide"}>
                {entries.length ? "Aucun identifiant ne correspond à ces filtres." : "Crée ton premier identifiant BCX avec le formulaire."}
              </EmptyState>
            )}
          </div>
          <div className="card-foot"><span>{visible.length} sur {entries.length} identifiant(s)</span><span>Clique sur un code pour le copier</span></div>
        </section>

        <aside className="registry-side">
          <form className="card" onSubmit={submit} noValidate>
            <div className="card-head"><div><h2>Nouvel identifiant</h2><p>Le numéro est attribué automatiquement.</p></div></div>
            <div className="card-body form-grid">
              <label className="field">
                <span className="field-label">Nom du projet</span>
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex. Bickri Pay" maxLength={120} aria-invalid={touched && !nameOk} />
                {touched && !nameOk && <span className="field-error">Le nom du projet est requis.</span>}
              </label>
              <label className="field">
                <span className="field-label">Catégorie</span>
                <select className="select" value={category} onChange={(e) => setCategory(e.target.value)}>
                  {CATEGORIES.map((c) => <option key={c.code} value={c.code}>{c.code} · {c.label}</option>)}
                </select>
              </label>
              <div className="form-row">
                <label className="field">
                  <span className="field-label">Série grecque</span>
                  <select className="select" value={greek} onChange={(e) => setGreek(e.target.value)}>
                    {GREEK_LETTERS.map((g) => <option key={g.name} value={g.name}>{g.symbol} {g.name}</option>)}
                  </select>
                </label>
                <label className="field">
                  <span className="field-label">Version</span>
                  <input className="input mono" value={version} onChange={(e) => setVersion(e.target.value)} placeholder="1.0.0" aria-invalid={!versionOk} />
                </label>
              </div>
              {versionOk ? <span className="field-hint" style={{ marginTop: -8 }}>Version au format X.Y.Z (versionnage sémantique)</span> : <span className="field-error" style={{ marginTop: -8 }}>Utilise le format X.Y.Z, par exemple 1.0.0.</span>}
              <div className="field">
                <span className="field-label">Aperçu</span>
                <div className="id-preview"><span className="code-id">{preview}</span><CopyButton value={preview} /></div>
              </div>
              <button className="btn btn-primary btn-block btn-lg" type="submit" disabled={busy}>
                {busy ? <RefreshCw className="spin" /> : <Plus />} {busy ? "Création…" : "Créer l'identifiant"}
              </button>
              <p className="field-hint">{signedIn ? "Enregistré dans le registre partagé Supabase." : "Sans connexion, l'identifiant reste sur cet appareil."}</p>
            </div>
          </form>

          <section className="card card-pad stack" aria-label="Règle de construction">
            <h3 style={{ fontSize: "var(--text-sm)" }}>Règle de construction</h3>
            <div className="formula" aria-label="BCX, catégorie, série grecque, numéro">
              <span className="f-accent">BCX</span><b>-</b><span className="f-gold">CATÉGORIE</span><b>-</b><span className="f-info">SÉRIE</span><b>-</b><span className="f-ok">001</span>
            </div>
            <p className="muted" style={{ fontSize: "var(--text-xs)" }}>Préfixe du système, domaine du produit, génération grecque (Α à Ω) puis numéro séquentiel unique par couple catégorie et série.</p>
          </section>
        </aside>
      </div>
    </main>
  );
}

"use client";

import Link from "next/link";
import { ArrowUpRight, CircleCheck, CircleDashed, CircleAlert, Code, Database, Fingerprint, GitBranch, Plus, Sparkles, Cloud, Layers } from "lucide-react";
import { Badge, type Tone } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { useSession } from "@/components/providers/SessionProvider";
import { useConfig } from "@/hooks/useConfig";
import { useRegistry } from "@/hooks/useRegistry";
import { CATEGORIES, STATUSES, categoryLabel } from "@/lib/codex";

type Check = { label: string; detail: string; tone: Tone; state: string; icon: typeof CircleCheck };

export default function Dashboard() {
  const { user } = useSession();
  const { config } = useConfig();
  const { entries, ready } = useRegistry();

  const active = entries.filter((e) => e.status === "active").length;
  const usedCategories = new Set(entries.map((e) => e.category)).size;
  const greeting = user?.email ? `Bonjour, ${user.email.split("@")[0]}` : "Bienvenue sur BCX";

  const ok = (v: boolean | undefined, yes: string, no: string): Pick<Check, "tone" | "state" | "icon"> =>
    v === undefined ? { tone: "neutral", state: "Vérification…", icon: CircleDashed } : v ? { tone: "success", state: yes, icon: CircleCheck } : { tone: "warning", state: no, icon: CircleAlert };

  const checks: Check[] = [
    { label: "Base de données Supabase", detail: "Authentification et registre partagé", ...ok(config?.supabase, "Configurée", "À configurer") },
    { label: "Bickri Code AI", detail: config ? `Modèle ${config.aiModel}` : "Assistant de programmation", ...ok(config?.ai, "Opérationnelle", "Clé manquante") },
    { label: "GitHub MCP", detail: "Lecture de dépôts pour l'IA", ...ok(config?.githubMcp, "Connecté", "Optionnel") },
    { label: "Exécution cloud", detail: "Terminal et builds isolés", tone: "neutral", state: "Planifié", icon: CircleDashed },
  ];

  return (
    <main className="content">
      <section className="card welcome">
        <div>
          <Badge tone="gold" dot={false}>BICKRI CODEX SYSTEM</Badge>
          <h1 style={{ marginTop: 12 }}>{greeting}</h1>
          <p>Ton espace pour enregistrer les produits de l&apos;écosystème BICKRI, prototyper du code et travailler avec ton assistant de programmation.</p>
          <div className="welcome-actions">
            <Link href="/registry" className="btn btn-primary"><Plus /> Nouvel identifiant</Link>
            <Link href="/studio" className="btn"><Code /> Ouvrir le studio</Link>
            <Link href="/ai" className="btn btn-ghost"><Sparkles /> Demander à l&apos;IA</Link>
          </div>
        </div>
        <div className="welcome-art" aria-hidden="true">
          <div className="mini-terminal">
            <div className="mini-terminal-bar"><i /><i /><i /><span>bcx — registre</span></div>
            <pre>
              <span className="t-accent">$</span> bcx new --cat AI --serie THETA{"\n"}
              <span className="t-ok">✓</span> Identifiant réservé{"\n"}
              {"  "}<span className="t-gold">BCX-AI-THETA-{String(Math.max(1, entries.filter((e) => e.id.startsWith("BCX-AI-THETA-")).length + 1)).padStart(3, "0")}</span>{"\n"}
              <span className="t-accent">$</span> <span className="faint">_</span>
            </pre>
          </div>
        </div>
      </section>

      <section className="stats" aria-label="Indicateurs">
        <Stat icon={<Fingerprint />} label="Identifiants" value={ready ? entries.length : null} note={user ? "Registre partagé et local" : "Sur cet appareil"} />
        <Stat icon={<CircleCheck />} label="Actifs" value={ready ? active : null} note={`${STATUSES.active.label}s dans le registre`} />
        <Stat icon={<Layers />} label="Catégories utilisées" value={ready ? usedCategories : null} note={`Sur ${CATEGORIES.length} disponibles`} />
        <Stat icon={<Database />} label="Stockage" value={user ? "Partagé" : "Local"} note={user ? "Synchronisé avec Supabase" : "Connecte-toi pour synchroniser"} />
      </section>

      <div className="grid-2">
        <section className="card" aria-labelledby="recent-title">
          <div className="card-head">
            <div><h2 id="recent-title">Derniers identifiants</h2><p>Les produits enregistrés récemment</p></div>
            <Link href="/registry" className="btn btn-sm">Tout voir</Link>
          </div>
          {ready && entries.length === 0 ? (
            <EmptyState icon={<Fingerprint />} title="Aucun identifiant" action={<Link href="/registry" className="btn btn-primary btn-sm"><Plus /> Créer</Link>}>Enregistre ton premier produit.</EmptyState>
          ) : (
            <div className="list">
              {(ready ? entries.slice(0, 6) : []).map((e) => (
                <div className="list-item" key={e.id}>
                  <div className="list-item-main"><b className="code-id">{e.id}</b><small>{e.name} · {categoryLabel(e.category)}</small></div>
                  <Badge tone={STATUSES[e.status].tone}>{STATUSES[e.status].label}</Badge>
                </div>
              ))}
              {!ready && Array.from({ length: 4 }).map((_, i) => <div className="list-item" key={i}><div className="skeleton" style={{ height: 16, width: "100%" }} /></div>)}
            </div>
          )}
        </section>

        <section className="card" aria-labelledby="status-title">
          <div className="card-head">
            <div><h2 id="status-title">État du système</h2><p>Services réellement configurés</p></div>
            <Link href="/settings" className="btn btn-sm">Détails</Link>
          </div>
          <div className="list">
            {checks.map(({ label, detail, tone, state, icon: Icon }) => (
              <div className="list-item" key={label}>
                <span className="status-icon"><Icon /></span>
                <div className="list-item-main"><b>{label}</b><small>{detail}</small></div>
                <Badge tone={tone}>{state}</Badge>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section style={{ marginTop: 20 }} aria-label="Outils">
        <div className="grid-3">
          <Tool href="/studio" icon={<Code />} title="Studio de code" text="Éditeur HTML, CSS et JavaScript avec coloration syntaxique, aperçu multi-écrans et console." />
          <Tool href="/ai" icon={<Sparkles />} tone="gold" title="Bickri Code AI" text="Explique, génère et corrige du code. Peut lire un dépôt GitHub pour répondre dans son contexte." />
          <Tool href="/cloud" icon={<Cloud />} tone="info" title="BCX Cloud" text="Feuille de route de l'infrastructure : stockage, terminal, builds et intégration GitHub." />
        </div>
      </section>
      <p className="faint" style={{ marginTop: 24, fontSize: "var(--text-xs)", display: "flex", alignItems: "center", gap: 6 }}><GitBranch size={13} /> BICKRI CODEX SYSTEM · Code. Build. Evolve.</p>
    </main>
  );
}

function Stat({ icon, label, value, note }: { icon: React.ReactNode; label: string; value: number | string | null; note: string }) {
  return (
    <div className="card stat">
      <div className="stat-label">{icon}{label}</div>
      <div className="stat-value">{value === null ? <span className="skeleton" style={{ display: "inline-block", width: 40, height: 20 }} /> : value}</div>
      <div className="stat-note">{note}</div>
    </div>
  );
}

function Tool({ href, icon, title, text, tone }: { href: string; icon: React.ReactNode; title: string; text: string; tone?: "gold" | "info" }) {
  return (
    <Link href={href} className="card tool-card">
      <span className={`tool-card-icon ${tone ?? ""}`}>{icon}</span>
      <h3>{title}<ArrowUpRight /></h3>
      <p>{text}</p>
    </Link>
  );
}

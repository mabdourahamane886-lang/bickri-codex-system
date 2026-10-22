import Link from "next/link";
import type { Metadata } from "next";
import { ArrowUpRight, Code, Database, GitBranch, Hammer, Sparkles, SquareTerminal } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge, type Tone } from "@/components/ui/Badge";
import { getConfigStatus } from "@/lib/config";

export const metadata: Metadata = { title: "BCX Cloud" };
export const dynamic = "force-dynamic";

type Module = { icon: typeof Code; title: string; text: string; status: string; tone: Tone; href?: string; tag: string };

const ROADMAP = [
  { title: "Déploiement stable, authentification et base de données", text: "Supabase Auth, registre partagé, règles RLS." },
  { title: "Registre connecté à PostgreSQL", text: "Lecture, création et suppression des identifiants côté serveur." },
  { title: "Éditeur professionnel", text: "CodeMirror, onglets, aperçu multi-écrans et console." },
  { title: "Sessions cloud isolées", text: "Terminal, journaux et ports d'aperçu dans des conteneurs." },
  { title: "Environnements Node.js et Python", text: "Puis langages compilés." },
  { title: "Builds Flutter et Android", text: "Workers dédiés, artefacts APK et AAB." },
  { title: "IA consciente du projet et synchronisation GitHub", text: "Import, commits et déploiements contrôlés." },
  { title: "Revue de sécurité et mise en production", text: "Quotas, surveillance, sauvegardes." },
];

export default function CloudPage() {
  const config = getConfigStatus();
  const aiAvailable = config.gemini || config.openaiCompatible;
  const done = 3;

  const modules: Module[] = [
    { icon: Code, tag: "Édition", title: "Studio de code", text: "Éditeur HTML, CSS et JavaScript avec coloration syntaxique, aperçu isolé et console.", status: "Disponible", tone: "success", href: "/studio" },
    { icon: Sparkles, tag: "Assistant", title: "Bickri Code AI", text: "Génère du code, explique les erreurs et conçoit une architecture de projet.", status: aiAvailable ? "Disponible" : "Clé requise", tone: aiAvailable ? "success" : "warning", href: "/ai" },
    { icon: Database, tag: "Données", title: "Registre partagé", text: "Identifiants BCX stockés dans PostgreSQL avec contrôle d'accès par propriétaire.", status: config.supabase ? "Disponible" : "À configurer", tone: config.supabase ? "success" : "warning", href: "/registry" },
    { icon: SquareTerminal, tag: "Exécution", title: "Terminal Linux", text: "Terminal distant via WebSocket, sessions isolées, quotas et arrêt automatique.", status: "Planifié", tone: "neutral" },
    { icon: Hammer, tag: "Compilation", title: "Builds", text: "Jobs asynchrones Node.js et Python, puis Dart, Flutter et Android.", status: "Planifié", tone: "neutral" },
    { icon: GitBranch, tag: "DevOps", title: "GitHub et déploiements", text: "Lecture de dépôts pour l'IA aujourd'hui ; commits et déploiements ensuite.", status: config.githubMcp ? "Lecture seule" : "À connecter", tone: config.githubMcp ? "info" : "neutral" },
  ];

  return (
    <main className="content">
      <PageHeader title="BCX Cloud" description="Les briques de la plateforme et leur état réel. Le statut décrit ce qui est intégré au dépôt, pas une infrastructure supposée." />

      <div className="grid-3" style={{ marginBottom: 20 }}>
        {modules.map(({ icon: Icon, ...m }) => (
          <article key={m.title} className="card module-card">
            <header><span className="tool-card-icon"><Icon /></span><span className="faint" style={{ fontSize: "var(--text-xs)" }}>{m.tag}</span></header>
            <h3>{m.title}</h3>
            <p>{m.text}</p>
            <footer><Badge tone={m.tone}>{m.status}</Badge>{m.href && <Link href={m.href}>Ouvrir <ArrowUpRight /></Link>}</footer>
          </article>
        ))}
      </div>

      <div className="grid-2">
        <section className="card" aria-labelledby="roadmap-title">
          <div className="card-head"><div><h2 id="roadmap-title">Feuille de route</h2><p>{done} étapes sur {ROADMAP.length} réalisées</p></div></div>
          <div className="timeline">
            {ROADMAP.map((r, i) => (
              <div key={r.title} className="timeline-item">
                <span className={`timeline-step ${i < done ? "done" : i === done ? "current" : ""}`}>{i + 1}</span>
                <div><b>{r.title}</b><small>{r.text}</small></div>
                {i < done ? <Badge tone="success">Fait</Badge> : i === done ? <Badge tone="accent">Prochaine</Badge> : null}
              </div>
            ))}
          </div>
        </section>
        <section className="card card-pad stack" aria-labelledby="next-title" style={{ alignContent: "start" }}>
          <h2 id="next-title" style={{ fontSize: "var(--text-md)" }}>Activer l&apos;exécution cloud</h2>
          <p className="muted">Un vrai IDE cloud nécessite un service séparé, jamais le processus Next.js lui-même :</p>
          <ul className="muted bullets" style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 6, fontSize: "var(--text-sm)" }}>
            <li>workers isolés non root (terminal et builds) ;</li>
            <li>stockage objet privé et file de jobs ;</li>
            <li>passerelle WebSocket authentifiée ;</li>
            <li>quotas, délais d&apos;expiration et restrictions réseau ;</li>
            <li>images d&apos;exécution (Node, Python, Flutter, JDK, Android SDK).</li>
          </ul>
          <Link href="/ai" className="btn" style={{ justifySelf: "start" }}><Sparkles /> Préparer l&apos;architecture avec l&apos;IA</Link>
        </section>
      </div>
    </main>
  );
}

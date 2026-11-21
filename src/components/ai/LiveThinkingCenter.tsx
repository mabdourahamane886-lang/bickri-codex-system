"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { Activity, CheckCircle2, ChevronDown, CircleAlert, CircleDashed, Cpu, ShieldCheck, Wrench } from "lucide-react";

type LiveEvent = {
  tool: string;
  label: string;
  write: boolean;
  status: "ok" | "error" | "refused" | "pending";
};

type Props = { events: LiveEvent[]; mode: string };

const card: CSSProperties = {
  marginTop: 14, padding: 14, border: "1px solid var(--border)",
  borderRadius: 14, background: "var(--surface)", width: "100%",
};
const muted: CSSProperties = { color: "var(--text-muted)", fontSize: 12 };
const row: CSSProperties = { display: "flex", alignItems: "center", gap: 9 };
const badge: CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 8px",
  borderRadius: 999, border: "1px solid var(--border)", fontSize: 11,
};

export function LiveThinkingCenter({ events, mode }: Props) {
  const [expanded, setExpanded] = useState(true);
  const stats = useMemo(() => ({
    done: events.filter((event) => event.status === "ok").length,
    issues: events.filter((event) => event.status === "error" || event.status === "refused").length,
    waiting: events.filter((event) => event.status === "pending").length,
    tools: events.filter((event) => !event.tool.startsWith("phase_")).length,
  }), [events]);
  const recent = events.slice(-7).reverse();
  const modeLabel = mode === "expert" ? "Expert" : mode === "deep" ? "Deep" : mode === "balanced" ? "Balanced" : mode === "fast" ? "Rapid" : "Auto";

  return (
    <section style={card} aria-label="Centre BCX Live Thinking">
      <button type="button" onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
        style={{ ...row, width: "100%", border: 0, padding: 0, background: "transparent", color: "inherit", cursor: "pointer", textAlign: "left" }}>
        <span style={{ ...badge, color: "var(--primary, #3285e8)" }}><Activity size={13} /> LIVE THINKING</span>
        <strong style={{ fontSize: 13, flex: 1 }}>Centre de pilotage BCX</strong>
        <span style={muted}>{modeLabel}</span>
        <ChevronDown size={16} style={{ transform: expanded ? "rotate(180deg)" : "none", transition: "transform .18s" }} />
      </button>

      {expanded && <>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 8, marginTop: 13 }}>
          <div style={{ ...badge, justifyContent: "center" }}><CheckCircle2 size={13} /> {stats.done} terminées</div>
          <div style={{ ...badge, justifyContent: "center" }}><Wrench size={13} /> {stats.tools} activités</div>
          <div style={{ ...badge, justifyContent: "center" }}><CircleAlert size={13} /> {stats.issues} alertes</div>
        </div>
        <div style={{ ...row, justifyContent: "space-between", marginTop: 13 }}>
          <span style={{ ...muted, display: "inline-flex", alignItems: "center", gap: 6 }}><Cpu size={13} /> Événements reçus du moteur</span>
          <span style={muted}>{stats.waiting ? `${stats.waiting} en cours` : "Flux actif"}</span>
        </div>
        <div style={{ height: 4, background: "var(--border)", borderRadius: 99, overflow: "hidden", marginTop: 7 }}>
          <div style={{ height: "100%", width: events.length ? `${Math.round(stats.done / events.length * 100)}%` : "0%", background: "var(--primary, #3285e8)", transition: "width .2s" }} />
        </div>
        {recent.length ? (
          <ol style={{ listStyle: "none", padding: 0, margin: "12px 0 0", display: "grid", gap: 8 }}>
            {recent.map((event, index) => {
              const Icon = event.status === "ok" ? CheckCircle2 : event.status === "pending" ? CircleDashed : event.status === "refused" || event.status === "error" ? CircleAlert : ShieldCheck;
              return <li key={`${event.tool}-${index}`} style={{ ...row, fontSize: 12 }}>
                <Icon size={14} aria-hidden="true" style={{ flex: "0 0 auto", opacity: .8 }} />
                <span style={{ flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>{event.label}</span>
                <span style={muted}>{event.status === "ok" ? "Terminé" : event.status === "pending" ? "En cours" : event.status === "refused" ? "Refusé" : "Échec"}</span>
              </li>;
            })}
          </ol>
        ) : <p style={{ ...muted, margin: "12px 0 0" }}>En attente des premiers événements réels du moteur. Aucune activité n’est simulée.</p>}
        <p style={{ ...muted, margin: "11px 0 0" }}>Les étapes affichées proviennent du flux d’exécution existant. Les validations et actions sensibles restent soumises aux contrôles actuels.</p>
      </>}
    </section>
  );
}

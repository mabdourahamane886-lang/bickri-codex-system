import type { ReactNode } from "react";

export type Tone = "neutral" | "success" | "warning" | "danger" | "info" | "accent" | "gold";

export function Badge({ tone = "neutral", dot = true, children }: { tone?: Tone; dot?: boolean; children: ReactNode }) {
  const cls = ["badge", tone !== "neutral" && `badge-${tone}`, !dot && "no-dot"].filter(Boolean).join(" ");
  return <span className={cls}>{children}</span>;
}

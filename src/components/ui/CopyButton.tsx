"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

export function CopyButton({ value, label = "Copier", className = "btn btn-ghost btn-sm" }: { value: string; label?: string; className?: string }) {
  const [done, setDone] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setDone(true);
      window.setTimeout(() => setDone(false), 1500);
    } catch {
      /* presse-papiers indisponible */
    }
  }
  return (
    <button type="button" className={className} onClick={copy} aria-label={label}>
      {done ? <Check /> : <Copy />}
      <span>{done ? "Copié" : label}</span>
    </button>
  );
}

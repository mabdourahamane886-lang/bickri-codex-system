"use client";

import { useEffect, useState } from "react";

export type PublicConfig = { supabase: boolean; ai: boolean; aiModel: string; aiFallbackModel: string; githubMcp: boolean };

/** Lit l'état de configuration exposé par /api/health (booléens uniquement). */
export function useConfig() {
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    fetch("/api/health", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => active && setConfig(d.config))
      .catch(() => active && setError(true));
    return () => { active = false; };
  }, []);
  return { config, error };
}

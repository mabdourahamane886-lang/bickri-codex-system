"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "@/components/providers/SessionProvider";
import { getClientOrNull } from "@/lib/supabase/client";
import { createCloud, createLocal, deleteCloud, listCloud, loadLocal, saveLocal, type Entry } from "@/lib/registry";

/**
 * Registre BCX : fusionne les identifiants locaux (navigateur) et ceux du
 * registre partagé Supabase quand l'utilisateur est connecté.
 */
export function useRegistry() {
  const { user, loading: sessionLoading } = useSession();
  const [local, setLocal] = useState<Entry[]>([]);
  const [cloud, setCloud] = useState<Entry[]>([]);
  const [ready, setReady] = useState(false);
  const [cloudError, setCloudError] = useState("");

  useEffect(() => { setLocal(loadLocal()); setReady(true); }, []);
  useEffect(() => { if (ready) saveLocal(local); }, [local, ready]);

  const refresh = useCallback(async () => {
    const supabase = getClientOrNull();
    if (!supabase || !user) { setCloud([]); return; }
    try {
      setCloud(await listCloud(supabase));
      setCloudError("");
    } catch (err) {
      setCloudError(err instanceof Error ? err.message : "Erreur de lecture du registre partagé.");
    }
  }, [user]);

  useEffect(() => { if (!sessionLoading) void refresh(); }, [sessionLoading, refresh]);

  const cloudIds = new Set(cloud.map((e) => e.id));
  const entries = [...cloud, ...local.filter((e) => !cloudIds.has(e.id))].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  async function create(input: { name: string; category: string; greek: string; version: string }): Promise<Entry> {
    const supabase = getClientOrNull();
    if (supabase && user) {
      const entry = await createCloud(supabase, user.id, entries, input);
      setCloud((all) => [entry, ...all]);
      return entry;
    }
    const entry = createLocal(entries, input);
    setLocal((all) => [entry, ...all]);
    return entry;
  }

  async function remove(entry: Entry) {
    if (entry.source === "cloud") {
      const supabase = getClientOrNull();
      if (!supabase) throw new Error("Registre partagé indisponible.");
      await deleteCloud(supabase, entry.id);
      setCloud((all) => all.filter((e) => e.id !== entry.id));
    } else {
      setLocal((all) => all.filter((e) => e.id !== entry.id));
    }
  }

  return { entries, ready: ready && !sessionLoading, signedIn: Boolean(user), cloudError, create, remove, refresh };
}

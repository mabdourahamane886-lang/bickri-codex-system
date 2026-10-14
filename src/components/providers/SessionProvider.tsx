"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { getClientOrNull, isSupabaseConfigured } from "@/lib/supabase/client";

type Session = { configured: boolean; loading: boolean; user: User | null; signOut: () => Promise<void> };

const SessionContext = createContext<Session>({ configured: false, loading: true, user: null, signOut: async () => {} });

export function SessionProvider({ children }: { children: ReactNode }) {
  const configured = isSupabaseConfigured();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(configured);

  useEffect(() => {
    const supabase = getClientOrNull();
    if (!supabase) return;
    let active = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      setUser(data.user ?? null);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user ?? null));
    return () => { active = false; sub.subscription.unsubscribe(); };
  }, []);

  const value = useMemo<Session>(() => ({
    configured,
    loading,
    user,
    signOut: async () => {
      await getClientOrNull()?.auth.signOut();
      setUser(null);
    },
  }), [configured, loading, user]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export const useSession = () => useContext(SessionContext);

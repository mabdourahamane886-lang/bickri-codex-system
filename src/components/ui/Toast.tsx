"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { CircleAlert, CircleCheck, Info, X } from "lucide-react";

type Tone = "success" | "error" | "info";
type ToastItem = { id: number; tone: Tone; message: string };
type ToastApi = { notify: (message: string, tone?: Tone) => void };

const ToastContext = createContext<ToastApi>({ notify: () => {} });

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const dismiss = useCallback((id: number) => setItems((all) => all.filter((t) => t.id !== id)), []);
  const notify = useCallback((message: string, tone: Tone = "info") => {
    const id = nextId.current++;
    setItems((all) => [...all.slice(-3), { id, tone, message }]);
    window.setTimeout(() => dismiss(id), tone === "error" ? 7000 : 4000);
  }, [dismiss]);
  const api = useMemo(() => ({ notify }), [notify]);
  const Icon = { success: CircleCheck, error: CircleAlert, info: Info };

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toasts" aria-live="polite" aria-atomic="false">
        {items.map((t) => {
          const I = Icon[t.tone];
          return (
            <div key={t.id} className={`toast toast-${t.tone}`} role={t.tone === "error" ? "alert" : "status"}>
              <I aria-hidden="true" />
              <p>{t.message}</p>
              <button onClick={() => dismiss(t.id)} aria-label="Fermer la notification"><X size={14} /></button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);

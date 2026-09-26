"use client";

import { createContext, ReactNode, useCallback, useContext, useState } from "react";

/** Skeleton rows shown while a list loads (> 300 ms): shape of the content, no spinner. */
export function SkeletonRows({ rows = 5, height = 18 }: { rows?: number; height?: number }) {
  return (
    <div className="stack" aria-busy="true" aria-live="polite" style={{ padding: "var(--space-4)" }}>
      <span className="sr-only">Chargement…</span>
      {Array.from({ length: rows }, (_, i) => (
        <span key={i} className="skeleton" style={{ height, width: `${90 - (i % 3) * 15}%` }} />
      ))}
    </div>
  );
}

/** Empty state: says what is missing and offers the next useful action. */
export function EmptyState({ title, text, action }: { title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="empty-state">
      <h3>{title}</h3>
      {text && <p>{text}</p>}
      {action}
    </div>
  );
}

/** Error message announced to screen readers, with an optional retry. */
export function ErrorAlert({ message, onRetry }: { message: string | null; onRetry?: () => void }) {
  if (!message) return null;
  return (
    <div className="alert alert-error row" role="alert" style={{ justifyContent: "space-between" }}>
      <span>{message}</span>
      {onRetry && (
        <button type="button" className="btn btn-sm btn-outline" onClick={onRetry}>
          Réessayer
        </button>
      )}
    </div>
  );
}

// ---- Toasts (success feedback that does not steal focus) ----

const ToastContext = createContext<(msg: string) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<{ id: number; msg: string }[]>([]);
  const push = useCallback((msg: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, msg }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="toast-region" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="toast">
            {t.msg}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);

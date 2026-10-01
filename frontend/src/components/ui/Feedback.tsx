"use client";

import { ReactNode, createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Info, Trash2, X, XCircle } from "lucide-react";
import Modal from "./Modal";

// ------------------------------------------------------------------ toasts

type ToastKind = "success" | "error" | "warning" | "info";

interface ToastInput {
  title: string;
  message?: string;
  kind?: ToastKind;
  /** ms; 0 keeps it until dismissed. Errors stay longer by default. */
  duration?: number;
  action?: { label: string; onClick: () => void };
}

interface ToastItem extends ToastInput {
  id: number;
  leaving?: boolean;
}

interface ConfirmOptions {
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "warning";
}

interface FeedbackApi {
  toast: (input: ToastInput) => void;
  success: (title: string, message?: string) => void;
  error: (title: string, message?: string) => void;
  /** Resolves true when the user confirms. Use before every destructive action. */
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const FeedbackContext = createContext<FeedbackApi | null>(null);

const ICONS: Record<ToastKind, ReactNode> = {
  success: <CheckCircle2 size={18} />,
  error: <XCircle size={18} />,
  warning: <AlertTriangle size={18} />,
  info: <Info size={18} />,
};

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const [confirmState, setConfirmState] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null);

  const dismiss = useCallback((id: number) => {
    setToasts((list) => list.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), 200);
  }, []);

  const toast = useCallback(
    (input: ToastInput) => {
      const id = nextId.current++;
      const kind = input.kind ?? "info";
      setToasts((list) => [...list.slice(-3), { ...input, kind, id }]);
      const duration = input.duration ?? (kind === "error" ? 7000 : 4000);
      if (duration > 0) setTimeout(() => dismiss(id), duration);
    },
    [dismiss],
  );

  const confirm = useCallback(
    (options: ConfirmOptions) => new Promise<boolean>((resolve) => setConfirmState({ ...options, resolve })),
    [],
  );

  const api = useMemo<FeedbackApi>(
    () => ({
      toast,
      success: (title, message) => toast({ title, message, kind: "success" }),
      error: (title, message) => toast({ title, message, kind: "error" }),
      confirm,
    }),
    [toast, confirm],
  );

  const closeConfirm = (value: boolean) => {
    confirmState?.resolve(value);
    setConfirmState(null);
  };
  const tone = confirmState?.tone ?? "danger";

  return (
    <FeedbackContext.Provider value={api}>
      {children}
      <div className="toast-viewport" role="region" aria-label="Notifications" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind}${t.leaving ? " is-leaving" : ""}`} role={t.kind === "error" ? "alert" : "status"}>
            <span className="toast-icon">{ICONS[t.kind ?? "info"]}</span>
            <div className="toast-body">
              <div className="toast-title">{t.title}</div>
              {t.message && <div className="toast-message">{t.message}</div>}
              {t.action && (
                <button
                  type="button"
                  className="toast-action"
                  onClick={() => {
                    t.action!.onClick();
                    dismiss(t.id);
                  }}
                >
                  {t.action.label}
                </button>
              )}
            </div>
            <button type="button" className="toast-close" onClick={() => dismiss(t.id)} aria-label="Fermer la notification">
              <X size={16} />
            </button>
          </div>
        ))}
      </div>
      <Modal
        open={!!confirmState}
        onClose={() => closeConfirm(false)}
        size="sm"
        title={confirmState?.title ?? ""}
        footer={
          <>
            <button type="button" className="btn btn-outline" onClick={() => closeConfirm(false)}>
              {confirmState?.cancelLabel ?? "Annuler"}
            </button>
            <button type="button" className={`btn ${tone === "danger" ? "btn-danger" : "btn-primary"}`} onClick={() => closeConfirm(true)} data-autofocus>
              {tone === "danger" && <Trash2 size={16} />}
              {confirmState?.confirmLabel ?? "Confirmer"}
            </button>
          </>
        }
      >
        <div className={`confirm-icon${tone === "danger" ? " danger" : ""}`} aria-hidden="true">
          <AlertTriangle size={22} />
        </div>
        {confirmState?.message && <div style={{ color: "var(--text-secondary)", fontSize: 14 }}>{confirmState.message}</div>}
      </Modal>
    </FeedbackContext.Provider>
  );
}

export function useFeedback(): FeedbackApi {
  const ctx = useContext(FeedbackContext);
  if (!ctx) throw new Error("useFeedback must be used inside <FeedbackProvider>");
  return ctx;
}

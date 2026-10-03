"use client";

import { ReactNode, useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const EXIT_MS = 120;

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  children: ReactNode;
  footer?: ReactNode;
  /** Prevent closing on backdrop click / Escape while a request is running. */
  busy?: boolean;
}

/**
 * Accessible dialog: portal, focus trapped and restored, Escape and backdrop close, body scroll lock,
 * enter/exit animation (bottom sheet on phones).
 */
export default function Modal({ open, onClose, title, description, size = "md", children, footer, busy }: ModalProps) {
  const [mounted, setMounted] = useState(open);
  const [closing, setClosing] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    if (open) {
      setMounted(true);
      setClosing(false);
    } else if (mounted) {
      setClosing(true);
      const t = setTimeout(() => setMounted(false), EXIT_MS);
      return () => clearTimeout(t);
    }
  }, [open, mounted]);

  // Parents usually pass an inline onClose, so it changes on every keystroke in the form.
  // Read it through a ref: the focus effect below must only run when `open` changes,
  // otherwise each re-render moves focus away from the field being typed in.
  const closeRef = useRef({ onClose, busy });
  closeRef.current = { onClose, busy };
  const requestClose = useCallback(() => {
    if (!closeRef.current.busy) closeRef.current.onClose();
  }, []);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    // Focus the first field (or the panel) once the panel is painted.
    const raf = requestAnimationFrame(() => {
      const panel = panelRef.current;
      const first = panel?.querySelector<HTMLElement>("[data-autofocus]") ?? panel?.querySelector<HTMLElement>(".modal-body " + FOCUSABLE);
      (first ?? panel)?.focus();
    });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        requestClose();
      } else if (e.key === "Tab" && panelRef.current) {
        const items = [...panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
        if (!items.length) return;
        const firstEl = items[0];
        const lastEl = items[items.length - 1];
        if (e.shiftKey && document.activeElement === firstEl) {
          e.preventDefault();
          lastEl.focus();
        } else if (!e.shiftKey && document.activeElement === lastEl) {
          e.preventDefault();
          firstEl.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      previouslyFocused?.focus?.();
    };
  }, [open, requestClose]);

  if (!mounted || typeof document === "undefined") return null;

  return createPortal(
    <div
      className={`modal-backdrop${closing ? " is-closing" : ""}`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) requestClose();
      }}
    >
      <div
        ref={panelRef}
        className={`modal${size === "md" ? "" : ` modal-${size}`}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
      >
        <div className="modal-header">
          <div>
            <h2 id={titleId} className="modal-title">
              {title}
            </h2>
            {description && (
              <p id={descId} className="modal-description">
                {description}
              </p>
            )}
          </div>
          <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={requestClose} aria-label="Fermer" disabled={busy}>
            <X size={18} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

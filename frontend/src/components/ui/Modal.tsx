"use client";

import { CSSProperties, ReactNode, useEffect, useId, useRef } from "react";

/**
 * Accessible dialog: role="dialog" + aria-modal, labelled by its title, focus moved inside and
 * trapped, Escape closes, focus returns to the element that opened it. Bottom sheet on mobile.
 */
export default function Modal({
  title,
  onClose,
  children,
  boxStyle,
}: {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  boxStyle?: CSSProperties;
}) {
  const titleId = useId();
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const box = boxRef.current;
    const focusables = () =>
      Array.from(
        box?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );
    (focusables()[1] ?? focusables()[0] ?? box)?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      } else if (e.key === "Tab") {
        const items = focusables();
        if (items.length === 0) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      opener?.focus?.();
    };
    // onClose identity may change on each render; the effect must only run on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={boxRef} className="modal-box" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} style={boxStyle}>
        <div className="modal-header">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Fermer">
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

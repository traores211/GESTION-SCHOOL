"use client";

import { Moon, Sun } from "lucide-react";

/** The School ERP mark: a receipt stub read like the Ivorian flag: orange counterfoil, white paper, green lines. */
export function BrandMark({ size = 28 }: { size?: number }) {
  return (
    <svg className="brand-mark" width={size} height={size} viewBox="0 0 28 28" aria-hidden="true">
      <rect x="2.75" y="5.75" width="22.5" height="16.5" rx="2" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <rect className="brand-mark-stub" x="3.5" y="6.5" width="6.5" height="15" rx="1" />
      <path d="M12 7.5v13" stroke="currentColor" strokeWidth="1.25" strokeDasharray="1.6 1.9" />
      <path className="brand-mark-lines" d="M15 11.5h7M15 16.5h4.5" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

/** The Ivorian tricolour as a thin band across the top of a page (orange, white, green). */
export function FlagBand({ pinned = false }: { pinned?: boolean }) {
  return (
    <div className={`flag-band${pinned ? " is-pinned" : ""}`} role="presentation">
      <span />
      <span />
      <span />
    </div>
  );
}

function currentTheme(): "light" | "dark" {
  const set = document.documentElement.dataset.theme;
  if (set === "light" || set === "dark") return set;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** Switches between cream paper and carbon paper; the choice is remembered on this device. */
export function ThemeToggle({ className = "btn btn-ghost btn-icon" }: { className?: string }) {
  const toggle = () => {
    const next = currentTheme() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("theme", next);
    } catch {
      /* private mode: the toggle still works for this visit */
    }
    window.dispatchEvent(new Event("themechange"));
  };
  return (
    <button type="button" className={`${className} theme-toggle`} onClick={toggle} aria-label="Changer de thème (clair / sombre)" title="Thème clair / sombre">
      <Moon size={18} className="icon-light" aria-hidden="true" />
      <Sun size={18} className="icon-dark" aria-hidden="true" />
    </button>
  );
}

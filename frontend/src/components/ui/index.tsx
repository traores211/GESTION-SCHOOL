"use client";

import { ReactNode, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Inbox, Search, X, AlertOctagon } from "lucide-react";
import type { SortState } from "../../lib/useTable";

export { default as Modal } from "./Modal";
export { FeedbackProvider, useFeedback } from "./Feedback";

// ------------------------------------------------------------------ page header & breadcrumbs

export interface Crumb {
  label: string;
  href?: string;
}

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Fil d'Ariane" className="breadcrumbs">
      {items.map((item, i) => (
        <span key={i}>
          {i > 0 && <ChevronRight size={13} aria-hidden="true" />}
          {item.href && i < items.length - 1 ? <Link href={item.href}>{item.label}</Link> : <span aria-current="page">{item.label}</span>}
        </span>
      ))}
    </nav>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  breadcrumbs,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  breadcrumbs?: Crumb[];
}) {
  return (
    <div className="page-header">
      <div style={{ minWidth: 0 }}>
        {breadcrumbs && <Breadcrumbs items={breadcrumbs} />}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="page-header-actions">{actions}</div>}
    </div>
  );
}

// ------------------------------------------------------------------ states

export function EmptyState({
  icon,
  title,
  children,
  action,
  tone = "empty",
}: {
  icon?: ReactNode;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  tone?: "empty" | "error";
}) {
  return (
    <div className={`state${tone === "error" ? " state-error" : ""}`} role={tone === "error" ? "alert" : undefined}>
      <span className="state-icon" aria-hidden="true">
        {icon ?? (tone === "error" ? <AlertOctagon size={22} /> : <Inbox size={22} />)}
      </span>
      <div className="state-title">{title}</div>
      {children && <div className="state-text">{children}</div>}
      {action && <div className="state-action">{action}</div>}
    </div>
  );
}

/** Placeholder rows shaped like the table that will appear, so the layout does not jump. */
export function TableSkeleton({ rows = 6, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <div aria-busy="true" aria-label="Chargement" style={{ padding: "6px 0" }}>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} style={{ display: "grid", gridTemplateColumns: `repeat(${columns}, 1fr)`, gap: 16, padding: "14px 16px", borderBottom: "1px solid var(--border)" }}>
          {Array.from({ length: columns }).map((__, c) => (
            <div key={c} className="skeleton" style={{ height: 12, width: `${55 + ((r * 7 + c * 13) % 40)}%` }} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function CardSkeleton({ height = 120 }: { height?: number }) {
  return (
    <div className="card" aria-hidden="true">
      <div className="skeleton" style={{ height: 14, width: "40%", marginBottom: 14 }} />
      <div className="skeleton" style={{ height }} />
    </div>
  );
}

// ------------------------------------------------------------------ search, sort, pagination

/** Search box that reports its value after the user stops typing (default 250 ms). */
export function SearchInput({
  value,
  onChange,
  placeholder = "Rechercher…",
  delay = 250,
  label = "Rechercher",
  style,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  delay?: number;
  label?: string;
  style?: React.CSSProperties;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  useEffect(() => {
    if (draft === value) return;
    const t = setTimeout(() => onChange(draft), delay);
    return () => clearTimeout(t);
  }, [draft, value, delay, onChange]);
  return (
    <div className="input-icon search-input" style={style}>
      <Search size={16} aria-hidden="true" />
      <input className="input" type="search" aria-label={label} placeholder={placeholder} value={draft} onChange={(e) => setDraft(e.target.value)} />
      {draft && (
        <button
          type="button"
          className="input-clear"
          aria-label="Effacer la recherche"
          onClick={() => {
            setDraft("");
            onChange("");
          }}
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}

export function SortHeader<K extends string>({
  label,
  column,
  sort,
  onSort,
  className,
}: {
  label: string;
  column: K;
  sort: SortState<K>;
  onSort: (column: K) => void;
  className?: string;
}) {
  const active = sort.key === column;
  const Icon = !active ? ArrowUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th className={className} aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
      <button type="button" className="th-sort" onClick={() => onSort(column)}>
        {label}
        <Icon size={12} aria-hidden="true" />
      </button>
    </th>
  );
}

export function Pagination({
  page,
  pageCount,
  total,
  pageSize,
  onPage,
  unit = "résultat",
}: {
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  onPage: (page: number) => void;
  unit?: string;
}) {
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const pages = Array.from({ length: pageCount }, (_, i) => i + 1).filter((p) => p === 1 || p === pageCount || Math.abs(p - page) <= 1);
  return (
    <nav className="pagination" aria-label="Pagination">
      <span className="tabular">
        {from}–{to} sur {total} {unit}
        {total > 1 ? "s" : ""}
      </span>
      {pageCount > 1 && (
        <div className="pagination-pages">
          <button type="button" className="pagination-page" onClick={() => onPage(page - 1)} disabled={page <= 1} aria-label="Page précédente">
            <ChevronLeft size={16} />
          </button>
          {pages.map((p, i) => (
            <span key={p} style={{ display: "contents" }}>
              {i > 0 && p - pages[i - 1] > 1 && <span aria-hidden="true">…</span>}
              <button type="button" className="pagination-page" aria-current={p === page ? "page" : undefined} onClick={() => onPage(p)}>
                {p}
              </button>
            </span>
          ))}
          <button type="button" className="pagination-page" onClick={() => onPage(page + 1)} disabled={page >= pageCount} aria-label="Page suivante">
            <ChevronRight size={16} />
          </button>
        </div>
      )}
    </nav>
  );
}

// ------------------------------------------------------------------ small pieces

export function Avatar({ name, size }: { name: string; size?: "sm" }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
  return (
    <span className={`avatar${size ? ` avatar-${size}` : ""}`} aria-hidden="true">
      {initials || "?"}
    </span>
  );
}

export function FormError({ message }: { message: string | null | undefined }) {
  if (!message) return null;
  return (
    <div className="form-error" role="alert">
      <AlertOctagon size={16} style={{ flexShrink: 0, marginTop: 1 }} />
      <span>{message}</span>
    </div>
  );
}

/** Staggered fade-in for a group of blocks (cards, KPIs). */
export function Stagger({ children, className = "", style }: { children: ReactNode[]; className?: string; style?: React.CSSProperties }) {
  return (
    <div className={`stagger ${className}`} style={style}>
      {children.map((child, i) => (
        <div key={i} style={{ ["--i" as string]: i, display: "contents" }}>
          {child}
        </div>
      ))}
    </div>
  );
}

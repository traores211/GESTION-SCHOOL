"use client";

import { ReactNode } from "react";

type Accent = "green" | "orange" | "danger" | "warning";

const ACCENT_CLASS: Record<Accent, string> = {
  green: "",
  orange: " accent-orange",
  danger: " accent-danger",
  warning: " accent-warning",
};

/**
 * Variation chip. `value` is the change; `unit` is "%" (relative) or "pts" (percentage points).
 * Direction is carried by the arrow and the sign, not by color alone.
 */
export function Delta({ value, unit, label }: { value: number | null; unit: "%" | "pts"; label: string }) {
  if (value === null) {
    return <span className="delta delta-flat" title="Pas de base de comparaison sur la période précédente">— sans comparaison</span>;
  }
  const direction = value > 0 ? "up" : value < 0 ? "down" : "flat";
  const arrow = direction === "up" ? "▲" : direction === "down" ? "▼" : "■";
  const sign = value > 0 ? "+" : "";
  const formatted = `${sign}${value.toLocaleString("fr-FR", { maximumFractionDigits: 1 })}${unit === "%" ? " %" : " pts"}`;
  return (
    <span className={`delta delta-${direction}`} title={label}>
      <span aria-hidden="true">{arrow}</span>
      {formatted}
      <span className="visually-hidden"> {label}</span>
    </span>
  );
}

export function KpiCard({
  label,
  icon,
  value,
  unit,
  accent = "green",
  delta,
  sub,
  meter,
}: {
  label: string;
  icon: string;
  value: ReactNode;
  unit?: string;
  accent?: Accent;
  delta?: ReactNode;
  sub?: ReactNode;
  meter?: number | null;
}) {
  return (
    <div className={`kpi-card${ACCENT_CLASS[accent]}`}>
      <div className="kpi-head">
        <div className="kpi-label">{label}</div>
        <span className="kpi-icon" aria-hidden="true">
          {icon}
        </span>
      </div>
      <div className="kpi-value">
        {value}
        {unit && <span className="kpi-value-unit">{unit}</span>}
      </div>
      {meter !== undefined && meter !== null && (
        <div className="kpi-meter" role="presentation">
          <span style={{ width: `${Math.min(Math.max(meter, 0), 100)}%` }} />
        </div>
      )}
      {(delta || sub) && (
        <div className="kpi-sub" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
          {delta}
          {sub && <span>{sub}</span>}
        </div>
      )}
    </div>
  );
}

export function KpiSkeleton() {
  return (
    <div className="kpi-card" aria-hidden="true">
      <div className="skeleton" style={{ height: 12, width: "55%", marginBottom: 14 }} />
      <div className="skeleton" style={{ height: 28, width: "70%", marginBottom: 12 }} />
      <div className="skeleton" style={{ height: 12, width: "85%" }} />
    </div>
  );
}

export function StateMessage({
  icon,
  title,
  children,
  variant = "empty",
  action,
}: {
  icon: string;
  title: string;
  children?: ReactNode;
  variant?: "empty" | "error";
  action?: ReactNode;
}) {
  return (
    <div className={`state${variant === "error" ? " state-error" : ""}`} role={variant === "error" ? "alert" : undefined}>
      <span className="state-icon" aria-hidden="true">
        {icon}
      </span>
      <div className="state-title">{title}</div>
      {children && <div>{children}</div>}
      {action && <div style={{ marginTop: 8 }}>{action}</div>}
    </div>
  );
}

export function ChartCard({
  title,
  subtitle,
  span = 6,
  height = 260,
  loading,
  empty,
  emptyText,
  aside,
  footer,
  children,
}: {
  title: string;
  subtitle?: string;
  span?: 4 | 5 | 6 | 7 | 8 | 12;
  height?: number;
  loading?: boolean;
  empty?: boolean;
  emptyText?: string;
  aside?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={`chart-card span-${span}`} aria-busy={loading || undefined}>
      <div className="chart-card-head">
        <div>
          <h3 className="chart-title">{title}</h3>
          {subtitle && <p className="chart-sub">{subtitle}</p>}
        </div>
        {aside}
      </div>
      <div className="chart-body" style={{ minHeight: height }}>
        {loading ? (
          <div className="skeleton" style={{ height }} />
        ) : empty ? (
          <StateMessage icon="∅" title="Aucune donnée">
            {emptyText || "Aucune donnée pour les filtres sélectionnés."}
          </StateMessage>
        ) : (
          children
        )}
      </div>
      {footer && !loading && !empty && <div className="chart-foot">{footer}</div>}
    </section>
  );
}

export function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <section className="section">
      <div className="section-head">
        <h2 className="section-title">{title}</h2>
        {subtitle && <span className="section-sub">{subtitle}</span>}
      </div>
      <div className="dash-grid">{children}</div>
    </section>
  );
}

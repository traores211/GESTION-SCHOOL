"use client";

import { ReactNode, useEffect, useRef, useState } from "react";
import { ArrowDownRight, ArrowUpRight, Inbox, Minus } from "lucide-react";

type Accent = "green" | "orange" | "danger" | "warning";
export type Tone = "blue" | "green" | "orange" | "red" | "ochre";

/**
 * Animates a formatted French figure ("442", "92,3 %", "5,1 M") from its previous value to the new one.
 * Text that does not start with a number is shown as is. Reduced motion shows the final value at once.
 */
export function CountUp({ text, duration = 850 }: { text: string; duration?: number }) {
  const match = /^(-?[\d\s\u202f\u00a0]+(?:,\d+)?)(.*)$/.exec(text);
  const target = match ? Number(match[1].replace(/[\s\u202f\u00a0]/g, "").replace(",", ".")) : NaN;
  const decimals = match && match[1].includes(",") ? match[1].split(",")[1].length : 0;
  // A space caught at the end of the number ("3 M") belongs to the unit.
  const suffix = match ? (/[\s\u202f\u00a0]+$/.exec(match[1])?.[0] ?? "") + match[2] : "";
  const [shown, setShown] = useState(Number.isFinite(target) ? 0 : target);
  const from = useRef(0);

  useEffect(() => {
    if (!Number.isFinite(target)) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(target);
      from.current = target;
      return;
    }
    const start = performance.now();
    const origin = from.current;
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(origin + (target - origin) * eased);
      if (t < 1) frame = requestAnimationFrame(tick);
      else from.current = target;
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, duration]);

  if (!match || !Number.isFinite(target)) return <>{text}</>;
  return (
    <>
      <span aria-hidden="true">
        {shown.toLocaleString("fr-FR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}
        {suffix}
      </span>
      <span className="visually-hidden">{text}</span>
    </>
  );
}

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
  const Arrow = direction === "up" ? ArrowUpRight : direction === "down" ? ArrowDownRight : Minus;
  const sign = value > 0 ? "+" : "";
  const formatted = `${sign}${value.toLocaleString("fr-FR", { maximumFractionDigits: 1 })}${unit === "%" ? " %" : " pts"}`;
  return (
    <span className={`delta delta-${direction}`} title={label}>
      <Arrow size={13} aria-hidden="true" />
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
  tone = "blue",
  delta,
  sub,
  meter,
}: {
  label: string;
  icon: ReactNode;
  value: ReactNode;
  unit?: string;
  accent?: Accent;
  tone?: Tone;
  delta?: ReactNode;
  sub?: ReactNode;
  meter?: number | null;
}) {
  return (
    <div className={`kpi-card tone-${tone}${ACCENT_CLASS[accent]}`}>
      <div className="kpi-head">
        <div className="kpi-label">{label}</div>
        <span className="kpi-icon" aria-hidden="true">
          {icon}
        </span>
      </div>
      <div className="kpi-value">
        {typeof value === "string" ? <CountUp text={value} /> : value}
        {unit && <span className="kpi-value-unit">{unit}</span>}
      </div>
      {meter !== undefined && meter !== null && (
        <div className="kpi-meter" role="presentation">
          <span style={{ width: `${Math.min(Math.max(meter, 0), 100)}%` }} />
        </div>
      )}
      {(delta || sub) && (
        <div className="kpi-sub">
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
  icon: ReactNode;
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
      {action && <div className="state-action">{action}</div>}
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
          <StateMessage icon={<Inbox size={20} />} title="Aucune donnée">
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

/**
 * Grid heatmap: one row per category, one column per bucket, cell darkness = value.
 * Sequential single-hue ramp (stamp orange), value printed in each cell, scale legend below.
 */
export function Heatmap({
  columns,
  rows,
  format,
  caption,
}: {
  columns: string[];
  rows: { label: string; values: (number | null)[] }[];
  format: (v: number) => string;
  caption: string;
}) {
  const all = rows.flatMap((r) => r.values).filter((v): v is number => v !== null);
  const min = all.length ? Math.min(...all) : 0;
  const max = all.length ? Math.max(...all) : 1;
  const strength = (v: number) => (max === min ? 0.5 : (v - min) / (max - min));
  return (
    <div className="heatmap-wrap">
      <table className="heatmap">
        <caption className="visually-hidden">{caption}</caption>
        <thead>
          <tr>
            <th scope="col">
              <span className="visually-hidden">Niveau</span>
            </th>
            {columns.map((c) => (
              <th key={c} scope="col">
                {c.slice(0, 3)}
                <span className="visually-hidden">{c.slice(3)}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label}>
              <th scope="row">{r.label}</th>
              {r.values.map((v, i) => {
                const s = v === null ? 0 : strength(v);
                return (
                  <td
                    key={i}
                    style={v === null ? undefined : { background: `color-mix(in srgb, var(--series-1) ${Math.round(8 + s * 64)}%, var(--surface))` }}
                    title={v === null ? "Pas d'appel" : `${r.label}, ${columns[i]} : ${format(v)}`}
                  >
                    {v === null ? "—" : format(v)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="heatmap-scale" aria-hidden="true">
        <span>{format(min)}</span>
        <span className="heatmap-ramp" />
        <span>{format(max)}</span>
      </div>
    </div>
  );
}
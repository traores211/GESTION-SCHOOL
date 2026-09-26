"use client";

import { formatFCFA } from "../lib/api";

/**
 * Renders a validated dashboard spec using ONLY design-system blocks. The spec is data; no
 * markup or code from the AI is ever injected.
 */
export interface ViewComponent {
  type: "kpi" | "table" | "chart";
  source: string;
  title?: string;
  chart?: "bar" | "donut" | "line";
  data?: any;
  error?: string;
}

const MONEY_SOURCES = ["fees.unpaid", "fees.overdue", "payroll.summary"];

function Kpi({ c }: { c: ViewComponent }) {
  const d = c.data ?? {};
  const value = d.value ?? d.rate ?? d.totalInvoiced ?? d.count ?? 0;
  const display = MONEY_SOURCES.includes(c.source) || c.source === "fees.stats" ? formatFCFA(Number(d.value ?? d.outstanding ?? 0)) : c.source === "attendance.today" ? `${d.rate ?? 0} %` : String(value);
  return (
    <div className="kpi-card">
      <div className="kpi-label">{c.title ?? c.source}</div>
      <div className="kpi-value">{display}</div>
      {d.count !== undefined && <div className="kpi-sub">{d.count} élément(s)</div>}
    </div>
  );
}

function rowsOf(c: ViewComponent): { label: string; value: number }[] {
  const d = c.data ?? {};
  if (Array.isArray(d.rows) && d.rows[0]?.label !== undefined) return d.rows;
  if (c.source === "fees.stats") return [
    { label: "Encaissé", value: d.totalCollected ?? 0 },
    { label: "Impayés", value: d.outstanding ?? 0 },
  ];
  if (c.source === "attendance.today") return [
    { label: "Présents", value: d.present ?? 0 },
    { label: "Absents", value: d.absent ?? 0 },
    { label: "Retards", value: d.late ?? 0 },
  ];
  if (Array.isArray(d.rows)) return d.rows.slice(0, 12).map((r: any) => ({ label: r.student ? `${r.student.lastName} ${r.student.firstName}` : r.name ?? r.label ?? "—", value: Number(r.remaining ?? r.average ?? r.value ?? 0) }));
  return [];
}

function Chart({ c }: { c: ViewComponent }) {
  const rows = rowsOf(c);
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="card">
      <div className="card-title">{c.title ?? c.source}</div>
      {rows.length === 0 ? (
        <p className="muted">Aucune donnée.</p>
      ) : (
        <div className="bars" role="list">
          {rows.map((r) => (
            <div key={r.label} className="bar-row" role="listitem">
              <span>{r.label}</span>
              <span className="bar-track" aria-hidden="true">
                <span className="bar-fill" style={{ display: "block", width: `${(r.value / max) * 100}%` }} />
              </span>
              <span style={{ fontVariantNumeric: "tabular-nums" }}>{new Intl.NumberFormat("fr-FR").format(Math.round(r.value))}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Table({ c }: { c: ViewComponent }) {
  const rows: any[] = c.data?.rows ?? [];
  const cols = rows[0] ? Object.keys(rows[0]).filter((k) => typeof rows[0][k] !== "object" && k !== "id") : [];
  return (
    <div className="card" style={{ padding: 0 }}>
      <div className="card-title" style={{ padding: "16px 20px 0" }}>
        {c.title ?? c.source}
      </div>
      {rows.length === 0 ? (
        <p className="muted" style={{ padding: 20 }}>
          Aucune ligne.
        </p>
      ) : (
        <div className="table-wrap responsive" style={{ border: 0, boxShadow: "none" }}>
          <table>
            <thead>
              <tr>
                {cols.map((k) => (
                  <th key={k}>{k}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 50).map((r, i) => (
                <tr key={r.id ?? i}>
                  {cols.map((k) => (
                    <td key={k} data-label={k}>
                      {String(r[k] ?? "")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function ViewRenderer({ components }: { components: ViewComponent[] }) {
  const kpis = components.filter((c) => c.type === "kpi");
  const others = components.filter((c) => c.type !== "kpi");
  return (
    <div>
      {kpis.length > 0 && (
        <div className="kpi-grid">
          {kpis.map((c, i) => (c.error ? <div key={i} className="kpi-card muted">{c.error}</div> : <Kpi key={i} c={c} />))}
        </div>
      )}
      <div className="stack">
        {others.map((c, i) => (c.error ? <div key={i} className="alert alert-warning">{c.error}</div> : c.type === "chart" ? <Chart key={i} c={c} /> : <Table key={i} c={c} />))}
      </div>
    </div>
  );
}

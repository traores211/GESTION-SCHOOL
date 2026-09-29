"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Shell from "../../components/Shell";
import { api, ApiError } from "../../lib/api";
import {
  ADMISSION_STATUS_LABELS,
  Analytics,
  DashboardFilterOptions,
  DashboardQuery,
  INVOICE_STATUS,
  INVOICE_STATUS_ORDER,
  PAYMENT_METHOD_LABELS,
  PERIOD_OPTIONS,
  Period,
  formatCompact,
  formatDate,
  formatFCFA,
  formatMonth,
  formatNumber,
  formatPercent,
} from "../../lib/dashboard";
import { ChartCard, Delta, KpiCard, KpiSkeleton, Section, StateMessage } from "../../components/dashboard/ui";
import dynamic from "next/dynamic";

// Recharts is the heaviest dependency of the app: charts load after the KPIs are on screen.
const chartLoading = () => <div className="skeleton" style={{ height: 240 }} />;
const ColumnChart = dynamic(() => import("../../components/dashboard/charts").then((m) => m.ColumnChart), { ssr: false, loading: chartLoading });
const RankBars = dynamic(() => import("../../components/dashboard/charts").then((m) => m.RankBars), { ssr: false, loading: chartLoading });
const TrendLine = dynamic(() => import("../../components/dashboard/charts").then((m) => m.TrendLine), { ssr: false, loading: chartLoading });
import TodayPanel from "../../components/dashboard/TodayPanel";
import { AlarmClock, ClipboardCheck, FileSignature, GraduationCap, RefreshCw, TrendingUp, Wallet } from "lucide-react";

const DEFAULT_QUERY: DashboardQuery = { period: "30d", academicYearId: "", classId: "", termId: "" };

function errorMessage(err: unknown) {
  return err instanceof ApiError ? err.message : "Impossible de joindre le serveur.";
}

export default function DashboardPage() {
  const [options, setOptions] = useState<DashboardFilterOptions | null>(null);
  const [query, setQuery] = useState<DashboardQuery>(DEFAULT_QUERY);
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  useEffect(() => {
    api
      .get<DashboardFilterOptions>("/dashboard/filters")
      .then(setOptions)
      .catch(() => setOptions({ academicYears: [], classes: [], terms: [] }));
  }, []);

  const load = useCallback(() => {
    const params = new URLSearchParams({ period: query.period });
    if (query.academicYearId) params.set("academicYearId", query.academicYearId);
    if (query.classId) params.set("classId", query.classId);
    if (query.termId) params.set("termId", query.termId);

    setLoading(true);
    setError(null);
    api
      .get<Analytics>(`/dashboard/analytics?${params.toString()}`)
      .then((res) => {
        setData(res);
        setUpdatedAt(new Date());
      })
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setLoading(false));
  }, [query]);

  useEffect(() => {
    load();
  }, [load]);

  const yearId = query.academicYearId || data?.filters.academicYear.id || "";
  const classOptions = useMemo(
    () => (options?.classes || []).filter((c) => !yearId || c.academicYearId === yearId),
    [options, yearId],
  );
  const termOptions = useMemo(
    () => (options?.terms || []).filter((t) => !yearId || t.academicYearId === yearId),
    [options, yearId],
  );

  const update = (patch: Partial<DashboardQuery>) => setQuery((q) => ({ ...q, ...patch }));
  const isFiltered =
    query.period !== DEFAULT_QUERY.period || !!query.academicYearId || !!query.classId || !!query.termId;

  const firstLoad = loading && !data;
  const periodLong = PERIOD_OPTIONS.find((p) => p.value === (data?.filters.period || query.period))?.long;
  const selectedClass = classOptions.find((c) => c.id === query.classId);

  return (
    <Shell title="Tableau de bord">
      <div className="page-header">
        <div>
          <h1>Vue d&apos;ensemble</h1>
          <p>
            {data
              ? `Année ${data.filters.academicYear.name} · ${periodLong} (du ${formatDate(data.filters.from, {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                })} au ${formatDate(data.filters.to, { day: "2-digit", month: "short", year: "numeric" })})${
                  selectedClass ? ` · ${selectedClass.name}` : ""
                }`
              : "Indicateurs clés de l'établissement"}
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {updatedAt && (
            <span className="muted" style={{ fontSize: 12 }}>
              Mis à jour à {updatedAt.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
          <button className="btn btn-outline btn-sm" onClick={load} disabled={loading}>
            <RefreshCw size={14} className={loading ? "spin" : undefined} /> {loading ? "Actualisation…" : "Actualiser"}
          </button>
        </div>
      </div>

      <TodayPanel />

      {/* ---------- Filters ---------- */}
      <div className="filter-bar" role="group" aria-label="Filtres du tableau de bord">
        <div className="filter-item">
          <label id="period-label">Période</label>
          <div className="segmented" role="group" aria-labelledby="period-label">
            {PERIOD_OPTIONS.map((p) => (
              <button
                key={p.value}
                type="button"
                aria-pressed={query.period === p.value}
                title={p.long}
                onClick={() => update({ period: p.value as Period })}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <div className="filter-item">
          <label htmlFor="f-year">Année scolaire</label>
          <select
            id="f-year"
            className="input"
            value={query.academicYearId}
            onChange={(e) => update({ academicYearId: e.target.value, classId: "", termId: "" })}
          >
            <option value="">Année en cours</option>
            {options?.academicYears.map((y) => (
              <option key={y.id} value={y.id}>
                {y.name}
                {y.isCurrent ? " (en cours)" : ""}
              </option>
            ))}
          </select>
        </div>
        <div className="filter-item">
          <label htmlFor="f-class">Classe</label>
          <select id="f-class" className="input" value={query.classId} onChange={(e) => update({ classId: e.target.value })}>
            <option value="">Toutes les classes</option>
            {classOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="filter-item">
          <label htmlFor="f-term">Trimestre (notes)</label>
          <select id="f-term" className="input" value={query.termId} onChange={(e) => update({ termId: e.target.value })}>
            <option value="">Dernier trimestre noté</option>
            {termOptions.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        <div className="filter-actions">
          {isFiltered && (
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setQuery(DEFAULT_QUERY)}>
              Réinitialiser
            </button>
          )}
        </div>
      </div>

      {error && !data && (
        <div className="card">
          <StateMessage
            variant="error"
            icon="!"
            title="Le tableau de bord n'a pas pu être chargé"
            action={
              <button className="btn btn-primary btn-sm" onClick={load}>
                Réessayer
              </button>
            }
          >
            {error}
          </StateMessage>
        </div>
      )}

      {error && data && (
        <div className="alert alert-danger" role="alert" style={{ marginBottom: 16 }}>
          <span className="alert-icon" aria-hidden="true">
            ⚠
          </span>
          <span>
            Actualisation impossible : {error}. Les données affichées sont celles du dernier chargement.{" "}
            <button className="btn btn-outline btn-sm" onClick={load} style={{ marginLeft: 8 }}>
              Réessayer
            </button>
          </span>
        </div>
      )}

      {firstLoad && (
        <div className="kpi-grid kpi-grid-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <KpiSkeleton key={i} />
          ))}
        </div>
      )}

      {(data || firstLoad) && !(error && !data) && (
        <div style={{ opacity: loading && data ? 0.6 : 1, transition: "opacity 0.15s" }}>
          {data && <Alerts alerts={data.alerts} />}
          {data && <Kpis data={data} />}
          <Sections data={data} loading={firstLoad} />
        </div>
      )}
    </Shell>
  );
}

function Alerts({ alerts }: { alerts: Analytics["alerts"] }) {
  if (alerts.length === 0) return null;
  return (
    <div className="alert-list" aria-label="Alertes">
      {alerts.map((a, i) => (
        <div key={i} className={`alert alert-${a.level}`}>
          <span className="alert-icon" aria-hidden="true">
            {a.level === "danger" ? "⛔" : "⚠"}
          </span>
          <span>
            <span className="visually-hidden">{a.level === "danger" ? "Critique : " : "Attention : "}</span>
            {a.message}
          </span>
        </div>
      ))}
    </div>
  );
}

function Kpis({ data }: { data: Analytics }) {
  const { kpis, thresholds } = data;
  const comparison = `par rapport à la période précédente (${formatDate(data.filters.previousFrom)} – ${formatDate(
    data.filters.previousTo,
  )})`;
  const attendanceLow = kpis.attendanceRate.value !== null && kpis.attendanceRate.value < thresholds.attendanceRateWarning;
  const recoveryLow = kpis.recoveryRate !== null && kpis.recoveryRate < thresholds.recoveryRateWarning;

  return (
    <div className="kpi-grid kpi-grid-6">
      <KpiCard
        label="Élèves inscrits"
        icon={<GraduationCap size={16} />}
        value={formatNumber(kpis.enrolledStudents)}
        sub={`${data.classFill.length} classe(s) · ${data.filters.academicYear.name}`}
      />
      <KpiCard
        label="Taux de présence"
        icon={<ClipboardCheck size={16} />}
        accent={attendanceLow ? "warning" : "green"}
        value={formatPercent(kpis.attendanceRate.value)}
        delta={kpis.attendanceRate.value !== null ? <Delta value={kpis.attendanceRate.delta} unit="pts" label={comparison} /> : undefined}
        sub={
          kpis.attendanceRate.value === null
            ? "Aucun appel saisi sur la période"
            : kpis.attendanceRate.delta !== null
              ? "vs période préc."
              : undefined
        }
      />
      <KpiCard
        label="Encaissé sur la période"
        icon={<Wallet size={16} />}
        value={formatCompact(kpis.collected.value)}
        unit="FCFA"
        delta={<Delta value={kpis.collected.variation} unit="%" label={comparison} />}
        sub={`préc. : ${formatCompact(kpis.collected.previous)} FCFA`}
      />
      <KpiCard
        label="Taux de recouvrement"
        icon={<TrendingUp size={16} />}
        accent={recoveryLow ? "warning" : "green"}
        value={formatPercent(kpis.recoveryRate)}
        meter={kpis.recoveryRate}
        sub={`${formatCompact(kpis.totalPaid)} / ${formatCompact(kpis.totalInvoiced)} FCFA facturés`}
      />
      <KpiCard
        label="Impayés échus"
        icon={<AlarmClock size={16} />}
        accent={kpis.overdue.count > 0 ? "danger" : "green"}
        value={formatCompact(kpis.overdue.amount)}
        unit="FCFA"
        sub={
          kpis.overdue.count > 0
            ? `${kpis.overdue.count} facture(s) · reste dû total ${formatCompact(kpis.outstanding)}`
            : "Aucune facture échue"
        }
      />
      <KpiCard
        label="Admissions en cours"
        icon={<FileSignature size={16} />}
        accent="orange"
        value={formatNumber(kpis.pendingAdmissions)}
        sub={`sur ${data.admissionsFunnel.reduce((s, a) => s + a.count, 0)} candidature(s) de l'année`}
      />
    </div>
  );
}

function Sections({ data, loading }: { data: Analytics | null; loading: boolean }) {
  const thresholds = data?.thresholds;
  const collections = data?.collectionsByMonth || [];
  const lastMonth = collections[collections.length - 1];
  const statusRows = INVOICE_STATUS_ORDER.map((s) => data?.invoicesByStatus.find((r) => r.status === s)).filter(
    (r): r is NonNullable<typeof r> => !!r,
  );
  const invoiceCount = statusRows.reduce((s, r) => s + r.count, 0);
  const admissionsTotal = (data?.admissionsFunnel || []).reduce((s, a) => s + a.count, 0);
  const lowestRate = Math.min(100, ...(data?.attendanceTrend || []).map((d) => d.rate ?? 100));
  const attendanceFloor = Math.max(0, Math.floor((lowestRate - 5) / 10) * 10);

  return (
    <>
      {/* ---------- Vie scolaire ---------- */}
      <Section title="Vie scolaire" subtitle="Présence des élèves sur la période sélectionnée">
        <ChartCard
          span={7}
          title="Évolution du taux de présence"
          subtitle="Présents + retards / élèves appelés, par jour d'appel"
          loading={loading}
          empty={!data?.attendanceTrend.length}
          emptyText="Aucun appel n'a été saisi sur cette période."
        >
          {data && (
            <TrendLine
              data={data.attendanceTrend}
              xKey="date"
              yKey="rate"
              xFormat={(v) => formatDate(v)}
              yFormat={(v) => `${v} %`}
              yDomain={[attendanceFloor, 100]}
              yTicks={Array.from({ length: (100 - attendanceFloor) / 10 + 1 }, (_, i) => attendanceFloor + i * 10)}
              threshold={thresholds?.attendanceRateWarning}
              thresholdLabel={`Seuil ${thresholds?.attendanceRateWarning} %`}
              tooltipTitle={(d) => formatDate(d.date, { weekday: "long", day: "numeric", month: "long" })}
              tooltipRows={(d) => [
                { label: "Taux de présence", value: formatPercent(d.rate) },
                { label: "Présents", value: d.present },
                { label: "Retards", value: d.late },
                { label: "Absents", value: d.absent },
                { label: "Absences justifiées", value: d.justified },
              ]}
            />
          )}
        </ChartCard>
        <ChartCard
          span={5}
          title="Présence par classe"
          subtitle="Classement, de la meilleure à la plus faible"
          loading={loading}
          empty={!data?.attendanceByClass.length}
          emptyText="Aucun appel n'a été saisi sur cette période."
        >
          {data && (
            <RankBars
              data={data.attendanceByClass}
              labelKey="name"
              valueKey="rate"
              valueFormat={(v) => formatPercent(v, 0)}
              domain={[0, 100]}
              reference={thresholds?.attendanceRateWarning}
              referenceLabel={`${thresholds?.attendanceRateWarning} %`}
              labelWidth={72}
              tooltipTitle={(d) => d.name}
              tooltipRows={(d) => [
                { label: "Taux de présence", value: formatPercent(d.rate) },
                { label: "Absences", value: d.absences },
                { label: "Retards", value: d.late },
                { label: "Relevés", value: d.total },
              ]}
            />
          )}
        </ChartCard>
      </Section>

      {/* ---------- Finances ---------- */}
      <Section title="Finances" subtitle={`Scolarité et encaissements · ${data?.filters.academicYear.name || ""}`}>
        <ChartCard
          span={7}
          title="Encaissements mensuels"
          subtitle="Paiements validés sur les 6 derniers mois, mois en cours mis en avant"
          loading={loading}
          empty={!collections.some((m) => m.amount > 0)}
          emptyText="Aucun paiement enregistré sur les 6 derniers mois."
          footer={
            lastMonth && (
              <>
                {formatMonth(lastMonth.month, "long")} : {formatFCFA(lastMonth.amount)}{" "}
                <Delta value={lastMonth.variation} unit="%" label="par rapport au mois précédent" />
                {lastMonth.variation !== null && " vs mois précédent"}
              </>
            )
          }
        >
          <ColumnChart
            data={collections}
            xKey="month"
            yKey="amount"
            xFormat={(v) => formatMonth(v)}
            yFormat={formatCompact}
            highlightIndex={collections.length - 1}
            tooltipTitle={(d) => formatMonth(d.month, "long")}
            tooltipRows={(d) => [
              { label: "Encaissé", value: formatFCFA(d.amount) },
              {
                label: "vs mois préc.",
                value: d.variation === null ? "—" : `${d.variation > 0 ? "+" : ""}${formatPercent(d.variation)}`,
              },
            ]}
          />
        </ChartCard>
        <ChartCard
          span={5}
          title="Moyens de paiement"
          subtitle="Montants encaissés sur la période"
          loading={loading}
          empty={!data?.paymentsByMethod.length}
          emptyText="Aucun paiement sur la période sélectionnée."
        >
          {data && (
            <RankBars
              data={data.paymentsByMethod.map((m) => ({ ...m, label: PAYMENT_METHOD_LABELS[m.method] || m.method }))}
              labelKey="label"
              valueKey="amount"
              valueFormat={formatCompact}
              tooltipTitle={(d) => d.label}
              tooltipRows={(d) => [
                { label: "Montant", value: formatFCFA(d.amount) },
                { label: "Transactions", value: d.count },
              ]}
            />
          )}
        </ChartCard>
        <ChartCard
          span={5}
          title="Factures par statut"
          subtitle="Statut calculé d'après les paiements et l'échéance"
          height={180}
          loading={loading}
          empty={invoiceCount === 0}
          emptyText="Aucune facture émise pour cette année."
        >
          <div className="stacked-bar" role="img" aria-label="Répartition des factures par statut">
            {statusRows.map((r) => (
              <span
                key={r.status}
                style={{ width: `${(r.count / invoiceCount) * 100}%`, background: INVOICE_STATUS[r.status].color }}
                title={`${INVOICE_STATUS[r.status].label} : ${r.count}`}
              />
            ))}
          </div>
          <table className="table-compact" style={{ marginTop: 14 }}>
            <thead>
              <tr>
                <th>Statut</th>
                <th className="num">Factures</th>
                <th className="num">Montant</th>
              </tr>
            </thead>
            <tbody>
              {statusRows.map((r) => (
                <tr key={r.status}>
                  <td>
                    <span className="legend-item">
                      <span className="legend-swatch" style={{ background: INVOICE_STATUS[r.status].color }} />
                      <span aria-hidden="true" style={{ width: 12, textAlign: "center", fontWeight: 700 }}>
                        {INVOICE_STATUS[r.status].icon}
                      </span>
                      {INVOICE_STATUS[r.status].label}
                    </span>
                  </td>
                  <td className="num">{r.count}</td>
                  <td className="num">{formatCompact(r.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="chart-foot">Montant : total pour les factures soldées, reste dû pour les autres.</p>
        </ChartCard>
        <ChartCard
          span={7}
          title="Plus gros impayés échus"
          subtitle="Top 5 par reste dû"
          height={180}
          loading={loading}
          empty={!data?.overdueInvoices.length}
          emptyText="Aucune facture échue : tout est à jour. 🎉"
          aside={
            <Link href="/billing" className="btn btn-outline btn-sm">
              Facturation →
            </Link>
          }
        >
          <div style={{ overflowX: "auto" }}>
            <table className="table-compact">
              <thead>
                <tr>
                  <th>Élève</th>
                  <th>Facture</th>
                  <th>Échéance</th>
                  <th className="num">Retard</th>
                  <th className="num">Reste dû</th>
                </tr>
              </thead>
              <tbody>
                {data?.overdueInvoices.map((inv) => (
                  <tr key={inv.id}>
                    <td>
                      <Link href={`/students/${inv.student.id}`}>
                        {inv.student.lastName} {inv.student.firstName}
                      </Link>
                      <div className="muted" style={{ fontSize: 11.5 }}>
                        {inv.student.matricule}
                      </div>
                    </td>
                    <td className="nowrap">{inv.reference}</td>
                    <td className="nowrap">{formatDate(inv.dueDate, { day: "2-digit", month: "short", year: "numeric" })}</td>
                    <td className="num">
                      <span className="badge badge-danger">{inv.daysLate} j</span>
                    </td>
                    <td className="num nowrap">
                      <strong>{formatFCFA(inv.outstanding)}</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ChartCard>
      </Section>

      {/* ---------- Pédagogie & effectifs ---------- */}
      <Section title="Pédagogie & effectifs" subtitle={data?.filters.term ? `Notes : ${data.filters.term.name}` : undefined}>
        <ChartCard
          span={4}
          title="Moyenne générale par classe"
          subtitle="Sur 20, pondérée comme les bulletins"
          loading={loading}
          empty={!data?.gradesByClass.some((g) => g.average !== null)}
          emptyText="Aucune note saisie pour ce trimestre."
        >
          {data && (
            <RankBars
              data={data.gradesByClass.filter((g) => g.average !== null)}
              labelKey="name"
              valueKey="average"
              valueFormat={(v) => v.toLocaleString("fr-FR", { maximumFractionDigits: 1 })}
              domain={[0, 20]}
              reference={10}
              referenceLabel="10/20"
              labelWidth={64}
              tooltipTitle={(d) => d.name}
              tooltipRows={(d) => [
                { label: "Moyenne", value: `${d.average?.toLocaleString("fr-FR")} / 20` },
                { label: "Taux de réussite (≥ 10)", value: formatPercent(d.successRate) },
                { label: "Meilleure moyenne", value: d.best?.toLocaleString("fr-FR") ?? "—" },
                { label: "Plus faible moyenne", value: d.lowest?.toLocaleString("fr-FR") ?? "—" },
                { label: "Élèves notés", value: d.studentsGraded },
              ]}
            />
          )}
        </ChartCard>
        <ChartCard
          span={4}
          title="Remplissage des classes"
          subtitle={
            thresholds
              ? `Inscrits / capacité · alerte à ${thresholds.classFillWarning} %`
              : "Inscrits / capacité"
          }
          loading={loading}
          empty={!data?.classFill.length}
          emptyText="Aucune classe pour cette année."
        >
          <div className="meter-list">
            {data?.classFill.map((c) => {
              const level =
                c.rate === null || !thresholds
                  ? ""
                  : c.rate >= thresholds.classFillDanger
                    ? " is-danger"
                    : c.rate >= thresholds.classFillWarning
                      ? " is-warning"
                      : "";
              return (
                <div key={c.classId}>
                  <div className="meter-row-head">
                    <strong>
                      {c.name}
                      {level && (
                        <span className={`badge ${level === " is-danger" ? "badge-danger" : "badge-warning"}`} style={{ marginLeft: 8 }}>
                          {level === " is-danger" ? "Complète" : "Presque complète"}
                        </span>
                      )}
                    </strong>
                    <span>
                      {c.enrolled} / {c.capacity} · {formatPercent(c.rate, 0)}
                    </span>
                  </div>
                  <div
                    className={`meter${level}`}
                    role="meter"
                    aria-valuemin={0}
                    aria-valuemax={c.capacity}
                    aria-valuenow={c.enrolled}
                    aria-label={`Remplissage ${c.name}`}
                  >
                    <span style={{ width: `${Math.min(c.rate ?? 0, 100)}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </ChartCard>
        <ChartCard
          span={4}
          title="Suivi des admissions"
          subtitle="Candidatures de l'année par étape (non filtré par classe)"
          loading={loading}
          empty={admissionsTotal === 0}
          emptyText="Aucune candidature pour cette année."
        >
          {data && (
            <RankBars
              data={data.admissionsFunnel.map((a) => ({ ...a, label: ADMISSION_STATUS_LABELS[a.status] || a.status }))}
              labelKey="label"
              valueKey="count"
              valueFormat={(v) => formatNumber(v)}
              rowHeight={26}
              integer
              muted={(d) => d.status === "REJETE"}
              tooltipTitle={(d) => d.label}
              tooltipRows={(d) => [
                { label: "Candidatures", value: d.count },
                { label: "Part du total", value: formatPercent(admissionsTotal ? (d.count / admissionsTotal) * 100 : null, 0) },
              ]}
            />
          )}
        </ChartCard>
      </Section>
    </>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import TeacherDashboard from "../../components/dashboard/TeacherDashboard";
import Shell from "../../components/Shell";
import { api, ApiError } from "../../lib/api";
import { getStoredUser } from "../../lib/auth";
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
import { ChartCard, Delta, Heatmap, KpiCard, KpiSkeleton, Section, StateMessage } from "../../components/dashboard/ui";
import dynamic from "next/dynamic";

// Recharts is the heaviest dependency of the app: charts load after the KPIs are on screen.
const chartLoading = () => <div className="skeleton" style={{ height: 240 }} />;
const ColumnChart = dynamic(() => import("../../components/dashboard/charts").then((m) => m.ColumnChart), { ssr: false, loading: chartLoading });
const RankBars = dynamic(() => import("../../components/dashboard/charts").then((m) => m.RankBars), { ssr: false, loading: chartLoading });
const TrendLine = dynamic(() => import("../../components/dashboard/charts").then((m) => m.TrendLine), { ssr: false, loading: chartLoading });
const StackedShareArea = dynamic(() => import("../../components/dashboard/charts").then((m) => m.StackedShareArea), { ssr: false, loading: chartLoading }); const DonutChart = dynamic(() => import("../../components/dashboard/charts").then((m) => m.DonutChart), { ssr: false, loading: chartLoading }); const MultiBars = dynamic(() => import("../../components/dashboard/charts").then((m) => m.MultiBars), { ssr: false, loading: chartLoading }); const StackedBarsH = dynamic(() => import("../../components/dashboard/charts").then((m) => m.StackedBarsH), { ssr: false, loading: chartLoading }); const Histogram = dynamic(() => import("../../components/dashboard/charts").then((m) => m.Histogram), { ssr: false, loading: chartLoading }); const SubjectRadar = dynamic(() => import("../../components/dashboard/charts").then((m) => m.SubjectRadar), { ssr: false, loading: chartLoading }); const RiskScatter = dynamic(() => import("../../components/dashboard/charts").then((m) => m.RiskScatter), { ssr: false, loading: chartLoading }); const DivergingBars = dynamic(() => import("../../components/dashboard/charts").then((m) => m.DivergingBars), { ssr: false, loading: chartLoading });
const AreaTrend = dynamic(() => import("../../components/dashboard/charts").then((m) => m.AreaTrend), { ssr: false, loading: chartLoading });
import TodayPanel from "../../components/dashboard/TodayPanel";
import { AlarmClock, AlertOctagon, AlertTriangle, ClipboardCheck, FileSignature, GraduationCap, RefreshCw, TrendingUp, Wallet } from "lucide-react";

const DEFAULT_QUERY: DashboardQuery = { period: "30d", academicYearId: "", classId: "", termId: "" };

function greeting() {
  const firstName = getStoredUser()?.firstName;
  const hour = new Date().getHours();
  const hello = hour >= 18 ? "Bonsoir" : "Bonjour";
  return firstName ? `${hello}, ${firstName}` : hello;
}

function todayLabel() {
  const label = new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function errorMessage(err: unknown) {
  return err instanceof ApiError ? err.message : "Impossible de joindre le serveur.";
}

function SchoolDashboard() {
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
  // The one solid-ink action of the screen: the task this profile does most often.
  const role = getStoredUser()?.role ?? "";
  const primary =
    role === "COMPTABLE"
      ? { href: "/billing", label: "Encaisser", icon: Wallet }
      : ["SUPER_ADMIN", "ADMIN_ORGANISATION", "DIRECTOR", "SECRETARY", "ENSEIGNANT"].includes(role)
        ? { href: "/attendance", label: "Faire l'appel", icon: ClipboardCheck }
        : null;

  return (
    <Shell title="Tableau de bord">
      <div className="page-header">
        <div>
          <h1 className="greeting">{greeting()}</h1>
          <p className="greeting-date">{todayLabel()}</p>
        </div>
        <div className="page-header-meta">
          <button className="btn btn-ghost btn-sm" onClick={load} disabled={loading} title={updatedAt ? `Mis à jour à ${updatedAt.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}` : undefined}>
            <RefreshCw size={14} className={loading ? "spin" : undefined} /> {loading ? "Actualisation…" : "Actualiser"}
          </button>
          {primary && (
            <Link href={primary.href} className="btn btn-primary">
              <primary.icon size={16} aria-hidden="true" /> {primary.label}
            </Link>
          )}
        </div>
      </div>

      {/* ---------- Figure band: the four numbers of the day ---------- */}
      {firstLoad ? (
        <div className="kpi-grid kpi-band">
          {Array.from({ length: 4 }).map((_, i) => (
            <KpiSkeleton key={i} />
          ))}
        </div>
      ) : (
        data && <KpiBand data={data} />
      )}
      {data && (
        <p className="kpi-band-caption">
          Année {data.filters.academicYear.name} · {periodLong} (du{" "}
          {formatDate(data.filters.from, { day: "2-digit", month: "short", year: "numeric" })} au{" "}
          {formatDate(data.filters.to, { day: "2-digit", month: "short", year: "numeric" })})
          {selectedClass ? ` · ${selectedClass.name}` : ""}
          {updatedAt && ` · mis à jour à ${updatedAt.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`}
        </p>
      )}

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
            icon={<AlertOctagon size={20} />}
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
          <AlertTriangle size={16} aria-hidden="true" />
          <span>
            Actualisation impossible : {error}. Les données affichées sont celles du dernier chargement.{" "}
            <button className="btn btn-outline btn-sm" onClick={load} style={{ marginLeft: 8 }}>
              Réessayer
            </button>
          </span>
        </div>
      )}

      {(data || firstLoad) && !(error && !data) && (
        <div style={{ opacity: loading && data ? 0.6 : 1, transition: "opacity 0.15s" }}>
          {data && <Alerts alerts={data.alerts} />}
          {data && <KpiMore data={data} />}
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
            {a.level === "danger" ? <AlertOctagon size={16} /> : <AlertTriangle size={16} />}
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

function KpiBand({ data }: { data: Analytics }) {
  const { kpis, thresholds } = data;
  const comparison = `par rapport à la période précédente (${formatDate(data.filters.previousFrom)} – ${formatDate(
    data.filters.previousTo,
  )})`;
  const attendanceLow = kpis.attendanceRate.value !== null && kpis.attendanceRate.value < thresholds.attendanceRateWarning;

  return (
    <div className="kpi-grid kpi-band">
      <KpiCard
        label="Élèves inscrits"
        tone="blue"
        icon={<GraduationCap size={16} />}
        value={formatNumber(kpis.enrolledStudents)}
        sub={`${data.classFill.length} classe(s) · ${data.filters.academicYear.name}`}
      />
      <KpiCard
        label="Taux de présence"
        tone="green"
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
        tone="orange"
        icon={<Wallet size={16} />}
        value={formatCompact(kpis.collected.value)}
        unit="FCFA"
        delta={<Delta value={kpis.collected.variation} unit="%" label={comparison} />}
        sub={`préc. : ${formatCompact(kpis.collected.previous)} FCFA`}
      />
      <KpiCard
        label="Impayés échus"
        tone="red"
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
    </div>
  );
}

/** Secondary figures, below the alerts: recovery and admissions.  */
function KpiMore({ data }: { data: Analytics }) {
  const { kpis, thresholds } = data;
  const recoveryLow = kpis.recoveryRate !== null && kpis.recoveryRate < thresholds.recoveryRateWarning;
  return (
    <div className="kpi-grid kpi-grid-2">
      <KpiCard
        label="Taux de recouvrement"
        tone="ochre"
        icon={<TrendingUp size={16} />}
        accent={recoveryLow ? "warning" : "green"}
        value={formatPercent(kpis.recoveryRate)}
        meter={kpis.recoveryRate}
        sub={`${formatCompact(kpis.totalPaid)} / ${formatCompact(kpis.totalInvoiced)} FCFA facturés`}
      />
      <KpiCard
        label="Admissions en cours"
        tone="blue"
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

  const demo = data?.demographics;
  const girlsShare = demo && demo.total ? Math.round((demo.girls / demo.total) * 1000) / 10 : null;
  const composition = (data?.attendanceTrend || []).map((d) => ({ ...d }));
  const manyClasses = (data?.attendanceByClass.length || 0) > 12;
  // First and last graded terms, and each level's change between them.
  const gradedTerms = (data?.termProgress.terms || []).filter((t) => data?.termProgress.rows.some((r) => r[t.key] !== null && r[t.key] !== undefined));
  const progressTerms = gradedTerms.length >= 2 ? { first: gradedTerms[0], last: gradedTerms[gradedTerms.length - 1] } : null;
  const progressRows = progressTerms
    ? (data?.termProgress.rows || [])
        .filter((r) => typeof r[progressTerms.first.key] === "number" && typeof r[progressTerms.last.key] === "number")
        .map((r) => ({ ...r, delta: Math.round(((r[progressTerms.last.key] as number) - (r[progressTerms.first.key] as number)) * 10) / 10 }))
    : [];

  return (
    <>
      {/* ---------- Effectifs ---------- */}
      <Section title="Effectifs" subtitle="Élèves inscrits par niveau, filles et garçons">
        <ChartCard
          span={7}
          title="Répartition par niveau"
          subtitle="Élèves inscrits non retirés, filles et garçons empilés"
          loading={loading}
          empty={!demo?.enrollmentByLevel.length}
          emptyText="Aucun élève inscrit pour cette année."
        >
          {demo && (
            <>
              <div className="figure-strip">
                <span>
                  <strong>{formatNumber(demo.total)}</strong>élèves
                </span>
                <span>
                  <strong>{formatNumber(demo.girls)}</strong>filles ({formatPercent(girlsShare)})
                </span>
                <span>
                  <strong>{formatNumber(demo.boys)}</strong>garçons
                </span>
                <span>
                  <strong>{demo.enrollmentByLevel.length}</strong>niveaux
                </span>
              </div>
              <StackedBarsH
                data={demo.enrollmentByLevel}
                labelKey="level"
                series={[
                  { key: "girls", label: "Filles", token: "--series-1" },
                  { key: "boys", label: "Garçons", token: "--series-2" },
                ]}
                valueFormat={(v) => formatNumber(v)}
                tooltipTitle={(d) => d.level}
                tooltipRows={(d) => [
                  { label: "Filles", value: d.girls },
                  { label: "Garçons", value: d.boys },
                  { label: "Total", value: d.total },
                  { label: "Part de filles", value: formatPercent(d.total ? (d.girls / d.total) * 100 : null, 0) },
                ]}
              />
            </>
          )}
        </ChartCard>
        <ChartCard
          span={5}
          title="Remplissage des classes"
          subtitle={thresholds ? `Inscrits / capacité · alerte à ${thresholds.classFillWarning} %` : "Inscrits / capacité"}
          loading={loading}
          empty={!data?.classFill.length}
          emptyText="Aucune classe pour cette année."
        >
          <div className="meter-list meter-list-scroll" role="region" aria-label="Remplissage des classes" tabIndex={0}>
            {data?.classFill.map((c) => {
              const level =
                c.rate === null || !thresholds ? "" : c.rate >= thresholds.classFillDanger ? " is-danger" : c.rate >= thresholds.classFillWarning ? " is-warning" : "";
              return (
                <div key={c.classId}>
                  <div className="meter-row-head">
                    <strong>
                      {c.name}
                      {level && <span className={`badge ${level === " is-danger" ? "badge-danger" : "badge-warning"}`}>{level === " is-danger" ? "Complète" : "Presque complète"}</span>}
                    </strong>
                    <span>
                      {c.enrolled} / {c.capacity} · {formatPercent(c.rate, 0)}
                    </span>
                  </div>
                  <div className={`meter${level}`} role="meter" aria-valuemin={0} aria-valuemax={c.capacity} aria-valuenow={c.enrolled} aria-label={`Remplissage ${c.name}`}>
                    <span style={{ width: `${Math.min(c.rate ?? 0, 100)}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </ChartCard>
      </Section>

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
              labelWidth={88}
              rowHeight={manyClasses ? 22 : 34}
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
        <ChartCard
          span={7}
          title="Composition de l'appel"
          subtitle="Part des présents, retards, absences justifiées et absences, jour par jour"
          loading={loading}
          empty={!composition.length}
          emptyText="Aucun appel n'a été saisi sur cette période."
        >
          <StackedShareArea
            data={composition}
            xKey="date"
            xFormat={(v) => formatDate(v)}
            series={[
              { key: "present", label: "Présents", token: "--status-good" },
              { key: "late", label: "Retards", token: "--status-warning" },
              { key: "justified", label: "Absences justifiées", token: "--status-info" },
              { key: "absent", label: "Absences", token: "--status-critical" },
            ]}
            tooltipTitle={(d) => formatDate(d.date, { weekday: "long", day: "numeric", month: "long" })}
            tooltipRows={(d) => [
              { label: "Présents", value: `${d.present} (${formatPercent(d.total ? (d.present / d.total) * 100 : null)})` },
              { label: "Retards", value: d.late },
              { label: "Absences justifiées", value: d.justified },
              { label: "Absences", value: d.absent },
            ]}
          />
        </ChartCard>
        <ChartCard
          span={5}
          title="Absences par jour et par niveau"
          subtitle="Part des élèves absents (justifiés ou non), selon le jour de la semaine"
          loading={loading}
          empty={!data?.absenceHeatmap.rows.length}
          emptyText="Aucun appel n'a été saisi sur cette période."
        >
          {data && (
            <Heatmap
              columns={data.absenceHeatmap.weekdays}
              rows={data.absenceHeatmap.rows.map((r) => ({ label: r.level, values: r.values }))}
              format={(v) => `${v.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %`}
              caption="Taux d'absence par niveau et jour de la semaine"
            />
          )}
        </ChartCard>
        <ChartCard
          span={8}
          title="Élèves à risque"
          subtitle={`Présence depuis la rentrée et moyenne générale ${data?.filters.term ? `du ${data.filters.term.name.toLowerCase()}` : ""}, un point par élève`}
          height={300}
          loading={loading}
          empty={!data?.atRisk.points.length}
          emptyText="Il faut des appels et des notes sur la période pour croiser les deux."
        >
          {data && <RiskScatter points={data.atRisk.points} thresholds={data.atRisk.thresholds} />}
        </ChartCard>
        <ChartCard
          span={4}
          title="À suivre en priorité"
          subtitle={data ? `${data.atRisk.count} élève(s) cumulent moyenne < ${data.atRisk.thresholds.average} et présence < ${data.atRisk.thresholds.attendance} %` : undefined}
          height={300}
          loading={loading}
          empty={!data?.atRisk.list.length}
          emptyText="Aucun élève sous les deux seuils."
        >
          <ol className="stub-list stub-list-compact">
            {data?.atRisk.list.map((p) => (
              <li key={p.studentId}>
                <Link href={`/students/${p.studentId}`} className="stub">
                  <span className="stub-no">
                    {p.average.toLocaleString("fr-FR")}
                    <small>/ 20</small>
                  </span>
                  <span className="stub-body">
                    <span className="stub-title">{p.name}</span>
                    <span className="stub-meta">
                      {p.className} · {formatPercent(p.attendance, 0)} de présence
                    </span>
                  </span>
                  <span className="stub-end">
                    {p.average < data.atRisk.thresholds.average && p.attendance < data.atRisk.thresholds.attendance && <span className="risk-dot" title="Moyenne et présence sous les deux seuils" aria-label="À risque" />}
                  </span>
                </Link>
              </li>
            ))}
          </ol>
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
          span={7}
          title="Échéancier et encaissements"
          subtitle="Montants arrivés à échéance et montants encaissés, mois par mois depuis la rentrée"
          loading={loading}
          empty={!data?.billingSchedule.some((m) => m.due > 0 || m.collected > 0)}
          emptyText="Aucune facture ni aucun paiement pour cette année."
          footer={
            data && data.billingSchedule.length > 0 ? (
              <>
                Cumul depuis la rentrée : {formatFCFA(data.billingSchedule[data.billingSchedule.length - 1].collectedCumul)} encaissés pour{" "}
                {formatFCFA(data.billingSchedule[data.billingSchedule.length - 1].dueCumul)} arrivés à échéance
              </>
            ) : undefined
          }
        >
          {data && (
            <MultiBars
              data={data.billingSchedule}
              xKey="month"
              xFormat={(v) => formatMonth(v)}
              yFormat={formatCompact}
              series={[
                { key: "due", label: "Arrivé à échéance", token: "--series-2" },
                { key: "collected", label: "Encaissé", token: "--series-1" },
              ]}
              tooltipTitle={(d) => formatMonth(d.month, "long")}
              tooltipRows={(d) => [
                { label: "Arrivé à échéance", value: formatFCFA(d.due) },
                { label: "Encaissé", value: formatFCFA(d.collected) },
                { label: "Cumul encaissé", value: formatFCFA(d.collectedCumul) },
                { label: "Cumul dû", value: formatFCFA(d.dueCumul) },
              ]}
            />
          )}
        </ChartCard>
        <ChartCard
          span={5}
          title="Canaux de paiement"
          subtitle="Part des montants encaissés sur la période"
          loading={loading}
          empty={!data?.paymentsByMethod.length}
          emptyText="Aucun paiement sur la période sélectionnée."
        >
          {data && (() => {
            const sum = (methods: string[]) => data.paymentsByMethod.filter((m) => methods.includes(m.method)).reduce((s, m) => s + m.amount, 0);
            const channels = [
              { label: "Mobile Money", value: sum(["MOBILE_MONEY_ORANGE", "MOBILE_MONEY_MTN", "MOBILE_MONEY_MOOV", "WAVE"]), token: "--series-1" as const },
              { label: "Espèces", value: sum(["CASH"]), token: "--series-2" as const },
              { label: "Banque (virement, chèque, carte)", value: sum(["BANK_TRANSFER", "CHEQUE", "CARD"]), token: "--series-3" as const },
            ].filter((x) => x.value > 0);
            const total = channels.reduce((s, x) => s + x.value, 0);
            return <DonutChart data={channels} centerValue={formatCompact(total)} centerLabel="FCFA encaissés" valueFormat={formatFCFA} />;
          })()}
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
          emptyText="Aucune facture échue : tout est à jour."
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
                  <th className="stub-cell">Facture</th>
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
                      <div className="cell-sub tabular">
                        {inv.student.matricule}
                      </div>
                    </td>
                    <td className="stub-cell">{inv.reference}</td>
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
        <ChartCard
          span={12}
          title="Masse salariale"
          subtitle="Salaires nets des 12 derniers mois (bulletins payés, validés ou en préparation)"
          height={220}
          loading={loading}
          empty={!data?.payroll.length}
          emptyText="Aucun bulletin de paie."
          footer={
            data && data.payroll.length > 0 ? (
              <>
                {formatMonth(data.payroll[data.payroll.length - 1].period, "long")} : {formatFCFA(data.payroll[data.payroll.length - 1].total)} pour{" "}
                {data.payroll[data.payroll.length - 1].payslips} bulletin(s)
                {data.payroll[data.payroll.length - 1].pending > 0 && `, dont ${formatFCFA(data.payroll[data.payroll.length - 1].pending)} pas encore payés`}
              </>
            ) : undefined
          }
        >
          {data && (
            <AreaTrend
              data={data.payroll}
              xKey="period"
              yKey="total"
              xFormat={(v) => formatMonth(v)}
              yFormat={formatCompact}
              tooltipTitle={(d) => formatMonth(d.period, "long")}
              tooltipRows={(d) => [
                { label: "Masse salariale", value: formatFCFA(d.total) },
                { label: "Payée", value: formatFCFA(d.paid) },
                { label: "À payer", value: formatFCFA(d.pending) },
                { label: "Bulletins", value: d.payslips },
              ]}
            />
          )}
        </ChartCard>
      </Section>

      {/* ---------- Pédagogie ---------- */}
      <Section title="Pédagogie" subtitle={data?.filters.term ? `Notes : ${data.filters.term.name}` : undefined}>
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
              labelWidth={88}
              rowHeight={(data?.gradesByClass.length || 0) > 12 ? 22 : 34}
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
          title="Distribution des moyennes"
          subtitle={data?.gradeDistribution.graded ? `${formatNumber(data.gradeDistribution.graded)} élèves notés · ${formatPercent(data.gradeDistribution.passRate, 0)} à 10 ou plus` : "Moyennes générales, par tranche d'un point"}
          loading={loading}
          empty={!data?.gradeDistribution.graded}
          emptyText="Aucune note saisie pour ce trimestre."
          footer={
            data?.gradeDistribution.graded ? (
              <>
                Médiane (trait plein) {data.gradeDistribution.median?.toLocaleString("fr-FR")} · moitié centrale entre {data.gradeDistribution.q1?.toLocaleString("fr-FR")} et{" "}
                {data.gradeDistribution.q3?.toLocaleString("fr-FR")} · {data.gradeDistribution.honours} élève(s) à 14 ou plus (tableau d&apos;honneur)
              </>
            ) : undefined
          }
        >
          {data && <Histogram bins={data.gradeDistribution.bins} threshold={10} median={data.gradeDistribution.median} />}
        </ChartCard>        <ChartCard
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
        <ChartCard
          span={5}
          title="Profil par matière"
          subtitle="Moyenne des élèves dans chaque matière, sur 20 (pointillés : 10/20)"
          height={280}
          loading={loading}
          empty={(data?.subjectAverages.length || 0) < 3}
          emptyText="Il faut au moins trois matières notées pour tracer le profil."
          footer={
            data && data.subjectAverages.length > 0 ? (
              <>
                Plus fragile : {data.subjectAverages[data.subjectAverages.length - 1].subject} (
                {data.subjectAverages[data.subjectAverages.length - 1].average.toLocaleString("fr-FR")}, {formatPercent(data.subjectAverages[data.subjectAverages.length - 1].belowTen, 0)} sous 10)
              </>
            ) : undefined
          }
        >
          {data && <SubjectRadar data={data.subjectAverages} />}
        </ChartCard>
        <ChartCard
          span={7}
          title="Progression sur l'année"
          subtitle={
            progressTerms
              ? `Écart de moyenne générale entre le ${progressTerms.first.name.toLowerCase()} et le ${progressTerms.last.name.toLowerCase()}, en points, par niveau`
              : "Écart de moyenne générale entre le premier et le dernier trimestre noté"
          }
          height={280}
          loading={loading}
          empty={!progressRows.length}
          emptyText="Il faut deux trimestres notés pour mesurer une progression."
        >
          {data && progressTerms && (
            <DivergingBars
              data={progressRows}
              labelKey="level"
              valueKey="delta"
              valueFormat={(v) => `${v > 0 ? "+" : ""}${v.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} pt`}
              tooltipTitle={(d) => String(d.level)}
              tooltipRows={(d) => [
                ...data.termProgress.terms.map((t) => ({
                  label: t.name,
                  value: d[t.key] === null || d[t.key] === undefined ? "—" : `${Number(d[t.key]).toLocaleString("fr-FR")} / 20`,
                })),
                { label: "Écart", value: `${d.delta > 0 ? "+" : ""}${Number(d.delta).toLocaleString("fr-FR")} pt` },
              ]}
            />
          )}
        </ChartCard>
      </Section>

      {/* ---------- Réseau d'établissements ---------- */}
      {data && data.schools.length > 1 && <Network schools={data.schools} />}
    </>
  );
}

/** Comparison of the schools of the same group, shown to organisation-wide roles. */
function Network({ schools }: { schools: Analytics["schools"] }) {
  const sorted = [...schools].sort((a, b) => b.students - a.students);
  const total = schools.reduce((s, x) => s + x.students, 0);
  return (
    <Section title="Réseau d'établissements" subtitle={`${schools.length} établissements du groupe · ${formatNumber(total)} élèves`}>
      <ChartCard
        span={12}
        title="Présence et recouvrement par établissement"
        subtitle="Taux de présence sur la période et part de la scolarité facturée déjà encaissée"
        height={250}
      >
        <MultiBars
          data={sorted.map((s) => ({ ...s, label: s.city || s.code }))}
          xKey="label"
          xFormat={(v) => String(v)}
          yFormat={(v) => `${v} %`}
          yDomain={[0, 100]}
          series={[
            { key: "attendanceRate", label: "Taux de présence", token: "--series-2" },
            { key: "recoveryRate", label: "Taux de recouvrement", token: "--series-1" },
          ]}
          tooltipTitle={(d) => d.name}
          tooltipRows={(d) => [
            { label: "Présence", value: formatPercent(d.attendanceRate) },
            { label: "Recouvrement", value: formatPercent(d.recoveryRate) },
            { label: "Élèves", value: formatNumber(d.students) },
          ]}
        />
      </ChartCard>
      <section className="chart-card span-12">
        <div className="chart-card-head">
          <div>
            <h3 className="chart-title">Tableau comparatif</h3>
            <p className="chart-sub">L&apos;établissement où vous êtes connecté est surligné</p>
          </div>
        </div>
        <div className="table-scroll">
          <table className="table-compact">
            <thead>
              <tr>
                <th>Établissement</th>
                <th>Ville</th>
                <th className="num">Élèves</th>
                <th className="num">Présence</th>
                <th className="num">Recouvrement</th>
                <th className="num">Encaissé</th>
                <th className="num">Factures en retard</th>
                <th className="num">Note moyenne</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((s) => (
                <tr key={s.schoolId} className={s.isCurrent ? "is-current" : undefined}>
                  <td>
                    {s.name}
                    <div className="cell-sub tabular">{s.code}</div>
                  </td>
                  <td>{s.city || "—"}</td>
                  <td className="num">{formatNumber(s.students)}</td>
                  <td className="num">{formatPercent(s.attendanceRate)}</td>
                  <td className="num">
                    <span className={`inline-meter${s.recoveryRate !== null && s.recoveryRate < 50 ? " is-low" : ""}`}>
                      {formatPercent(s.recoveryRate, 0)}
                      <span aria-hidden="true">
                        <i style={{ width: `${Math.min(s.recoveryRate ?? 0, 100)}%` }} />
                      </span>
                    </span>
                  </td>
                  <td className="num">{formatCompact(s.collected)} FCFA</td>
                  <td className="num">{formatNumber(s.overdueInvoices)}</td>
                  <td className="num">{s.averageGrade === null ? "—" : `${s.averageGrade.toLocaleString("fr-FR")} / 20`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </Section>
  );
}

/** Teachers get their own dashboard (their classes and their day); the other staff get the school's. */
export default function DashboardPage() {
  const [role, setRole] = useState<string | null>(null);
  useEffect(() => setRole(getStoredUser()?.role ?? ""), []);
  if (role === null) return null;
  return role === "ENSEIGNANT" ? <TeacherDashboard /> : <SchoolDashboard />;
}

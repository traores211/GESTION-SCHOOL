"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, CircleMinus, TrendingDown, TrendingUp } from "lucide-react";
import Shell from "../../../components/Shell";
import { EmptyState, PageHeader, TableSkeleton } from "../../../components/ui";
import TimetableNav from "../../../components/timetable/TimetableNav";
import { api, errorMessage } from "../../../lib/api";
import { formatHours } from "../../../lib/timetable";
import "../../../components/timetable/timetable.css";

type Status = "ok" | "missing" | "over" | "none" | "idle";

interface Compliance {
  classes: {
    classId: string;
    className: string;
    level: string;
    officialHours: number;
    plannedHours: number;
    missing: number;
    over: number;
    status: Status;
    subjects: { subjectId: string; subjectName: string; officialHours: number; plannedHours: number; status: Status }[];
  }[];
  teachers: { teacherId: string; teacherName: string; plannedHours: number; maxHours: number | null; lessons: number; unqualified: number; status: Status }[];
  totals: { classesOk: number; classesMissing: number; classesOver: number; officialHours: number; plannedHours: number; teachersOver: number };
}

const STATUS: Record<Status, { label: string; icon: typeof CheckCircle2 }> = {
  ok: { label: "Conforme", icon: CheckCircle2 },
  missing: { label: "Manque", icon: TrendingDown },
  over: { label: "Dépassement", icon: TrendingUp },
  none: { label: "Sans référence", icon: CircleMinus },
  idle: { label: "Aucun cours", icon: CircleMinus },
};

function Pill({ status, label }: { status: Status; label?: string }) {
  const { label: text, icon: Icon } = STATUS[status];
  return (
    <span className={`status-pill is-${status === "idle" ? "none" : status}`}>
      <Icon size={13} aria-hidden="true" /> {label ?? text}
    </span>
  );
}

function Bar({ planned, target, status }: { planned: number; target: number; status: Status }) {
  const pct = target > 0 ? Math.min(100, (planned / target) * 100) : planned > 0 ? 100 : 0;
  return (
    <span className={`hours-bar is-${status}`} role="img" aria-label={`${formatHours(planned)} sur ${formatHours(target)}`}>
      <span style={{ width: `${pct}%` }} />
    </span>
  );
}

function ComplianceContent() {
  const [data, setData] = useState<Compliance | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<"all" | "issues">("all");

  useEffect(() => {
    api
      .get<Compliance>("/timetable/compliance")
      .then((d) => {
        setData(d);
        setOpen(new Set(d.classes.filter((c) => c.status === "missing" || c.status === "over").map((c) => c.classId)));
      })
      .catch((err) => setError(errorMessage(err)));
  }, []);

  const classes = useMemo(() => (data?.classes ?? []).filter((c) => filter === "all" || c.status === "missing" || c.status === "over"), [data, filter]);
  const teachers = useMemo(() => (data?.teachers ?? []).filter((t) => filter === "all" || t.status === "over" || t.unqualified > 0 || t.status === "missing"), [data, filter]);
  const toggle = (id: string) => setOpen((s) => {
    const next = new Set(s);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  return (
    <>
      <PageHeader title="Conformité des volumes horaires" description="Heures planifiées comparées aux volumes officiels (par classe et matière) et au volume de service des professeurs." />
      <TimetableNav />
      {error && <EmptyState tone="error" title="Tableau indisponible">{error}</EmptyState>}

      {data && (
        <div className="gen-stats">
          <div className={`gen-stat ${data.totals.classesOk === data.classes.length ? "is-good" : ""}`}>
            <strong>
              {data.totals.classesOk} / {data.classes.length}
            </strong>
            <span>classes conformes</span>
          </div>
          <div className={`gen-stat ${data.totals.classesMissing ? "is-bad" : ""}`}>
            <strong>{data.totals.classesMissing}</strong>
            <span>classes avec des heures manquantes</span>
          </div>
          <div className={`gen-stat ${data.totals.classesOver ? "is-bad" : ""}`}>
            <strong>{data.totals.classesOver}</strong>
            <span>classes en dépassement</span>
          </div>
          <div className="gen-stat">
            <strong>
              {formatHours(data.totals.plannedHours)} / {formatHours(data.totals.officialHours)}
            </strong>
            <span>heures officielles couvertes</span>
          </div>
          <div className={`gen-stat ${data.totals.teachersOver ? "is-bad" : ""}`}>
            <strong>{data.totals.teachersOver}</strong>
            <span>professeur(s) au-delà de leur service</span>
          </div>
        </div>
      )}

      <div className="tt-toolbar">
        <div className="segmented" role="group" aria-label="Filtre">
          <button type="button" aria-pressed={filter === "all"} onClick={() => setFilter("all")}>
            Tout
          </button>
          <button type="button" aria-pressed={filter === "issues"} onClick={() => setFilter("issues")}>
            <AlertTriangle size={14} /> Écarts seulement
          </button>
        </div>
      </div>

      <section aria-labelledby="comp-classes" style={{ marginBottom: 22 }}>
        <h2 id="comp-classes" className="card-title">
          Par classe
        </h2>
        <div className="table-wrap">
          {!data ? (
            <TableSkeleton columns={5} rows={6} />
          ) : classes.length === 0 ? (
            <EmptyState icon={<CheckCircle2 size={22} />} title={filter === "issues" ? "Aucun écart" : "Aucune classe"}>
              {filter === "issues" ? "Toutes les classes respectent leurs volumes officiels." : "Créez des classes pour l'année en cours."}
            </EmptyState>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Classe</th>
                  <th>Heures planifiées / officielles</th>
                  <th className="num">Écart</th>
                  <th>Statut</th>
                  <th className="actions">
                    <span className="visually-hidden">Détail</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {classes.map((c) => {
                  const expanded = open.has(c.classId);
                  const diff = c.plannedHours - c.officialHours;
                  return (
                    <Fragment key={c.classId}>
                      <tr>
                        <td>
                          <div className="cell-main">{c.className}</div>
                          <div className="cell-sub">{c.level}</div>
                        </td>
                        <td>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <Bar planned={c.plannedHours} target={c.officialHours} status={c.status} />
                            <span className="tabular">
                              {formatHours(c.plannedHours)} / {formatHours(c.officialHours)}
                            </span>
                          </div>
                        </td>
                        <td className="num tabular">{diff === 0 ? "—" : `${diff > 0 ? "+" : "−"}${formatHours(Math.abs(diff))}`}</td>
                        <td>
                          <Pill status={c.status} label={c.status === "missing" ? `${c.missing} matière(s) en manque` : c.status === "over" ? `${c.over} matière(s) en dépassement` : undefined} />
                        </td>
                        <td className="actions">
                          <button type="button" className="btn btn-ghost btn-icon btn-sm" aria-expanded={expanded} aria-label={`Détail de ${c.className}`} onClick={() => toggle(c.classId)}>
                            {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                          </button>
                        </td>
                      </tr>
                      {expanded && (
                        <tr>
                          <td colSpan={5} style={{ background: "var(--paper-sunken)" }}>
                            <div className="subject-rows">
                              {c.subjects.map((s) => (
                                <div key={s.subjectId} className="subject-row">
                                  <span>{s.subjectName}</span>
                                  <Bar planned={s.plannedHours} target={s.officialHours} status={s.status} />
                                  <span className="tabular">
                                    {formatHours(s.plannedHours)} / {formatHours(s.officialHours)}
                                  </span>
                                  <Pill status={s.status} label={s.officialHours === 0 ? "Hors programme" : undefined} />
                                </div>
                              ))}
                            </div>
                            <Link href={`/timetable?view=class&id=${c.classId}`} className="btn btn-ghost btn-sm" style={{ marginTop: 8 }}>
                              Ouvrir l&apos;emploi du temps
                            </Link>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <section aria-labelledby="comp-teachers">
        <h2 id="comp-teachers" className="card-title">
          Par professeur
        </h2>
        <div className="table-wrap">
          {!data ? (
            <TableSkeleton columns={5} rows={6} />
          ) : teachers.length === 0 ? (
            <EmptyState icon={<CheckCircle2 size={22} />} title="Aucun écart">
              Aucun professeur ne dépasse son volume de service.
            </EmptyState>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Professeur</th>
                  <th>Heures planifiées / service</th>
                  <th className="num">Cours</th>
                  <th>Statut</th>
                </tr>
              </thead>
              <tbody>
                {teachers.map((t) => (
                  <tr key={t.teacherId}>
                    <td>
                      <Link href={`/timetable?view=teacher&id=${t.teacherId}`} className="cell-main">
                        {t.teacherName}
                      </Link>
                      {t.unqualified > 0 && (
                        <div className="cell-sub" style={{ color: "var(--danger)" }}>
                          {t.unqualified} cours hors habilitation
                        </div>
                      )}
                    </td>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        {t.maxHours != null && <Bar planned={t.plannedHours} target={t.maxHours} status={t.status === "missing" ? "ok" : t.status} />}
                        <span className="tabular">
                          {formatHours(t.plannedHours)}
                          {t.maxHours != null ? ` / ${formatHours(t.maxHours)}` : " (pas de maximum)"}
                        </span>
                      </div>
                    </td>
                    <td className="num">{t.lessons}</td>
                    <td>
                      <Pill status={t.status} label={t.status === "missing" ? "Sous le service" : t.status === "none" ? "Pas de maximum" : undefined} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </>
  );
}

export default function CompliancePage() {
  return (
    <Shell title="Emplois du temps · Conformité">
      <ComplianceContent />
    </Shell>
  );
}

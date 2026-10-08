"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Award, Download, FileSpreadsheet, LoaderCircle, Printer, Users } from "lucide-react";
import Shell from "../../../components/Shell";
import { EmptyState, PageHeader, TableSkeleton, useFeedback } from "../../../components/ui";
import { KpiCard } from "../../../components/dashboard/ui";
import { api, errorMessage } from "../../../lib/api";
import { getStoredUser } from "../../../lib/auth";
import { downloadFile } from "../../../lib/download";

interface Option {
  id: string;
  name: string;
}

interface Pupil {
  id: string;
  matricule: string;
  firstName: string;
  lastName: string;
  average: number | null;
  rankLabel: string | null;
  distinction: { code: string; label: string } | null;
  absences: { unjustified: number; justified: number; late: number };
  councilAppreciation: string | null;
  annualAverage: number | null;
  suggestedDecision: string | null;
  decision: string | null;
}

interface Sheet {
  class: { id: string; name: string; headTeacher: string | null };
  year: string;
  term: { id: string; name: string };
  isLastTerm: boolean;
  students: Pupil[];
  stats: { size: number; ranked: number; classAverage: number | null; best: number | null; lowest: number | null; passRate: number | null; honours: number };
}

const DECISIONS: Record<string, string> = { ADMIS: "Admis(e)", REDOUBLE: "Redouble", EXCLU: "Non autorisé(e) à redoubler" };
const DISTINCTION_BADGE: Record<string, string> = { FELICITATIONS: "badge-green", ENCOURAGEMENTS: "badge-green", TABLEAU_HONNEUR: "badge-info", AVERTISSEMENT: "badge-warning", BLAME: "badge-danger" };
const DISTINCTION_SHORT: Record<string, string> = { FELICITATIONS: "Félicitations", ENCOURAGEMENTS: "Encouragements", TABLEAU_HONNEUR: "Tableau d'honneur", AVERTISSEMENT: "Avertissement", BLAME: "Blâme" };
const fmt = (n: number | null) => (n === null ? "—" : n.toFixed(2).replace(".", ","));
const MANAGEMENT = ["SUPER_ADMIN", "ADMIN_ORGANISATION", "DIRECTOR"];

function CouncilContent() {
  const feedback = useFeedback();
  const role = getStoredUser()?.role ?? "";
  const canDecide = MANAGEMENT.includes(role);
  const canWrite = canDecide || role === "ENSEIGNANT";
  const canExport = canDecide || role === "SECRETARY";
  const [classes, setClasses] = useState<Option[]>([]);
  const [terms, setTerms] = useState<Option[]>([]);
  const [classId, setClassId] = useState("");
  const [termId, setTermId] = useState("");
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.get<Option[]>("/classes"), api.get<{ isCurrent: boolean; terms: Option[] }[]>("/academic-years")])
      .then(([cls, years]) => {
        setClasses(cls);
        if (cls[0]) setClassId(cls[0].id);
        const current = years.find((y) => y.isCurrent) ?? years[0];
        setTerms(current?.terms ?? []);
        if (current?.terms[0]) setTermId(current.terms[0].id);
      })
      .catch((err) => setError(errorMessage(err)));
  }, []);

  const load = useCallback(() => {
    if (!classId || !termId) return;
    setSheet(null);
    api
      .get<Sheet>(`/bulletins/class/${classId}/${termId}`)
      .then((s) => {
        setSheet(s);
        setDrafts(Object.fromEntries(s.students.map((p) => [p.id, p.councilAppreciation ?? ""])));
        setError(null);
      })
      .catch((err) => setError(errorMessage(err)));
  }, [classId, termId]);
  useEffect(load, [load]);

  const patch = (id: string, changes: Partial<Pupil>) => setSheet((s) => (s ? { ...s, students: s.students.map((p) => (p.id === id ? { ...p, ...changes } : p)) } : s));

  const saveAppreciation = async (p: Pupil) => {
    const text = drafts[p.id] ?? "";
    if (text === (p.councilAppreciation ?? "")) return;
    try {
      await api.put(`/bulletins/${p.id}/${termId}`, { councilAppreciation: text });
      patch(p.id, { councilAppreciation: text || null });
    } catch (err) {
      feedback.error("Appréciation non enregistrée", errorMessage(err));
    }
  };

  /** Fills the field with an appreciation proposed from the results; nothing is saved until the field is left. */
  const suggest = async (p: Pupil) => {
    try {
      const { suggestion } = await api.get<{ suggestion: string | null }>(`/bulletins/${p.id}/${termId}/suggestion`);
      if (!suggestion) return feedback.toast({ kind: "warning", title: "Aucune suggestion", message: "Cet élève n'a pas encore de moyenne pour la période." });
      setDrafts((d) => ({ ...d, [p.id]: suggestion }));
      await api.put(`/bulletins/${p.id}/${termId}`, { councilAppreciation: suggestion });
      patch(p.id, { councilAppreciation: suggestion });
    } catch (err) {
      feedback.error("Suggestion indisponible", errorMessage(err));
    }
  };

  const saveDecision = async (p: Pupil, decision: string) => {
    try {
      await api.put(`/bulletins/${p.id}/${termId}`, { decision: decision || null });
      patch(p.id, { decision: decision || null });
    } catch (err) {
      feedback.error("Décision non enregistrée", errorMessage(err));
    }
  };

  const download = async (key: string, path: string, name: string) => {
    setBusy(key);
    try {
      await downloadFile(path, name);
    } catch (err) {
      feedback.error("Téléchargement impossible", errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Notes & bulletins", href: "/grades" }, { label: "Conseil de classe" }]}
        title="Conseil de classe"
        description="Moyennes, rangs, distinctions et absences de la classe ; appréciations du conseil et décisions de fin d'année ; bulletins à imprimer."
        actions={
          sheet && (
            <>
              {canExport && (
                <button type="button" className="btn btn-outline" disabled={busy !== null} onClick={() => download("csv", `/bulletins/class/${classId}/${termId}/csv`, "resultats.csv")}>
                  {busy === "csv" ? <LoaderCircle size={16} className="spin" /> : <FileSpreadsheet size={16} />} Résultats (Excel)
                </button>
              )}
              <button type="button" className="btn btn-primary" disabled={busy !== null || sheet.students.length === 0} onClick={() => download("pdf", `/bulletins/class/${classId}/${termId}/pdf`, "bulletins.pdf")}>
                {busy === "pdf" ? <LoaderCircle size={16} className="spin" /> : <Printer size={16} />} Tous les bulletins (PDF)
              </button>
            </>
          )
        }
      />

      <div className="filter-bar">
        <div className="filter-item">
          <label htmlFor="cc-class">Classe</label>
          <select id="cc-class" className="input" value={classId} onChange={(e) => setClassId(e.target.value)}>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="filter-item">
          <label htmlFor="cc-term">Période</label>
          <select id="cc-term" className="input" value={termId} onChange={(e) => setTermId(e.target.value)}>
            {terms.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        <Link className="btn btn-outline" href="/grades" style={{ alignSelf: "flex-end" }}>
          Saisir des notes
        </Link>
      </div>

      {sheet && (
        <div className="kpi-grid">
          <KpiCard label="Moyenne de la classe" icon={<Users size={16} />} value={fmt(sheet.stats.classAverage)} sub={`${sheet.stats.ranked} élève(s) classé(s) sur ${sheet.stats.size}`} />
          <KpiCard label="Taux de réussite" icon={<Award size={16} />} value={sheet.stats.passRate === null ? "—" : `${String(sheet.stats.passRate).replace(".", ",")} %`} meter={sheet.stats.passRate} sub="moyenne supérieure ou égale à 10" />
          <KpiCard label="Tableau d'honneur" icon={<Award size={16} />} value={sheet.stats.honours} sub="moyenne supérieure ou égale à 12" />
          <KpiCard label="Écart" icon={<Users size={16} />} value={`${fmt(sheet.stats.lowest)} à ${fmt(sheet.stats.best)}`} sub="de la plus faible à la plus forte moyenne" />
        </div>
      )}

      <div className="table-wrap">
        {error ? (
          <EmptyState tone="error" title="Résultats indisponibles">
            {error}
          </EmptyState>
        ) : !sheet ? (
          <TableSkeleton columns={7} rows={8} />
        ) : sheet.students.length === 0 ? (
          <EmptyState icon={<Users size={22} />} title="Aucun élève inscrit dans cette classe" />
        ) : (
          <table>
            <thead>
              <tr>
                <th>Élève</th>
                <th className="num">Moyenne</th>
                <th>Rang</th>
                <th>Distinction</th>
                <th className="num">Abs.</th>
                <th>Appréciation du conseil</th>
                {sheet.isLastTerm && <th className="num">Moy. annuelle</th>}
                {sheet.isLastTerm && <th>Décision</th>}
                <th className="actions">
                  <span className="visually-hidden">Bulletin</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {sheet.students.map((p) => (
                <tr key={p.id}>
                  <td>
                    <div className="cell-main">
                      {p.lastName} {p.firstName}
                    </div>
                    <div className="cell-sub tabular">{p.matricule}</div>
                  </td>
                  <td className="num">
                    <strong>{fmt(p.average)}</strong>
                  </td>
                  <td className="nowrap">{p.rankLabel ?? <span className="muted">non classé</span>}</td>
                  <td>{p.distinction ? <span className={`badge ${DISTINCTION_BADGE[p.distinction.code] ?? "badge-neutral"}`} title={p.distinction.label}>{DISTINCTION_SHORT[p.distinction.code] ?? p.distinction.label}</span> : <span className="muted">—</span>}</td>
                  <td className="num" title={`${p.absences.unjustified} non justifiée(s), ${p.absences.justified} justifiée(s), ${p.absences.late} retard(s)`}>
                    {p.absences.unjustified + p.absences.justified}
                  </td>
                  <td style={{ minWidth: 280 }}>
                    <div className="council-appreciation">
                    <input
                      className="input input-sm"
                      aria-label={`Appréciation du conseil pour ${p.firstName} ${p.lastName}`}
                      placeholder={canWrite ? "Saisir l'appréciation…" : ""}
                      maxLength={500}
                      disabled={!canWrite}
                      value={drafts[p.id] ?? ""}
                      onChange={(e) => setDrafts({ ...drafts, [p.id]: e.target.value })}
                      onBlur={() => saveAppreciation(p)}
                    />
                    {canWrite && !(drafts[p.id] ?? "") && p.average !== null && (
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => suggest(p)} aria-label={`Proposer une appréciation pour ${p.firstName} ${p.lastName}`}>
                        Suggérer
                      </button>
                    )}
                    </div>
                  </td>
                  {sheet.isLastTerm && (
                    <td className="num">
                      <strong>{fmt(p.annualAverage)}</strong>
                    </td>
                  )}
                  {sheet.isLastTerm && (
                    <td>
                      <select className="input input-sm" aria-label={`Décision pour ${p.firstName} ${p.lastName}`} disabled={!canDecide} value={p.decision ?? ""} onChange={(e) => saveDecision(p, e.target.value)}>
                        <option value="">{p.suggestedDecision ? `À décider (suggéré : ${DECISIONS[p.suggestedDecision]})` : "À décider"}</option>
                        {Object.entries(DECISIONS).map(([k, v]) => (
                          <option key={k} value={k}>
                            {v}
                          </option>
                        ))}
                      </select>
                    </td>
                  )}
                  <td className="actions">
                    <button type="button" className="btn btn-ghost btn-sm" disabled={busy !== null} aria-label={`Bulletin de ${p.firstName} ${p.lastName}`} onClick={() => download(p.id, `/bulletins/${p.id}/${termId}/pdf`, `bulletin-${p.matricule}.pdf`)}>
                      {busy === p.id ? <LoaderCircle size={14} className="spin" /> : <Download size={14} />} PDF
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {sheet && canWrite && <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>Les appréciations s&apos;enregistrent quand vous quittez le champ.</p>}
    </>
  );
}

export default function CouncilPage() {
  return (
    <Shell title="Conseil de classe">
      <CouncilContent />
    </Shell>
  );
}

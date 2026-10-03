"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, LoaderCircle, RotateCcw, Save, Upload, XCircle } from "lucide-react";
import Shell from "../../../components/Shell";
import { EmptyState, FormError, PageHeader, TableSkeleton, useFeedback } from "../../../components/ui";
import TimetableNav from "../../../components/timetable/TimetableNav";
import { api, errorMessage } from "../../../lib/api";
import { downloadFile } from "../../../lib/download";
import { DAY_NAMES, formatHours } from "../../../lib/timetable";
import "../../../components/timetable/timetable.css";

interface ReportRow {
  sheet: "teachers" | "volumes";
  line: number;
  status: "valid" | "warning" | "error";
  errors: string[];
  warnings: string[];
  cells: string[];
}

interface Analysis {
  fileName: string;
  sheets: { teachers: string | null; volumes: string | null };
  rows: ReportRow[];
  summary: { valid: number; warnings: number; errors: number; teachers: number; availabilities: number; qualifications: number; volumes: number };
  payload: { teachers: unknown[]; volumes: unknown[] };
}

interface Overview {
  teachers: { id: string; name: string; matricule: string | null; maxHours: number | null; qualifications: { subject: string; scope: string }[]; availability: { dayOfWeek: number; startTime: string; endTime: string }[] }[];
  volumes: { level: string; subject: string; hours: number; maxSessionHours: number | null; coefficient: number | null }[];
}

type RowFilter = "all" | "error" | "warning" | "valid";

function PlanningContent() {
  const feedback = useFeedback();
  const input = useRef<HTMLInputElement>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [busy, setBusy] = useState<"template" | "analyze" | "commit" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<RowFilter>("all");
  const [dragOver, setDragOver] = useState(false);

  const loadOverview = useCallback(() => {
    api
      .get<Overview>("/timetable/planning")
      .then(setOverview)
      .catch((err) => setError(errorMessage(err)));
  }, []);
  useEffect(loadOverview, [loadOverview]);

  const template = async () => {
    setBusy("template");
    try {
      await downloadFile("/timetable/planning/template", "modele-planification-emplois-du-temps.xlsx");
    } catch (err) {
      feedback.error("Téléchargement impossible", errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const analyze = async (file: File | undefined) => {
    if (!file) return;
    setBusy("analyze");
    setError(null);
    setAnalysis(null);
    try {
      const r = await api.upload<Analysis>("/timetable/planning/import/analyze", file);
      setAnalysis(r);
      setFilter(r.summary.errors ? "error" : "all");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
      if (input.current) input.current.value = "";
    }
  };

  const commit = async () => {
    if (!analysis) return;
    const ok = await feedback.confirm({
      title: "Enregistrer ces données ?",
      message: `${analysis.summary.teachers} professeur(s) : leurs habilitations et disponibilités de l'année seront remplacées par celles du fichier (${analysis.summary.qualifications} habilitations, ${analysis.summary.availabilities} créneaux). ${analysis.summary.volumes} volume(s) officiel(s) : ceux des niveaux présents dans le fichier seront remplacés.`,
      confirmLabel: "Enregistrer",
      cancelLabel: "Revenir",
    });
    if (!ok) return;
    setBusy("commit");
    try {
      const r = await api.post<{ teachers: number; qualifications: number; availabilities: number; volumes: number; volumeHours: string }>("/timetable/planning/import/commit", analysis.payload);
      feedback.success("Données enregistrées", `${r.teachers} professeurs, ${r.qualifications} habilitations, ${r.availabilities} disponibilités, ${r.volumes} volumes (${r.volumeHours})`);
      setAnalysis(null);
      loadOverview();
    } catch (err) {
      feedback.error("Enregistrement impossible", errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const rows = useMemo(() => (analysis?.rows ?? []).filter((r) => filter === "all" || r.status === filter), [analysis, filter]);
  const volumesByLevel = useMemo(() => {
    const map = new Map<string, Overview["volumes"]>();
    for (const v of overview?.volumes ?? []) map.set(v.level, [...(map.get(v.level) ?? []), v]);
    return [...map.entries()];
  }, [overview]);

  return (
    <>
      <PageHeader title="Professeurs & volumes horaires" description="Habilitations, disponibilités et service des professeurs ; volumes horaires officiels par niveau. Ce sont les données d'entrée de la génération." />
      <TimetableNav />

      <section className="card" aria-labelledby="imp-title" style={{ marginBottom: 18 }}>
        <h2 id="imp-title" className="card-title">
          Importer le fichier de planification
        </h2>
        <ol className="muted" style={{ fontSize: 13, margin: "0 0 12px 18px", display: "grid", gap: 4 }}>
          <li>
            Téléchargez le modèle Excel : onglet <strong>Professeurs</strong> (une ligne par créneau de disponibilité) et onglet <strong>Volumes horaires officiels</strong>.
          </li>
          <li>Remplissez-le puis envoyez-le (Excel .xlsx ou CSV d&apos;un onglet).</li>
          <li>Vérifiez le rapport : rien n&apos;est enregistré tant que vous n&apos;avez pas confirmé.</li>
        </ol>
        <div className="btn-row" style={{ marginBottom: 12 }}>
          <button type="button" className="btn btn-outline" onClick={template} disabled={busy !== null}>
            {busy === "template" ? <LoaderCircle size={16} className="spin" /> : <Download size={16} />} Télécharger le modèle
          </button>
        </div>
        <label
          className={`dropzone${dragOver ? " is-over" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            analyze(e.dataTransfer.files[0]);
          }}
        >
          {busy === "analyze" ? <LoaderCircle size={26} className="spin" /> : <Upload size={26} />}
          <strong>{busy === "analyze" ? "Analyse du fichier…" : "Déposez le fichier ici ou cliquez pour le choisir"}</strong>
          <span className="muted" style={{ fontSize: 12.5 }}>
            .xlsx ou .csv · 5 Mo maximum
          </span>
          <input ref={input} type="file" accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="visually-hidden" onChange={(e) => analyze(e.target.files?.[0])} disabled={busy !== null} />
        </label>
        <FormError message={error} />
      </section>

      {analysis && (
        <section className="card page-enter" aria-labelledby="rep-title" style={{ marginBottom: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <h2 id="rep-title" className="card-title" style={{ margin: 0 }}>
              <FileSpreadsheet size={17} style={{ verticalAlign: "-3px" }} /> Rapport d&apos;import · {analysis.fileName}
            </h2>
            <div className="btn-row">
              <button type="button" className="btn btn-outline" onClick={() => input.current?.click()} disabled={busy !== null}>
                <RotateCcw size={16} /> Réimporter un fichier corrigé
              </button>
              <button type="button" className="btn btn-primary" onClick={commit} disabled={busy !== null || analysis.summary.errors > 0 || analysis.summary.valid + analysis.summary.warnings === 0}>
                {busy === "commit" ? <LoaderCircle size={16} className="spin" /> : <Save size={16} />} Confirmer l&apos;enregistrement
              </button>
            </div>
          </div>
          <p className="muted" style={{ fontSize: 12.5, margin: "6px 0 0" }}>
            Onglets reconnus : {analysis.sheets.teachers ? `« ${analysis.sheets.teachers} »` : "Professeurs absent"} · {analysis.sheets.volumes ? `« ${analysis.sheets.volumes} »` : "Volumes absent"}
          </p>
          <div className="gen-stats">
            <div className="gen-stat is-good">
              <strong>{analysis.summary.valid}</strong>
              <span>lignes valides</span>
            </div>
            <div className={`gen-stat ${analysis.summary.errors ? "is-bad" : ""}`}>
              <strong>{analysis.summary.errors}</strong>
              <span>lignes en erreur</span>
            </div>
            <div className="gen-stat">
              <strong>{analysis.summary.warnings}</strong>
              <span>avertissements</span>
            </div>
            <div className="gen-stat">
              <strong>{analysis.summary.teachers}</strong>
              <span>
                professeurs · {analysis.summary.qualifications} habilitations · {analysis.summary.availabilities} créneaux
              </span>
            </div>
            <div className="gen-stat">
              <strong>{analysis.summary.volumes}</strong>
              <span>volumes officiels</span>
            </div>
          </div>
          {analysis.summary.errors > 0 && (
            <div className="alert alert-danger" style={{ marginBottom: 12 }}>
              <XCircle size={17} />
              <div className="alert-body">
                <span className="alert-title">Corrigez les lignes en erreur puis réimportez le fichier.</span> L&apos;enregistrement est bloqué tant qu&apos;il reste une erreur, pour ne pas importer des disponibilités incomplètes.
              </div>
            </div>
          )}
          <div className="segmented" role="group" aria-label="Filtrer les lignes" style={{ marginBottom: 10 }}>
            {(
              [
                ["all", `Toutes (${analysis.rows.length})`],
                ["error", `Erreurs (${analysis.summary.errors})`],
                ["warning", `Avertissements (${analysis.summary.warnings})`],
                ["valid", `Valides (${analysis.summary.valid})`],
              ] as [RowFilter, string][]
            ).map(([id, label]) => (
              <button key={id} type="button" aria-pressed={filter === id} onClick={() => setFilter(id)}>
                {label}
              </button>
            ))}
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Onglet</th>
                  <th className="num">Ligne</th>
                  <th>Statut</th>
                  <th>Contenu</th>
                  <th>Motif</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={`${r.sheet}-${r.line}`} className={`report-row is-${r.status}`}>
                    <td className="nowrap">{r.sheet === "teachers" ? "Professeurs" : "Volumes"}</td>
                    <td className="num">{r.line}</td>
                    <td className="nowrap">
                      {r.status === "error" ? (
                        <span className="status-pill is-over">
                          <XCircle size={13} /> Erreur
                        </span>
                      ) : r.status === "warning" ? (
                        <span className="status-pill is-missing">
                          <AlertTriangle size={13} /> À vérifier
                        </span>
                      ) : (
                        <span className="status-pill is-ok">
                          <CheckCircle2 size={13} /> Valide
                        </span>
                      )}
                    </td>
                    <td style={{ fontSize: 12.5, maxWidth: 360 }}>{r.cells.filter(Boolean).join(" · ")}</td>
                    <td>
                      <div className="report-msgs">
                        {r.errors.map((m, i) => (
                          <span key={`e${i}`} className="err">
                            {m}
                          </span>
                        ))}
                        {r.warnings.map((m, i) => (
                          <span key={`w${i}`} className="warn">
                            {m}
                          </span>
                        ))}
                        {!r.errors.length && !r.warnings.length && <span className="muted">—</span>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section aria-labelledby="ov-teachers" style={{ marginBottom: 18 }}>
        <h2 id="ov-teachers" className="card-title">
          Professeurs ({overview?.teachers.length ?? "…"})
        </h2>
        <div className="table-wrap">
          {!overview ? (
            <TableSkeleton columns={4} rows={5} />
          ) : overview.teachers.length === 0 ? (
            <EmptyState title="Aucun professeur">Ajoutez d&apos;abord le personnel enseignant.</EmptyState>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Professeur</th>
                  <th className="num">Service max</th>
                  <th>Habilitations</th>
                  <th>Disponibilités</th>
                </tr>
              </thead>
              <tbody>
                {overview.teachers.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <div className="cell-main">{t.name}</div>
                      <div className="cell-sub">{t.matricule ?? "sans matricule"}</div>
                    </td>
                    <td className="num">{t.maxHours != null ? formatHours(t.maxHours) : "—"}</td>
                    <td style={{ fontSize: 12.5 }}>
                      {t.qualifications.length === 0 ? (
                        <span style={{ color: "var(--danger)" }}>Aucune habilitation</span>
                      ) : (
                        Object.entries(
                          t.qualifications.reduce<Record<string, string[]>>((acc, q) => ({ ...acc, [q.subject]: [...(acc[q.subject] ?? []), q.scope] }), {}),
                        ).map(([subject, scopes]) => (
                          <div key={subject}>
                            <strong>{subject}</strong> · {scopes.join(", ")}
                          </div>
                        ))
                      )}
                    </td>
                    <td style={{ fontSize: 12.5 }}>
                      {t.availability.length === 0 ? (
                        <span className="muted">Aucune restriction</span>
                      ) : (
                        Object.entries(
                          t.availability.reduce<Record<number, string[]>>((acc, w) => ({ ...acc, [w.dayOfWeek]: [...(acc[w.dayOfWeek] ?? []), `${w.startTime}–${w.endTime}`] }), {}),
                        ).map(([day, ranges]) => (
                          <div key={day}>
                            <strong>{DAY_NAMES[Number(day)].slice(0, 3)}</strong> {ranges.join(", ")}
                          </div>
                        ))
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <section aria-labelledby="ov-volumes">
        <h2 id="ov-volumes" className="card-title">
          Volumes horaires officiels
        </h2>
        {!overview ? (
          <div className="table-wrap">
            <TableSkeleton columns={4} rows={4} />
          </div>
        ) : volumesByLevel.length === 0 ? (
          <div className="card">
            <EmptyState title="Aucun volume officiel">Importez l&apos;onglet « Volumes horaires officiels » du modèle.</EmptyState>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 320px), 1fr))", gap: 12 }}>
            {volumesByLevel.map(([level, list]) => (
              <div key={level} className="card" style={{ padding: 14, minWidth: 0, overflowX: "auto" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
                  <strong>{level}</strong>
                  <span className="muted tabular" style={{ fontSize: 12.5 }}>
                    {formatHours(list.reduce((s, v) => s + v.hours, 0))} / semaine
                  </span>
                </div>
                <table style={{ fontSize: 12.5, width: "100%", minWidth: 0 }}>
                  <thead>
                    <tr>
                      <th>Matière</th>
                      <th className="num">h/sem.</th>
                      <th className="num">Séance max</th>
                      <th className="num">Coef.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((v) => (
                      <tr key={v.subject}>
                        <td>{v.subject}</td>
                        <td className="num">{formatHours(v.hours)}</td>
                        <td className="num">{v.maxSessionHours ? formatHours(v.maxSessionHours) : "—"}</td>
                        <td className="num">{v.coefficient ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}

export default function PlanningPage() {
  return (
    <Shell title="Emplois du temps · Professeurs & volumes">
      <PlanningContent />
    </Shell>
  );
}

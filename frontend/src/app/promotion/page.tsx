"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowRight, CalendarPlus, CheckCircle2, LoaderCircle } from "lucide-react";
import Shell from "../../components/Shell";
import { EmptyState, FormError, Modal, PageHeader, TableSkeleton, useFeedback } from "../../components/ui";
import { api, errorMessage } from "../../lib/api";

interface Year {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  status: "PREPARATION" | "OUVERTE" | "CLOTUREE" | "ARCHIVEE";
}
interface ClassRow {
  id: string;
  name: string;
  level: string;
  _count: { enrollments: number };
}
type Outcome = "ADMIS" | "REDOUBLE" | "ORIENTE" | "SORTANT";
interface Preview {
  class: { id: string; name: string; level: string; year: string };
  toYear: { id: string; name: string };
  lastLevel: boolean;
  targets: { up: { id: string | null; name: string } | null; same: { id: string | null; name: string } };
  classes: { id: string; name: string; level: string }[];
  students: { id: string; matricule: string; firstName: string; lastName: string; annualAverage: number | null; councilDecision: string | null; proposed: Outcome | null; alreadyIn: string | null }[];
}
interface Summary {
  from: string;
  toYear: string;
  admitted: number;
  repeating: number;
  oriented: number;
  leaving: number;
  skipped: number;
  undecided: number;
  classesToCreate: string[];
}

const YEAR_STATUS: Record<Year["status"], { label: string; badge: string }> = {
  PREPARATION: { label: "En préparation", badge: "badge-neutral" },
  OUVERTE: { label: "Ouverte", badge: "badge-green" },
  CLOTUREE: { label: "Clôturée", badge: "badge-warning" },
  ARCHIVEE: { label: "Archivée", badge: "badge-neutral" },
};
const OUTCOMES: Record<Outcome, string> = { ADMIS: "Admis en classe supérieure", REDOUBLE: "Redouble", ORIENTE: "Orienté vers une autre classe", SORTANT: "Quitte l'établissement" };

function PromotionContent() {
  const feedback = useFeedback();
  const [years, setYears] = useState<Year[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [yearForm, setYearForm] = useState<{ name: string; startDate: string; endDate: string } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [fromYear, setFromYear] = useState("");
  const [toYear, setToYear] = useState("");
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [classId, setClassId] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [choices, setChoices] = useState<Record<string, { outcome: Outcome | ""; toClassId: string }>>({});
  const [plan, setPlan] = useState<Summary | null>(null);
  const [busy, setBusy] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);

  const loadYears = useCallback(() => {
    api
      .get<Year[]>("/academic-years")
      .then((list) => {
        setYears(list);
        setError(null);
        const current = list.find((y) => y.isCurrent);
        setFromYear((v) => v || current?.id || "");
      })
      .catch((err) => setError(errorMessage(err)));
  }, []);
  useEffect(loadYears, [loadYears]);

  useEffect(() => {
    setClassId("");
    setPreview(null);
    if (!fromYear) return;
    api
      .get<ClassRow[]>(`/classes?academicYearId=${fromYear}`)
      .then(setClasses)
      .catch(() => setClasses([]));
  }, [fromYear]);

  // The proposals are loaded once the class and the destination year are chosen
  useEffect(() => {
    setPreview(null);
    setPlan(null);
    setRunError(null);
    if (!classId || !toYear) return;
    api
      .get<Preview>(`/promotion/preview?classId=${classId}&toYearId=${toYear}`)
      .then((p) => {
        setPreview(p);
        setChoices(Object.fromEntries(p.students.map((s) => [s.id, { outcome: s.alreadyIn ? "" : (s.proposed ?? ""), toClassId: "" }])));
      })
      .catch((err) => setRunError(errorMessage(err)));
  }, [classId, toYear]);

  const setStatus = async (y: Year, status: Year["status"], done: string) => {
    try {
      await api.patch(`/academic-years/${y.id}/status`, { status });
      feedback.success(done, y.name);
      loadYears();
    } catch (err) {
      feedback.error("Changement impossible", errorMessage(err));
    }
  };
  const close = async (y: Year) => {
    const yes = await feedback.confirm({ title: `Clôturer l'année ${y.name} ?`, message: "Ses notes, ses appels et ses inscriptions ne pourront plus être modifiés. Tout reste consultable, et l'année peut être rouverte par la direction.", confirmLabel: "Clôturer", tone: "warning" });
    if (yes) await setStatus(y, "CLOTUREE", "Année clôturée");
  };
  const makeCurrent = async (y: Year) => {
    try {
      await api.patch(`/academic-years/${y.id}/set-current`);
      feedback.success("Année en cours modifiée", y.name);
      loadYears();
    } catch (err) {
      feedback.error("Changement impossible", errorMessage(err));
    }
  };

  const createYear = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!yearForm) return;
    setFormError(null);
    try {
      await api.post("/academic-years", yearForm);
      feedback.success("Année scolaire créée", `${yearForm.name} : en préparation, avec trois trimestres.`);
      setYearForm(null);
      loadYears();
    } catch (err) {
      setFormError(errorMessage(err));
    }
  };
  const suggestYear = () => {
    const last = (years ?? []).reduce((max, y) => Math.max(max, new Date(y.startDate).getFullYear()), new Date().getFullYear() - 1);
    setYearForm({ name: `${last + 1}-${last + 2}`, startDate: `${last + 1}-09-15`, endDate: `${last + 2}-06-30` });
    setFormError(null);
  };

  const decisions = () =>
    Object.entries(choices)
      .filter(([, c]) => c.outcome)
      .map(([studentId, c]) => ({ studentId, outcome: c.outcome as Outcome, ...(c.toClassId ? { toClassId: c.toClassId } : {}) }));

  const run = async (confirm: boolean) => {
    setBusy(true);
    setRunError(null);
    try {
      const res = await api.post<{ executed: boolean; summary: Summary }>("/promotion/run", { classId, toYearId: toYear, decisions: decisions(), confirm });
      if (res.executed) {
        feedback.success("Passage exécuté", `${res.summary.from} → ${res.summary.toYear}`);
        setPlan(null);
        setClassId("");
      } else setPlan(res.summary);
    } catch (err) {
      setRunError(errorMessage(err));
      setPlan(null);
    } finally {
      setBusy(false);
    }
  };

  const destinations = (years ?? []).filter((y) => y.id !== fromYear && (y.status === "OUVERTE" || y.status === "PREPARATION"));

  return (
    <>
      <PageHeader
        title="Années scolaires et passage"
        description="Préparez l'année suivante, faites passer les élèves classe par classe, puis clôturez l'année écoulée. L'historique de chaque élève est conservé."
        actions={
          <button type="button" className="btn btn-primary" onClick={suggestYear}>
            <CalendarPlus size={16} /> Nouvelle année
          </button>
        }
      />

      <div className="table-wrap" style={{ marginBottom: 24 }}>
        {error ? (
          <EmptyState tone="error" title="Années indisponibles">
            {error}
          </EmptyState>
        ) : !years ? (
          <TableSkeleton columns={4} rows={2} />
        ) : (
          <table>
            <thead>
              <tr>
                <th>Année scolaire</th>
                <th>Période</th>
                <th>État</th>
                <th className="actions">
                  <span className="visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {years.map((y) => (
                <tr key={y.id}>
                  <td>
                    <span className="cell-main">{y.name}</span> {y.isCurrent && <span className="badge badge-info">En cours</span>}
                  </td>
                  <td className="tabular">
                    {new Date(y.startDate).toLocaleDateString("fr-FR")} – {new Date(y.endDate).toLocaleDateString("fr-FR")}
                  </td>
                  <td>
                    <span className={`badge ${YEAR_STATUS[y.status].badge}`}>{YEAR_STATUS[y.status].label}</span>
                  </td>
                  <td className="actions">
                    {y.status === "PREPARATION" && (
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => setStatus(y, "OUVERTE", "Année ouverte")}>
                        Ouvrir
                      </button>
                    )}
                    {y.status === "OUVERTE" && !y.isCurrent && (
                      <button type="button" className="btn btn-outline btn-sm" onClick={() => makeCurrent(y)}>
                        Définir comme année en cours
                      </button>
                    )}
                    {y.status === "OUVERTE" && (
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => close(y)} aria-label={`Clôturer l'année ${y.name}`}>
                        Clôturer
                      </button>
                    )}
                    {y.status === "CLOTUREE" && (
                      <>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setStatus(y, "OUVERTE", "Année rouverte")}>
                          Rouvrir
                        </button>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setStatus(y, "ARCHIVEE", "Année archivée")} aria-label={`Archiver l'année ${y.name}`}>
                          Archiver
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <h2 className="section-title">Passage en classe supérieure</h2>
      <div className="form-grid" style={{ marginBottom: 14 }}>
        <div className="field">
          <label htmlFor="pr-from">Année de départ</label>
          <select id="pr-from" className="input" value={fromYear} onChange={(e) => setFromYear(e.target.value)}>
            {(years ?? []).map((y) => (
              <option key={y.id} value={y.id}>
                {y.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="pr-class">Classe</label>
          <select id="pr-class" className="input" value={classId} onChange={(e) => setClassId(e.target.value)}>
            <option value="">Choisir une classe…</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c._count.enrollments} élèves)
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="pr-to">Année d&apos;arrivée</label>
          <select id="pr-to" className="input" value={toYear} onChange={(e) => setToYear(e.target.value)}>
            <option value="">Choisir…</option>
            {destinations.map((y) => (
              <option key={y.id} value={y.id}>
                {y.name}
              </option>
            ))}
          </select>
          {years && destinations.length === 0 && <span className="field-hint">Créez d&apos;abord l&apos;année suivante avec « Nouvelle année ».</span>}
        </div>
      </div>
      <FormError message={runError} />

      {preview && (
        <>
          <p className="muted" style={{ marginBottom: 10 }}>
            {preview.class.name} ({preview.class.year}) <ArrowRight size={14} style={{ verticalAlign: "-2px" }} />{" "}
            {preview.targets.up ? `${preview.targets.up.name}${preview.targets.up.id ? "" : " (classe à créer)"}` : "dernier niveau : les admis quittent l'établissement"} en {preview.toYear.name}. Les propositions viennent de la décision du conseil de classe, sinon de la moyenne annuelle : vérifiez-les avant de valider.
          </p>
          <div className="table-wrap">
            {preview.students.length === 0 ? (
              <EmptyState title="Aucun élève dans cette classe" />
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Élève</th>
                    <th className="num">Moyenne annuelle</th>
                    <th>Conseil de classe</th>
                    <th>Décision de passage</th>
                    <th>Classe d&apos;arrivée</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.students.map((s) => {
                    const c = choices[s.id] ?? { outcome: "", toClassId: "" };
                    const usual = c.outcome === "ADMIS" ? preview.targets.up?.name : c.outcome === "REDOUBLE" ? preview.targets.same.name : null;
                    return (
                      <tr key={s.id}>
                        <td>
                          <div className="cell-main">
                            {s.lastName} {s.firstName}
                          </div>
                          <div className="cell-sub">{s.matricule}</div>
                        </td>
                        <td className="num">{s.annualAverage != null ? s.annualAverage.toLocaleString("fr-FR", { minimumFractionDigits: 2 }) : "—"}</td>
                        <td>{s.councilDecision ?? <span className="muted">—</span>}</td>
                        <td>
                          {s.alreadyIn ? (
                            <span className="badge badge-green">Déjà en {s.alreadyIn}</span>
                          ) : (
                            <select className="input input-sm" aria-label={`Décision pour ${s.firstName} ${s.lastName}`} value={c.outcome} onChange={(e) => { setChoices({ ...choices, [s.id]: { outcome: e.target.value as Outcome | "", toClassId: "" } }); setPlan(null); }}>
                              <option value="">À décider</option>
                              {(Object.keys(OUTCOMES) as Outcome[])
                                .filter((o) => o !== "ADMIS" || !preview.lastLevel)
                                .map((o) => (
                                  <option key={o} value={o}>
                                    {OUTCOMES[o]}
                                  </option>
                                ))}
                            </select>
                          )}
                        </td>
                        <td>
                          {!s.alreadyIn && c.outcome && c.outcome !== "SORTANT" && (
                            <select className="input input-sm" aria-label={`Classe d'arrivée de ${s.firstName} ${s.lastName}`} value={c.toClassId} onChange={(e) => { setChoices({ ...choices, [s.id]: { ...c, toClassId: e.target.value } }); setPlan(null); }}>
                              <option value="">{usual ?? "Choisir une classe…"}</option>
                              {preview.classes.map((k) => (
                                <option key={k.id} value={k.id}>
                                  {k.name}
                                </option>
                              ))}
                            </select>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <button type="button" className="btn btn-secondary" disabled={busy || decisions().length === 0} onClick={() => run(false)}>
              {busy ? <LoaderCircle size={16} className="spin" /> : null} Vérifier le passage
            </button>
          </div>
        </>
      )}

      <Modal
        open={!!plan}
        onClose={() => setPlan(null)}
        busy={busy}
        title="Valider le passage"
        footer={
          <>
            <button type="button" className="btn btn-outline" onClick={() => setPlan(null)} disabled={busy}>
              Revenir aux décisions
            </button>
            <button type="button" className="btn btn-primary" onClick={() => run(true)} disabled={busy}>
              {busy ? <LoaderCircle size={16} className="spin" /> : <CheckCircle2 size={16} />} Exécuter le passage
            </button>
          </>
        }
      >
        {plan && (
          <>
            <p>
              <strong>{plan.from}</strong> vers l&apos;année <strong>{plan.toYear}</strong> :
            </p>
            <ul className="plain-list">
              <li>{plan.admitted} élève(s) admis en classe supérieure</li>
              <li>{plan.repeating} redoublant(s)</li>
              <li>{plan.oriented} élève(s) orienté(s) vers une autre classe</li>
              <li>{plan.leaving} élève(s) quittant l&apos;établissement</li>
              {plan.skipped > 0 && <li>{plan.skipped} élève(s) déjà placé(s) en {plan.toYear} : inchangés</li>}
              {plan.undecided > 0 && <li>{plan.undecided} élève(s) sans décision : ils restent où ils sont et pourront être traités plus tard</li>}
            </ul>
            {plan.classesToCreate.length > 0 && <p>Classe(s) créée(s) en {plan.toYear} : {plan.classesToCreate.join(", ")}.</p>}
            <p className="field-hint">Les inscriptions de l&apos;année écoulée, les notes et les bulletins sont conservés.</p>
          </>
        )}
      </Modal>

      <Modal
        open={!!yearForm}
        onClose={() => setYearForm(null)}
        title="Nouvelle année scolaire"
        footer={
          <>
            <button type="button" className="btn btn-outline" onClick={() => setYearForm(null)}>
              Annuler
            </button>
            <button type="submit" form="year-form" className="btn btn-primary">
              Créer
            </button>
          </>
        }
      >
        {yearForm && (
          <form id="year-form" onSubmit={createYear}>
            <FormError message={formError} />
            <div className="field">
              <label htmlFor="yr-name" className="required">
                Nom
              </label>
              <input id="yr-name" className="input" required value={yearForm.name} onChange={(e) => setYearForm({ ...yearForm, name: e.target.value })} />
            </div>
            <div className="form-grid">
              <div className="field">
                <label htmlFor="yr-start" className="required">
                  Début
                </label>
                <input id="yr-start" type="date" className="input" required value={yearForm.startDate} onChange={(e) => setYearForm({ ...yearForm, startDate: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor="yr-end" className="required">
                  Fin
                </label>
                <input id="yr-end" type="date" className="input" required value={yearForm.endDate} onChange={(e) => setYearForm({ ...yearForm, endDate: e.target.value })} />
              </div>
            </div>
            <p className="field-hint">L&apos;année est créée « en préparation » avec trois trimestres : vous pouvez y créer des classes et y faire passer les élèves avant de l&apos;ouvrir.</p>
          </form>
        )}
      </Modal>
    </>
  );
}

export default function PromotionPage() {
  return (
    <Shell title="Années & passage">
      <PromotionContent />
    </Shell>
  );
}

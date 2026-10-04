"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, CheckCircle2, LoaderCircle, Mic, MicOff, Sparkles, Trash2 } from "lucide-react";
import Shell from "../../components/Shell";
import { EmptyState, FormError, PageHeader, useFeedback } from "../../components/ui";
import { api, authorizedFetch, errorMessage } from "../../lib/api";
import { getStoredUser } from "../../lib/auth";

type Mode = "roll" | "marks" | "sheet";
type Status = "PRESENT" | "ABSENT" | "RETARD";
interface Pupil {
  id: string;
  firstName: string;
  lastName: string;
}
interface ClassRow {
  id: string;
  name: string;
}
interface ClassDetail {
  id: string;
  academicYearId: string;
  enrollments: { student: Pupil }[];
  classSubjects: { subject: { id: string; name: string } }[];
}
interface Row {
  key: number;
  heard: string;
  studentId: string;
  status: Status;
  score: string;
  confidence: "SURE" | "A_VERIFIER" | "INCONNU";
  issue: string | null;
}
interface Proposal {
  rows: { heard: string; studentId: string | null; status?: Status; score?: number | null; confidence: Row["confidence"]; issue: string | null }[];
  notMentioned: { studentId: string; name: string }[];
}

const MODES: { id: Mode; label: string; needsMarks: boolean }[] = [
  { id: "roll", label: "Appel vocal", needsMarks: false },
  { id: "marks", label: "Notes dictées", needsMarks: true },
  { id: "sheet", label: "Notes sur photo", needsMarks: true },
];
const GRADE_TYPES: Record<string, string> = { DEVOIR: "Devoir", INTERROGATION: "Interrogation", COMPOSITION: "Composition", EXAMEN: "Examen", ORAL: "Oral", TP: "TP", PROJET: "Projet" };
const STATUSES: Record<Status, string> = { PRESENT: "Présent", ABSENT: "Absent", RETARD: "En retard" };
const BADGE: Record<Row["confidence"], { label: string; badge: string }> = {
  SURE: { label: "Reconnu", badge: "badge-green" },
  A_VERIFIER: { label: "À vérifier", badge: "badge-warning" },
  INCONNU: { label: "Non reconnu", badge: "badge-danger" },
};

// The Web Speech API is not in the TypeScript DOM library
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: { resultIndex: number; results: { isFinal: boolean; 0: { transcript: string } }[] }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
}
const recognitionClass = () => {
  if (typeof window === "undefined") return undefined;
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
};

function QuickEntryContent() {
  const feedback = useFeedback();
  const canMark = ["SUPER_ADMIN", "ADMIN_ORGANISATION", "DIRECTOR", "ENSEIGNANT"].includes(getStoredUser()?.role ?? "");
  const [mode, setMode] = useState<Mode>("roll");
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [classId, setClassId] = useState("");
  const [detail, setDetail] = useState<ClassDetail | null>(null);
  const [terms, setTerms] = useState<{ id: string; name: string; academicYearId: string }[]>([]);
  const [marks, setMarks] = useState({ subjectId: "", termId: "", type: "INTERROGATION", maxScore: "20" });
  const [imageReading, setImageReading] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [listening, setListening] = useState(false);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [notMentioned, setNotMentioned] = useState<Proposal["notMentioned"]>([]);
  const [fillPresent, setFillPresent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognition = useRef<Recognition | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const speech = recognitionClass();

  useEffect(() => {
    api.get<ClassRow[]>("/classes").then(setClasses).catch(() => setClasses([]));
    api.get<{ image: boolean }>("/smart-entry/capabilities").then((c) => setImageReading(c.image)).catch(() => {});
    api
      .get<{ id: string; isCurrent: boolean; terms: { id: string; name: string }[] }[]>("/academic-years")
      .then((years) => setTerms(years.flatMap((y) => y.terms.map((t) => ({ ...t, academicYearId: y.id })))))
      .catch(() => setTerms([]));
  }, []);

  useEffect(() => {
    setDetail(null);
    setRows(null);
    setError(null);
    if (!classId) return;
    api
      .get<ClassDetail>(`/classes/${classId}`)
      .then((d) => {
        setDetail(d);
        setMarks((m) => ({ ...m, subjectId: d.classSubjects[0]?.subject.id ?? "", termId: "" }));
      })
      .catch((err) => setError(errorMessage(err)));
  }, [classId]);

  const classTerms = useMemo(() => terms.filter((t) => t.academicYearId === detail?.academicYearId), [terms, detail]);
  const pupils = useMemo(() => (detail?.enrollments ?? []).map((e) => e.student), [detail]);

  const stopListening = () => {
    recognition.current?.stop();
    setListening(false);
  };
  useEffect(() => () => recognition.current?.stop(), []);

  const listen = () => {
    if (!speech) return;
    if (listening) return stopListening();
    const r = new speech();
    r.lang = "fr-FR";
    r.continuous = true;
    r.interimResults = false;
    r.onresult = (e) => {
      let said = "";
      for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) said += `${e.results[i][0].transcript} `;
      if (said) setTranscript((t) => `${t}${t && !t.endsWith(" ") ? " " : ""}${said}`);
    };
    r.onend = () => setListening(false);
    r.onerror = () => {
      setListening(false);
      setError("Le micro n'a pas pu être utilisé. Autorisez-le dans le navigateur, ou saisissez le texte à la main.");
    };
    recognition.current = r;
    setError(null);
    r.start();
    setListening(true);
  };

  const show = (p: Proposal) => {
    setRows(p.rows.map((r, i) => ({ key: i, heard: r.heard, studentId: r.studentId ?? "", status: r.status ?? "PRESENT", score: r.score != null ? String(r.score) : "", confidence: r.confidence, issue: r.issue })));
    setNotMentioned(p.notMentioned);
    setFillPresent(false);
  };

  const analyse = async () => {
    stopListening();
    setBusy(true);
    setError(null);
    try {
      show(await api.post<Proposal>(mode === "roll" ? "/smart-entry/roll-call/parse" : "/smart-entry/marks/parse", { classId, transcript, ...(mode === "marks" ? { maxScore: Number(marks.maxScore) || 20 } : {}) }));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const readSheet = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("classId", classId);
      body.append("maxScore", marks.maxScore || "20");
      body.append("file", file);
      const res = await authorizedFetch(api.fileUrl("/smart-entry/marks/image"), { method: "POST", body });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(Array.isArray(json?.message) ? json.message.join(", ") : json?.message || `Erreur ${res.status}`);
      show(json as Proposal);
    } catch (err) {
      setError(err instanceof Error ? err.message : errorMessage(err));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const update = (key: number, patch: Partial<Row>) => setRows((list) => (list ?? []).map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const taken = new Set((rows ?? []).map((r) => r.studentId).filter(Boolean));
  const duplicates = (rows ?? []).filter((r) => r.studentId && (rows ?? []).filter((x) => x.studentId === r.studentId).length > 1).length > 0;
  const max = Number(marks.maxScore) || 20;
  const scoreOf = (r: Row) => Number(r.score.replace(",", "."));
  const incomplete = (rows ?? []).some((r) => !r.studentId || (mode !== "roll" && (r.score.trim() === "" || Number.isNaN(scoreOf(r)) || scoreOf(r) < 0 || scoreOf(r) > max)));
  const blocked = !rows?.length || incomplete || duplicates || (mode !== "roll" && (!marks.subjectId || !marks.termId));

  const validate = async () => {
    if (!rows) return;
    setBusy(true);
    setError(null);
    try {
      if (mode === "roll") {
        const records = [...rows.map((r) => ({ studentId: r.studentId, status: r.status })), ...(fillPresent ? notMentioned.filter((p) => !taken.has(p.studentId)).map((p) => ({ studentId: p.studentId, status: "PRESENT" as Status })) : [])];
        await api.post("/attendance/mark", { classId, date: new Date().toISOString().slice(0, 10), records });
        feedback.success("Appel enregistré", `${records.length} élève(s)`);
      } else {
        await api.post("/grades", { classId, subjectId: marks.subjectId, termId: marks.termId, type: marks.type, maxScore: max, records: rows.map((r) => ({ studentId: r.studentId, score: scoreOf(r) })) });
        feedback.success("Notes enregistrées", `${rows.length} note(s)`);
      }
      setRows(null);
      setTranscript("");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const modes = MODES.filter((m) => !m.needsMarks || canMark);

  return (
    <>
      <PageHeader title="Saisie rapide" description="Dictez l'appel ou les notes, ou photographiez une feuille de notes. L'application propose, vous vérifiez, puis vous validez : rien n'est enregistré avant votre validation." />

      <div className="tabs" role="tablist" style={{ marginBottom: 14 }}>
        {modes.map((m) => (
          <button key={m.id} type="button" role="tab" className="tab" aria-selected={mode === m.id} onClick={() => { setMode(m.id); setRows(null); setError(null); }}>
            {m.label}
          </button>
        ))}
      </div>

      <div className="form-grid">
        <div className="field">
          <label htmlFor="qe-class" className="required">
            Classe
          </label>
          <select id="qe-class" className="input" value={classId} onChange={(e) => setClassId(e.target.value)}>
            <option value="">Choisir une classe…</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        {mode !== "roll" && (
          <>
            <div className="field">
              <label htmlFor="qe-subject" className="required">
                Matière
              </label>
              <select id="qe-subject" className="input" value={marks.subjectId} onChange={(e) => setMarks({ ...marks, subjectId: e.target.value })}>
                <option value="">Choisir…</option>
                {(detail?.classSubjects ?? []).map((s) => (
                  <option key={s.subject.id} value={s.subject.id}>
                    {s.subject.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="qe-term" className="required">
                Période
              </label>
              <select id="qe-term" className="input" value={marks.termId} onChange={(e) => setMarks({ ...marks, termId: e.target.value })}>
                <option value="">Choisir…</option>
                {classTerms.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="qe-type">Évaluation</label>
              <select id="qe-type" className="input" value={marks.type} onChange={(e) => setMarks({ ...marks, type: e.target.value })}>
                {Object.entries(GRADE_TYPES).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="qe-max">Barème</label>
              <input id="qe-max" className="input" type="number" min={1} max={100} value={marks.maxScore} onChange={(e) => setMarks({ ...marks, maxScore: e.target.value })} />
            </div>
          </>
        )}
      </div>

      {classId && mode !== "sheet" && (
        <div className="field">
          <label htmlFor="qe-text">{mode === "roll" ? "Ce que vous dites (« Alice Kouassi présente. Paul Yao absent. »)" : "Ce que vous dites (« Alice 15, Paul 12 virgule 5, Marc 17 »)"}</label>
          <textarea id="qe-text" className="input" rows={4} value={transcript} onChange={(e) => setTranscript(e.target.value)} placeholder={speech ? "Appuyez sur « Dicter », ou écrivez ici." : "La dictée n'est pas disponible dans ce navigateur : écrivez ici, ou utilisez Chrome ou Edge."} />
          <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
            {speech && (
              <button type="button" className={`btn ${listening ? "btn-primary" : "btn-outline"}`} onClick={listen} aria-pressed={listening}>
                {listening ? <MicOff size={16} /> : <Mic size={16} />} {listening ? "Arrêter la dictée" : "Dicter"}
              </button>
            )}
            <button type="button" className="btn btn-secondary" disabled={busy || transcript.trim().length < 2} onClick={analyse}>
              {busy ? <LoaderCircle size={16} className="spin" /> : <Sparkles size={16} />} Analyser
            </button>
          </div>
          {listening && (
            <span className="field-hint" role="status">
              Écoute en cours… La reconnaissance vocale est assurée par votre navigateur.
            </span>
          )}
        </div>
      )}

      {classId && mode === "sheet" && (
        <div className="field">
          <label htmlFor="qe-file">Photo ou scan de la feuille de notes (JPEG, PNG ou PDF, 6 Mo maximum)</label>
          <input id="qe-file" ref={fileRef} type="file" className="input" accept="image/jpeg,image/png,application/pdf" capture="environment" disabled={busy || !imageReading} onChange={(e) => readSheet(e.target.files?.[0])} />
          <span className="field-hint">
            {imageReading ? (
              <>
                <Camera size={13} style={{ verticalAlign: "-2px" }} /> La feuille est lue par un service d&apos;intelligence artificielle externe : les noms et les notes qui y figurent lui sont transmis. Chaque ligne vous est ensuite soumise.
              </>
            ) : (
              "La lecture d'image n'est pas configurée sur ce serveur. Utilisez les notes dictées, l'import Excel ou la saisie manuelle."
            )}
          </span>
          {busy && (
            <span className="field-hint" role="status">
              Lecture de la feuille en cours…
            </span>
          )}
        </div>
      )}

      <FormError message={error} />

      {rows && (
        <>
          <h2 className="section-title">Vérifiez avant de valider</h2>
          {rows.length === 0 ? (
            <EmptyState title="Rien n'a été reconnu">{mode === "roll" ? "Dites le nom de l'élève suivi de « présent », « absent » ou « en retard »." : "Dites ou écrivez le nom de l'élève suivi de sa note."}</EmptyState>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Entendu / lu</th>
                    <th>Élève</th>
                    <th>{mode === "roll" ? "Statut" : `Note / ${max}`}</th>
                    <th>Contrôle</th>
                    <th className="actions">
                      <span className="visually-hidden">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.key}>
                      <td>{r.heard}</td>
                      <td>
                        <select className="input input-sm" aria-label={`Élève correspondant à ${r.heard}`} value={r.studentId} onChange={(e) => update(r.key, { studentId: e.target.value, confidence: e.target.value ? "SURE" : "INCONNU", issue: e.target.value ? null : r.issue })}>
                          <option value="">Choisir l&apos;élève…</option>
                          {pupils.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.lastName} {p.firstName}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        {mode === "roll" ? (
                          <select className="input input-sm" aria-label={`Statut de ${r.heard}`} value={r.status} onChange={(e) => update(r.key, { status: e.target.value as Status })}>
                            {(Object.keys(STATUSES) as Status[]).map((s) => (
                              <option key={s} value={s}>
                                {STATUSES[s]}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input className="input input-sm" inputMode="decimal" style={{ width: 90 }} aria-label={`Note de ${r.heard}`} value={r.score} onChange={(e) => update(r.key, { score: e.target.value })} />
                        )}
                      </td>
                      <td>
                        <span className={`badge ${BADGE[r.confidence].badge}`}>{BADGE[r.confidence].label}</span>
                        {r.issue && <div className="cell-sub">{r.issue}</div>}
                      </td>
                      <td className="actions">
                        <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => setRows(rows.filter((x) => x.key !== r.key))} aria-label={`Retirer la ligne ${r.heard}`}>
                          <Trash2 size={15} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {notMentioned.filter((p) => !taken.has(p.studentId)).length > 0 && (
            <p className="muted" style={{ marginTop: 10 }}>
              Élèves non cités : {notMentioned.filter((p) => !taken.has(p.studentId)).map((p) => p.name).join(", ")}.
            </p>
          )}
          {mode === "roll" && notMentioned.length > 0 && (
            <label className="checkbox">
              <input type="checkbox" checked={fillPresent} onChange={(e) => setFillPresent(e.target.checked)} />
              Marquer présents les élèves non cités
            </label>
          )}
          {duplicates && (
            <p className="field-error" role="alert">
              Un élève figure sur plusieurs lignes : gardez-en une seule.
            </p>
          )}
          <div style={{ marginTop: 14 }}>
            <button type="button" className="btn btn-primary" disabled={busy || blocked} onClick={validate}>
              {busy ? <LoaderCircle size={16} className="spin" /> : <CheckCircle2 size={16} />} {mode === "roll" ? "Valider l'appel" : "Valider les notes"}
            </button>
            {rows.length > 0 && incomplete && <span className="field-hint" style={{ marginLeft: 10 }}>Complétez ou retirez les lignes à vérifier pour pouvoir valider.</span>}
          </div>
        </>
      )}
    </>
  );
}

export default function QuickEntryPage() {
  return (
    <Shell title="Saisie rapide">
      <QuickEntryContent />
    </Shell>
  );
}

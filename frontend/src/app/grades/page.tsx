"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { BookOpen, FileDown, LoaderCircle, Save } from "lucide-react";
import Shell from "../../components/Shell";
import { Avatar, EmptyState, PageHeader, TableSkeleton, useFeedback } from "../../components/ui";
import { api, errorMessage } from "../../lib/api";
import { downloadFile } from "../../lib/download";

interface ClassOption {
  id: string;
  name: string;
}

interface SubjectOption {
  id: string;
  name: string;
}

interface TermOption {
  id: string;
  name: string;
  order: number;
}

interface AcademicYear {
  id: string;
  name: string;
  isCurrent: boolean;
  terms: TermOption[];
}

interface EnrolledStudent {
  student: { id: string; firstName: string; lastName: string; matricule: string };
}

interface ClassDetail {
  id: string;
  enrollments: EnrolledStudent[];
}

const GRADE_TYPES = [
  { value: "DEVOIR", label: "Devoir" },
  { value: "INTERROGATION", label: "Interrogation" },
  { value: "COMPOSITION", label: "Composition" },
  { value: "EXAMEN", label: "Examen" },
];

function scoreError(value: string | undefined): string | null {
  if (value === undefined || value === "") return null;
  const n = Number(value.replace(",", "."));
  if (Number.isNaN(n)) return "Nombre attendu";
  if (n < 0 || n > 20) return "Entre 0 et 20";
  return null;
}

export default function GradesPage() {
  const feedback = useFeedback();
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [subjects, setSubjects] = useState<SubjectOption[]>([]);
  const [terms, setTerms] = useState<TermOption[]>([]);
  const [classId, setClassId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [termId, setTermId] = useState("");
  const [type, setType] = useState("DEVOIR");
  const [students, setStudents] = useState<EnrolledStudent[] | null>(null);
  const [scores, setScores] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.get<ClassOption[]>("/classes"), api.get<SubjectOption[]>("/subjects"), api.get<AcademicYear[]>("/academic-years")])
      .then(([cls, subs, years]) => {
        setClasses(cls);
        if (cls[0]) setClassId(cls[0].id);
        setSubjects(subs);
        if (subs[0]) setSubjectId(subs[0].id);
        const current = years.find((y) => y.isCurrent) || years[0];
        if (current) {
          setTerms(current.terms);
          if (current.terms[0]) setTermId(current.terms[0].id);
        }
      })
      .catch((err) => setError(errorMessage(err)));
  }, []);

  useEffect(() => {
    if (!classId) return;
    setStudents(null);
    setScores({});
    api
      .get<ClassDetail>(`/classes/${classId}`)
      .then((c) => setStudents(c.enrollments))
      .catch((err) => setError(errorMessage(err)));
  }, [classId]);

  const filled = useMemo(() => Object.values(scores).filter((v) => v !== "").length, [scores]);
  const invalid = useMemo(() => Object.values(scores).some((v) => scoreError(v)), [scores]);
  const average = useMemo(() => {
    const values = Object.values(scores).filter((v) => v !== "" && !scoreError(v)).map((v) => Number(v.replace(",", ".")));
    return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
  }, [scores]);

  const save = async () => {
    if (!students) return;
    const records = students
      .filter((e) => scores[e.student.id] !== undefined && scores[e.student.id] !== "")
      .map((e) => ({ studentId: e.student.id, score: Number(scores[e.student.id].replace(",", ".")) }));
    if (records.length === 0) {
      feedback.toast({ kind: "warning", title: "Aucune note saisie" });
      return;
    }
    setSaving(true);
    try {
      await api.post("/grades", { classId, subjectId, termId, type, records });
      const subject = subjects.find((s) => s.id === subjectId)?.name ?? "";
      feedback.success(`${records.length} note(s) enregistrée(s)`, `${subject} · ${GRADE_TYPES.find((t) => t.value === type)?.label}`);
      setScores({});
    } catch (err) {
      feedback.error("Enregistrement impossible", errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const downloadBulletin = async (student: EnrolledStudent["student"]) => {
    if (!termId) return;
    setDownloading(student.id);
    try {
      await downloadFile(`/bulletins/${student.id}/${termId}/pdf`, `bulletin-${student.matricule}.pdf`);
    } catch (err) {
      feedback.error("Bulletin indisponible", errorMessage(err));
    } finally {
      setDownloading(null);
    }
  };

  return (
    <Shell title="Notes & bulletins">
      <PageHeader
        title="Saisie des notes"
        description="Choisissez l'évaluation, saisissez les notes sur 20, puis téléchargez les bulletins."
        actions={
          <Link className="btn btn-outline" href="/grades/council">
            Conseil de classe
          </Link>
        }
      />

      <div className="filter-bar">
        <div className="filter-item">
          <label htmlFor="gr-class">Classe</label>
          <select id="gr-class" className="input" value={classId} onChange={(e) => setClassId(e.target.value)}>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="filter-item">
          <label htmlFor="gr-subject">Matière</label>
          <select id="gr-subject" className="input" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div className="filter-item">
          <label htmlFor="gr-term">Période</label>
          <select id="gr-term" className="input" value={termId} onChange={(e) => setTermId(e.target.value)}>
            {terms.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        <div className="filter-item">
          <label htmlFor="gr-type">Évaluation</label>
          <select id="gr-type" className="input" value={type} onChange={(e) => setType(e.target.value)}>
            {GRADE_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="table-wrap" style={{ marginBottom: 16 }}>
        {error ? (
          <EmptyState tone="error" title="Chargement impossible">
            {error}
          </EmptyState>
        ) : !students ? (
          <TableSkeleton columns={3} rows={8} />
        ) : students.length === 0 ? (
          <EmptyState icon={<BookOpen size={22} />} title="Aucun élève dans cette classe" />
        ) : (
          <table>
            <thead>
              <tr>
                <th>Élève</th>
                <th>Note / 20</th>
                <th className="actions">Bulletin</th>
              </tr>
            </thead>
            <tbody>
              {students.map((e, index) => {
                const err = scoreError(scores[e.student.id]);
                return (
                  <tr key={e.student.id}>
                    <td>
                      <div className="cell-person">
                        <Avatar name={`${e.student.firstName} ${e.student.lastName}`} size="sm" />
                        <div>
                          <div className="cell-main">
                            {e.student.lastName} {e.student.firstName}
                          </div>
                          <div className="cell-sub">{e.student.matricule}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <input
                        inputMode="decimal"
                        className="input"
                        style={{ maxWidth: 96 }}
                        aria-label={`Note de ${e.student.firstName} ${e.student.lastName}`}
                        aria-invalid={!!err}
                        placeholder="—"
                        value={scores[e.student.id] ?? ""}
                        onChange={(ev) => setScores((s) => ({ ...s, [e.student.id]: ev.target.value }))}
                        onKeyDown={(ev) => {
                          // Enter moves to the next student, like a spreadsheet.
                          if (ev.key === "Enter") {
                            ev.preventDefault();
                            const inputs = document.querySelectorAll<HTMLInputElement>("input[inputmode=decimal]");
                            inputs[index + 1]?.focus();
                          }
                        }}
                      />
                      {err && <div className="field-error">{err}</div>}
                    </td>
                    <td className="actions">
                      <button className="btn btn-outline btn-sm" onClick={() => downloadBulletin(e.student)} disabled={!termId || downloading === e.student.id}>
                        {downloading === e.student.id ? <LoaderCircle size={14} className="spin" /> : <FileDown size={14} />} PDF
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {students && students.length > 0 && (
        <div className="save-bar">
          <span className="muted" style={{ fontSize: 13 }}>
            {filled}/{students.length} note(s) saisie(s){average !== null && ` · moyenne ${average.toLocaleString("fr-FR", { maximumFractionDigits: 2 })}/20`}
          </span>
          <button className="btn btn-primary" onClick={save} disabled={saving || invalid || filled === 0}>
            {saving ? <LoaderCircle size={16} className="spin" /> : <Save size={16} />} Enregistrer les notes
          </button>
        </div>
      )}
    </Shell>
  );
}

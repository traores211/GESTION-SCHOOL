"use client";

import { useEffect, useState } from "react";
import Shell from "../../components/Shell";
import { api, ApiError } from "../../lib/api";
import { getToken } from "../../lib/auth";

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

export default function GradesPage() {
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [subjects, setSubjects] = useState<SubjectOption[]>([]);
  const [terms, setTerms] = useState<TermOption[]>([]);
  const [classId, setClassId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [termId, setTermId] = useState("");
  const [type, setType] = useState("DEVOIR");
  const [students, setStudents] = useState<EnrolledStudent[]>([]);
  const [scores, setScores] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<ClassOption[]>("/classes").then((cls) => {
      setClasses(cls);
      if (cls[0]) setClassId(cls[0].id);
    });
    api.get<SubjectOption[]>("/subjects").then((subs) => {
      setSubjects(subs);
      if (subs[0]) setSubjectId(subs[0].id);
    });
    api.get<AcademicYear[]>("/academic-years").then((years) => {
      const current = years.find((y) => y.isCurrent) || years[0];
      if (current) {
        setTerms(current.terms);
        if (current.terms[0]) setTermId(current.terms[0].id);
      }
    });
  }, []);

  useEffect(() => {
    if (!classId) return;
    api.get<ClassDetail>(`/classes/${classId}`).then((c) => setStudents(c.enrollments));
  }, [classId]);

  const setScore = (studentId: string, value: string) => setScores((s) => ({ ...s, [studentId]: value }));

  const save = async () => {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const records = students
        .filter((e) => scores[e.student.id] !== undefined && scores[e.student.id] !== "")
        .map((e) => ({ studentId: e.student.id, score: Number(scores[e.student.id]) }));
      if (records.length === 0) {
        setError("Saisissez au moins une note.");
        return;
      }
      await api.post("/grades", { classId, subjectId, termId, type, records });
      setMessage(`${records.length} note(s) enregistrée(s).`);
      setScores({});
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur lors de l'enregistrement");
    } finally {
      setSaving(false);
    }
  };

  const downloadBulletin = (studentId: string) => {
    if (!termId) return;
    const token = getToken();
    const url = api.fileUrl(`/bulletins/${studentId}/${termId}/pdf`);
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => res.blob())
      .then((blob) => {
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = "bulletin.pdf";
        link.click();
      });
  };

  return (
    <Shell title="Notes & Bulletins">
      <div className="page-header">
        <div>
          <h1>Saisie des notes</h1>
          <p>Enregistrez les notes puis générez les bulletins de la classe</p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16, display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div className="field" style={{ marginBottom: 0, minWidth: 180 }}>
          <label>Classe</label>
          <select className="input" value={classId} onChange={(e) => setClassId(e.target.value)}>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="field" style={{ marginBottom: 0, minWidth: 180 }}>
          <label>Matière</label>
          <select className="input" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
            {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div className="field" style={{ marginBottom: 0, minWidth: 160 }}>
          <label>Période</label>
          <select className="input" value={termId} onChange={(e) => setTermId(e.target.value)}>
            {terms.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div className="field" style={{ marginBottom: 0, minWidth: 160 }}>
          <label>Type d&apos;évaluation</label>
          <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
            {GRADE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
      </div>

      {message && <p className="text-green" style={{ marginBottom: 12 }}>{message}</p>}
      {error && <p className="text-danger" style={{ marginBottom: 12 }}>{error}</p>}

      <div className="table-wrap" style={{ marginBottom: 16 }}>
        <table>
          <thead>
            <tr>
              <th>Matricule</th>
              <th>Élève</th>
              <th>Note / 20</th>
              <th>Bulletin</th>
            </tr>
          </thead>
          <tbody>
            {students.map((e) => (
              <tr key={e.student.id}>
                <td>{e.student.matricule}</td>
                <td>{e.student.lastName} {e.student.firstName}</td>
                <td>
                  <input
                    type="number"
                    min={0}
                    max={20}
                    step={0.5}
                    className="input"
                    style={{ maxWidth: 100 }}
                    value={scores[e.student.id] ?? ""}
                    onChange={(ev) => setScore(e.student.id, ev.target.value)}
                  />
                </td>
                <td>
                  <button className="btn btn-outline btn-sm" onClick={() => downloadBulletin(e.student.id)} disabled={!termId}>
                    📄 PDF
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {students.length === 0 && <div className="empty-state">Aucun élève dans cette classe.</div>}
      </div>

      <button className="btn btn-primary" onClick={save} disabled={saving || students.length === 0}>
        {saving ? "Enregistrement…" : "💾 Enregistrer les notes"}
      </button>
    </Shell>
  );
}

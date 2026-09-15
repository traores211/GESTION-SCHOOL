"use client";

import { useEffect, useState } from "react";
import Shell from "../../components/Shell";
import { api, ApiError } from "../../lib/api";

interface ClassOption {
  id: string;
  name: string;
}

interface EnrolledStudent {
  student: { id: string; firstName: string; lastName: string; matricule: string };
}

interface ClassDetail {
  id: string;
  enrollments: EnrolledStudent[];
}

interface AttendanceRecord {
  id: string;
  studentId: string;
  status: string;
}

const STATUS_OPTIONS = [
  { value: "PRESENT", label: "Présent", badge: "badge-green" },
  { value: "ABSENT", label: "Absent", badge: "badge-danger" },
  { value: "RETARD", label: "Retard", badge: "badge-warning" },
  { value: "ABSENCE_JUSTIFIEE", label: "Absence justifiée", badge: "badge-info" },
];

export default function AttendancePage() {
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [classId, setClassId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [students, setStudents] = useState<EnrolledStudent[]>([]);
  const [marks, setMarks] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<ClassOption[]>("/classes").then((cls) => {
      setClasses(cls);
      if (cls[0]) setClassId(cls[0].id);
    });
  }, []);

  useEffect(() => {
    if (!classId) return;
    api.get<ClassDetail>(`/classes/${classId}`).then((c) => setStudents(c.enrollments));
    api
      .get<AttendanceRecord[]>(`/attendance?classId=${classId}&date=${date}`)
      .then((records) => {
        const initial: Record<string, string> = {};
        records.forEach((r) => (initial[r.studentId] = r.status));
        setMarks(initial);
      })
      .catch(() => setMarks({}));
  }, [classId, date]);

  const setMark = (studentId: string, status: string) => setMarks((m) => ({ ...m, [studentId]: status }));

  const save = async () => {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const records = students.map((e) => ({
        studentId: e.student.id,
        status: marks[e.student.id] || "PRESENT",
      }));
      await api.post("/attendance/mark", { classId, date, records });
      setMessage("Présence enregistrée avec succès.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur lors de l'enregistrement");
    } finally {
      setSaving(false);
    }
  };

  const markAllPresent = () => {
    const all: Record<string, string> = {};
    students.forEach((e) => (all[e.student.id] = "PRESENT"));
    setMarks(all);
  };

  return (
    <Shell title="Présence">
      <div className="page-header">
        <div>
          <h1>Appel du jour</h1>
          <p>Pointage de présence par classe</p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16, display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div className="field" style={{ marginBottom: 0, minWidth: 220 }}>
          <label>Classe</label>
          <select className="input" value={classId} onChange={(e) => setClassId(e.target.value)}>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Date</label>
          <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <button className="btn btn-outline" onClick={markAllPresent}>Tout marquer présent</button>
      </div>

      {message && <p className="text-green" style={{ marginBottom: 12 }}>{message}</p>}
      {error && <p className="text-danger" style={{ marginBottom: 12 }}>{error}</p>}

      <div className="table-wrap" style={{ marginBottom: 16 }}>
        <table>
          <thead>
            <tr>
              <th>Matricule</th>
              <th>Élève</th>
              <th>Statut</th>
            </tr>
          </thead>
          <tbody>
            {students.map((e) => (
              <tr key={e.student.id}>
                <td>{e.student.matricule}</td>
                <td>{e.student.lastName} {e.student.firstName}</td>
                <td>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {STATUS_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        className={`badge ${opt.badge}`}
                        style={{
                          border: "none",
                          cursor: "pointer",
                          opacity: (marks[e.student.id] || "PRESENT") === opt.value ? 1 : 0.35,
                        }}
                        onClick={() => setMark(e.student.id, opt.value)}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {students.length === 0 && <div className="empty-state">Aucun élève dans cette classe.</div>}
      </div>

      <button className="btn btn-primary" onClick={save} disabled={saving || students.length === 0}>
        {saving ? "Enregistrement…" : "💾 Enregistrer la présence"}
      </button>
    </Shell>
  );
}

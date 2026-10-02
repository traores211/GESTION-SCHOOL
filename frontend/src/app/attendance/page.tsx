"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCheck, ClipboardCheck, LoaderCircle, Save } from "lucide-react";
import Shell from "../../components/Shell";
import { Avatar, EmptyState, PageHeader, TableSkeleton, useFeedback } from "../../components/ui";
import { api, errorMessage } from "../../lib/api";

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
  { value: "PRESENT", label: "Présent", short: "P", badge: "badge-green" },
  { value: "ABSENT", label: "Absent", short: "A", badge: "badge-danger" },
  { value: "RETARD", label: "Retard", short: "R", badge: "badge-warning" },
  { value: "ABSENCE_JUSTIFIEE", label: "Justifiée", short: "J", badge: "badge-info" },
];

const todayIso = () => new Date().toISOString().slice(0, 10);

export default function AttendancePage() {
  const feedback = useFeedback();
  const [classes, setClasses] = useState<ClassOption[] | null>(null);
  const [classId, setClassId] = useState("");
  const [date, setDate] = useState(todayIso());
  const [students, setStudents] = useState<EnrolledStudent[] | null>(null);
  const [marks, setMarks] = useState<Record<string, string>>({});
  const [savedMarks, setSavedMarks] = useState<Record<string, string>>({});
  const [alreadyTaken, setAlreadyTaken] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<ClassOption[]>("/classes")
      .then((cls) => {
        setClasses(cls);
        if (cls[0]) setClassId(cls[0].id);
      })
      .catch((err) => setError(errorMessage(err)));
  }, []);

  useEffect(() => {
    if (!classId) return;
    setStudents(null);
    Promise.all([api.get<ClassDetail>(`/classes/${classId}`), api.get<AttendanceRecord[]>(`/attendance?classId=${classId}&date=${date}`).catch(() => [])])
      .then(([c, records]) => {
        setStudents(c.enrollments);
        const initial: Record<string, string> = {};
        records.forEach((r) => (initial[r.studentId] = r.status));
        setMarks(initial);
        setSavedMarks(initial);
        setAlreadyTaken(records.length > 0);
        setError(null);
      })
      .catch((err) => setError(errorMessage(err)));
  }, [classId, date]);

  const statusOf = (id: string) => marks[id] || "PRESENT";
  const dirty = useMemo(() => (students ?? []).some((e) => statusOf(e.student.id) !== (savedMarks[e.student.id] || (alreadyTaken ? undefined : "PRESENT"))), [students, marks, savedMarks, alreadyTaken]); // eslint-disable-line react-hooks/exhaustive-deps
  const summary = useMemo(() => {
    const counts: Record<string, number> = Object.fromEntries(STATUS_OPTIONS.map((o) => [o.value, 0]));
    (students ?? []).forEach((e) => (counts[statusOf(e.student.id)] += 1));
    return counts;
  }, [students, marks]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    if (!students) return;
    setSaving(true);
    try {
      const records = students.map((e) => ({ studentId: e.student.id, status: statusOf(e.student.id) }));
      await api.post("/attendance/mark", { classId, date, records });
      const snapshot = Object.fromEntries(records.map((r) => [r.studentId, r.status]));
      setSavedMarks(snapshot);
      setMarks(snapshot);
      setAlreadyTaken(true);
      const absents = summary.ABSENT + summary.RETARD;
      feedback.success("Appel enregistré", absents ? `${summary.ABSENT} absent(s), ${summary.RETARD} retard(s)` : "Tous les élèves sont présents");
    } catch (err) {
      feedback.error("Enregistrement impossible", errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const markAll = (status: string) => setMarks(Object.fromEntries((students ?? []).map((e) => [e.student.id, status])));
  const className = classes?.find((c) => c.id === classId)?.name ?? "";

  return (
    <Shell title="Présence">
      <PageHeader
        title="Appel"
        description="Tous les élèves sont présents par défaut : ne cochez que les absences et les retards."
      />

      <div className="filter-bar">
        <div className="filter-item">
          <label htmlFor="att-class">Classe</label>
          <select id="att-class" className="input" value={classId} onChange={(e) => setClassId(e.target.value)} disabled={!classes}>
            {classes?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="filter-item">
          <label htmlFor="att-date">Date</label>
          <input id="att-date" type="date" className="input" max={todayIso()} value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="filter-actions">
          <button className="btn btn-outline btn-sm" onClick={() => markAll("PRESENT")} disabled={!students?.length}>
            <CheckCheck size={15} /> Tout présent
          </button>
        </div>
      </div>

      {alreadyTaken && !dirty && (
        <div className="alert alert-success" style={{ marginBottom: 12 }}>
          <ClipboardCheck size={16} />
          <div className="alert-body">L&apos;appel de la {className} a déjà été fait pour cette date. Vous pouvez le corriger.</div>
        </div>
      )}

      {students && students.length > 0 && (
        <div className="btn-row" style={{ marginBottom: 12 }} aria-live="polite">
          {STATUS_OPTIONS.map((o) => (
            <span key={o.value} className={`badge ${o.badge}`}>
              {o.label} : {summary[o.value]}
            </span>
          ))}
        </div>
      )}

      <div className="table-wrap" style={{ marginBottom: 16 }}>
        {error ? (
          <EmptyState tone="error" title="Chargement impossible">
            {error}
          </EmptyState>
        ) : !students ? (
          <TableSkeleton columns={3} rows={8} />
        ) : students.length === 0 ? (
          <EmptyState icon={<ClipboardCheck size={22} />} title="Aucun élève dans cette classe" />
        ) : (
          <table className="att-table">
            <thead>
              <tr>
                <th>Élève</th>
                <th>Présence</th>
              </tr>
            </thead>
            <tbody>
              {students.map((e) => {
                const status = statusOf(e.student.id);
                return (
                  <tr key={e.student.id} style={{ background: status === "ABSENT" ? "var(--danger-light)" : status === "RETARD" ? "var(--warning-light)" : undefined }}>
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
                      <div className="segmented" role="radiogroup" aria-label={`Présence de ${e.student.firstName} ${e.student.lastName}`}>
                        {STATUS_OPTIONS.map((opt) => (
                          <button
                            key={opt.value}
                            type="button"
                            role="radio"
                            aria-checked={status === opt.value}
                            aria-pressed={status === opt.value}
                            onClick={() => setMarks((m) => ({ ...m, [e.student.id]: opt.value }))}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
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
            {dirty ? "Modifications non enregistrées" : alreadyTaken ? "Appel enregistré" : "Appel non encore enregistré"}
          </span>
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? <LoaderCircle size={16} className="spin" /> : <Save size={16} />} Enregistrer l&apos;appel
          </button>
        </div>
      )}
    </Shell>
  );
}

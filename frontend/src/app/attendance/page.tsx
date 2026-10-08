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

interface JustificationRequest {
  id: string;
  date: string;
  justificationRequest: string;
  student: { firstName: string; lastName: string; matricule: string };
  class: { name: string };
}

import { OFFLINE_QUEUE_EVENT } from "../../components/OfflineSync";
import { isNetworkFailure, queueRollCall, recall, remember } from "../../lib/offline";

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
  const [requests, setRequests] = useState<JustificationRequest[]>([]);

  const loadRequests = () => api.get<JustificationRequest[]>("/attendance/justifications").then(setRequests).catch(() => setRequests([]));

  /** Accepts (the absence becomes justified) or refuses the reason a parent sent from the portal. */
  const decide = async (r: JustificationRequest, accept: boolean) => {
    try {
      if (accept) await api.patch(`/attendance/${r.id}/justify`, { justification: r.justificationRequest });
      else await api.patch(`/attendance/${r.id}/refuse-justification`);
      feedback.success(accept ? "Absence justifiée" : "Justificatif refusé", `${r.student.firstName} ${r.student.lastName} · ${new Date(r.date).toLocaleDateString("fr-FR")}`);
      loadRequests();
    } catch (err) {
      feedback.error("Action impossible", errorMessage(err));
    }
  };

  useEffect(() => {
    loadRequests();
    api
      .get<ClassOption[]>("/classes")
      .then((cls) => {
        remember("classes", cls);
        setClasses(cls);
        if (cls[0]) setClassId(cls[0].id);
      })
      .catch((err) => {
        // No network: the classes seen last time are enough to take the roll call.
        const cached = isNetworkFailure(err) ? recall<ClassOption[]>("classes") : null;
        if (!cached) return setError(errorMessage(err));
        setClasses(cached.value);
        if (cached.value[0]) setClassId(cached.value[0].id);
      });
  }, []);

  useEffect(() => {
    if (!classId) return;
    setStudents(null);
    Promise.all([api.get<ClassDetail>(`/classes/${classId}`), api.get<AttendanceRecord[]>(`/attendance?classId=${classId}&date=${date}`).catch(() => [])])
      .then(([c, records]) => {
        remember(`class:${classId}`, c);
        setStudents(c.enrollments);
        const initial: Record<string, string> = {};
        records.forEach((r) => (initial[r.studentId] = r.status));
        setMarks(initial);
        setSavedMarks(initial);
        setAlreadyTaken(records.length > 0);
        setError(null);
      })
      .catch((err) => {
        const cached = isNetworkFailure(err) ? recall<ClassDetail>(`class:${classId}`) : null;
        if (!cached) return setError(errorMessage(err));
        setStudents(cached.value.enrollments);
        setMarks({});
        setSavedMarks({});
        setAlreadyTaken(false);
        setError(null);
      });
  }, [classId, date]);

  const statusOf = (id: string) => marks[id] || "PRESENT";
  const dirty = useMemo(() => (students ?? []).some((e) => statusOf(e.student.id) !== (savedMarks[e.student.id] || (alreadyTaken ? undefined : "PRESENT"))), [students, marks, savedMarks, alreadyTaken]); // eslint-disable-line react-hooks/exhaustive-deps
  const summary = useMemo(() => {
    const counts: Record<string, number> = Object.fromEntries(STATUS_OPTIONS.map((o) => [o.value, 0]));
    (students ?? []).forEach((e) => (counts[statusOf(e.student.id)] += 1));
    return counts;
  }, [students, marks]); // eslint-disable-line react-hooks/exhaustive-deps

  const className = classes?.find((c) => c.id === classId)?.name ?? "";

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
      if (isNetworkFailure(err)) {
        // No network in the classroom: the roll call is kept on the device and sent later.
        const records = students.map((e) => ({ studentId: e.student.id, status: statusOf(e.student.id) }));
        queueRollCall({ classId, className, date, records });
        window.dispatchEvent(new Event(OFFLINE_QUEUE_EVENT));
        const snapshot = Object.fromEntries(records.map((r) => [r.studentId, r.status]));
        setSavedMarks(snapshot);
        setMarks(snapshot);
        setAlreadyTaken(true);
        feedback.toast({ kind: "warning", title: "Appel conservé sur cet appareil", message: "Pas de réseau : il sera envoyé automatiquement au retour de la connexion." });
      } else feedback.error("Enregistrement impossible", errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const markAll = (status: string) => setMarks(Object.fromEntries((students ?? []).map((e) => [e.student.id, status])));

  return (
    <Shell title="Présence">
      <PageHeader
        title="Appel"
        description="Tous les élèves sont présents par défaut : ne cochez que les absences et les retards."
      />

      {requests.length > 0 && (
        <section className="card" style={{ marginBottom: 20 }} aria-label="Justificatifs à traiter">
          <h2 className="card-title" style={{ marginBottom: 4 }}>
            Justificatifs envoyés par les parents ({requests.length})
          </h2>
          <p className="muted" style={{ marginBottom: 8 }}>
            Acceptez un motif pour que l&apos;absence devienne « justifiée » ; un refus est notifié à la famille.
          </p>
          {requests.map((r) => (
            <div key={r.id} className="att-request">
              <div>
                <strong>
                  {r.student.lastName} {r.student.firstName}
                </strong>{" "}
                <span className="muted">
                  {r.class.name} · absence du {new Date(r.date).toLocaleDateString("fr-FR")}
                </span>
                <div>{r.justificationRequest}</div>
              </div>
              <div className="att-request-actions">
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => decide(r, true)}>
                  Accepter
                </button>
                <button type="button" className="btn btn-outline btn-sm" onClick={() => decide(r, false)}>
                  Refuser
                </button>
              </div>
            </div>
          ))}
        </section>
      )}

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

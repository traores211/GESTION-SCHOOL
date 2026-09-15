"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Shell from "../../../components/Shell";
import { api, ApiError } from "../../../lib/api";

interface ClassDetail {
  id: string;
  name: string;
  level: string;
  capacity: number;
  teacher: { user: { firstName: string; lastName: string } } | null;
  enrollments: { student: { id: string; firstName: string; lastName: string; matricule: string } }[];
  classSubjects: { id: string; subject: { name: string }; coefficient: number; teacher: { user: { firstName: string; lastName: string } } | null }[];
}

interface StudentOption {
  id: string;
  firstName: string;
  lastName: string;
  matricule: string;
}

export default function ClassDetailPage() {
  const params = useParams<{ id: string }>();
  const [klass, setKlass] = useState<ClassDetail | null>(null);
  const [allStudents, setAllStudents] = useState<StudentOption[]>([]);
  const [selectedStudent, setSelectedStudent] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    if (!params?.id) return;
    api.get<ClassDetail>(`/classes/${params.id}`).then(setKlass).catch((err) => setError(err instanceof ApiError ? err.message : "Erreur"));
  };

  useEffect(() => {
    load();
    api.get<StudentOption[]>("/students").then(setAllStudents).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params?.id]);

  const enroll = async () => {
    if (!selectedStudent || !params?.id) return;
    await api.post(`/classes/${params.id}/enroll/${selectedStudent}`);
    setSelectedStudent("");
    load();
  };

  const unenroll = async (studentId: string) => {
    if (!params?.id) return;
    await api.post(`/classes/${params.id}/unenroll/${studentId}`);
    load();
  };

  const enrolledIds = new Set(klass?.enrollments.map((e) => e.student.id));
  const availableStudents = allStudents.filter((s) => !enrolledIds.has(s.id));

  return (
    <Shell title="Détail de la classe">
      {error && <p className="text-danger">{error}</p>}
      {klass && (
        <>
          <div className="page-header">
            <div>
              <h1>{klass.name}</h1>
              <p>
                {klass.level} — {klass.enrollments.length}/{klass.capacity} élèves —{" "}
                {klass.teacher ? `${klass.teacher.user.firstName} ${klass.teacher.user.lastName}` : "Aucun professeur principal"}
              </p>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16 }}>
            <div>
              <div className="table-wrap" style={{ marginBottom: 16 }}>
                <table>
                  <thead>
                    <tr>
                      <th>Matricule</th>
                      <th>Nom</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {klass.enrollments.map((e) => (
                      <tr key={e.student.id}>
                        <td>{e.student.matricule}</td>
                        <td>
                          <Link href={`/students/${e.student.id}`}>
                            {e.student.lastName} {e.student.firstName}
                          </Link>
                        </td>
                        <td>
                          <button className="btn btn-outline btn-sm" onClick={() => unenroll(e.student.id)}>
                            Retirer
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {klass.enrollments.length === 0 && <div className="empty-state">Aucun élève inscrit.</div>}
              </div>

              <div className="card">
                <h2 style={{ fontSize: 14, marginBottom: 10 }}>Inscrire un élève</h2>
                <div style={{ display: "flex", gap: 8 }}>
                  <select className="input" value={selectedStudent} onChange={(e) => setSelectedStudent(e.target.value)}>
                    <option value="">— Sélectionner un élève —</option>
                    {availableStudents.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.lastName} {s.firstName} ({s.matricule})
                      </option>
                    ))}
                  </select>
                  <button className="btn btn-primary" onClick={enroll} disabled={!selectedStudent}>
                    Inscrire
                  </button>
                </div>
              </div>
            </div>

            <div className="card">
              <h2 style={{ fontSize: 14, marginBottom: 10 }}>📚 Matières enseignées</h2>
              {klass.classSubjects.map((cs) => (
                <div key={cs.id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--border)" }}>
                  <span>{cs.subject.name}</span>
                  <span className="muted" style={{ fontSize: 12 }}>
                    {cs.teacher ? `${cs.teacher.user.firstName} ${cs.teacher.user.lastName}` : "-"} (coef. {cs.coefficient})
                  </span>
                </div>
              ))}
              {klass.classSubjects.length === 0 && <p className="muted">Aucune matière assignée.</p>}
            </div>
          </div>
        </>
      )}
    </Shell>
  );
}

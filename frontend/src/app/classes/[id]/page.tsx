"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { BookOpen, CalendarDays, LoaderCircle, UserMinus, UserPlus, Users } from "lucide-react";
import Shell from "../../../components/Shell";
import { Avatar, EmptyState, PageHeader, SearchInput, TableSkeleton, useFeedback } from "../../../components/ui";
import { api, errorMessage } from "../../../lib/api";
import { getStoredUser } from "../../../lib/auth";
import { searchKey } from "../../../lib/useTable";

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

const OFFICE = ["SUPER_ADMIN", "ADMIN_ORGANISATION", "DIRECTOR", "SECRETARY"];

export default function ClassDetailPage() {
  const params = useParams<{ id: string }>();
  const feedback = useFeedback();
  const canEnroll = OFFICE.includes(getStoredUser()?.role ?? "");
  const [klass, setKlass] = useState<ClassDetail | null>(null);
  const [allStudents, setAllStudents] = useState<StudentOption[]>([]);
  const [selectedStudent, setSelectedStudent] = useState("");
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!params?.id) return;
    api
      .get<ClassDetail>(`/classes/${params.id}`)
      .then(setKlass)
      .catch((err) => setError(errorMessage(err)));
  }, [params?.id]);

  useEffect(() => {
    load();
    if (canEnroll) api.get<StudentOption[]>("/students").then(setAllStudents).catch(() => {});
  }, [load, canEnroll]);

  const enrollStudent = async () => {
    if (!selectedStudent || !params?.id) return;
    const student = allStudents.find((s) => s.id === selectedStudent);
    setBusy("enroll");
    try {
      await api.post(`/classes/${params.id}/enroll/${selectedStudent}`);
      setSelectedStudent("");
      feedback.success("Élève inscrit", student ? `${student.firstName} ${student.lastName} rejoint la classe` : undefined);
      load();
    } catch (err) {
      feedback.error("Inscription impossible", errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const unenroll = async (student: StudentOption) => {
    if (!params?.id || !klass) return;
    const ok = await feedback.confirm({
      title: `Retirer ${student.firstName} ${student.lastName} de la ${klass.name} ?`,
      message: "L'élève n'apparaîtra plus dans les listes d'appel et de notes de cette classe. Son dossier, ses notes et ses absences sont conservés, et il peut être réinscrit.",
      confirmLabel: "Retirer de la classe",
    });
    if (!ok) return;
    setBusy(student.id);
    try {
      await api.post(`/classes/${params.id}/unenroll/${student.id}`);
      feedback.success("Élève retiré de la classe");
      load();
    } catch (err) {
      feedback.error("Retrait impossible", errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const enrolledIds = useMemo(() => new Set(klass?.enrollments.map((e) => e.student.id)), [klass]);
  const availableStudents = allStudents.filter((s) => !enrolledIds.has(s.id));
  const visible = (klass?.enrollments ?? []).filter((e) => searchKey(`${e.student.firstName} ${e.student.lastName} ${e.student.matricule}`).includes(searchKey(filter)));
  const full = klass ? klass.enrollments.length >= klass.capacity : false;

  return (
    <Shell title="Détail de la classe">
      {error ? (
        <div className="card">
          <EmptyState tone="error" title="Classe introuvable" action={<Link className="btn btn-outline" href="/classes">Retour aux classes</Link>}>
            {error}
          </EmptyState>
        </div>
      ) : !klass ? (
        <div className="card">
          <TableSkeleton columns={3} rows={6} />
        </div>
      ) : (
        <>
          <PageHeader
            breadcrumbs={[{ label: "Classes", href: "/classes" }, { label: klass.name }]}
            title={klass.name}
            description={`${klass.level} · ${klass.enrollments.length}/${klass.capacity} élèves · ${klass.teacher ? `Professeur principal : ${klass.teacher.user.firstName} ${klass.teacher.user.lastName}` : "Aucun professeur principal"}`}
            actions={
              <Link href={`/timetable?view=class&id=${klass.id}`} className="btn btn-outline">
                <CalendarDays size={16} /> Emploi du temps
              </Link>
            }
          />

          <div className="grid-main-side">
            <div className="stack">
              {canEnroll && (
                <div className="card">
                  <h2 className="card-title" style={{ marginBottom: 10 }}>
                    <UserPlus size={17} /> Inscrire un élève
                  </h2>
                  {full && <div className="alert alert-warning" style={{ marginBottom: 10 }}>La classe a atteint sa capacité ({klass.capacity} élèves).</div>}
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <select className="input" style={{ flex: "1 1 240px" }} aria-label="Élève à inscrire" value={selectedStudent} onChange={(e) => setSelectedStudent(e.target.value)}>
                      <option value="">— Sélectionner un élève ({availableStudents.length} disponibles) —</option>
                      {availableStudents.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.lastName} {s.firstName} ({s.matricule})
                        </option>
                      ))}
                    </select>
                    <button className="btn btn-primary" onClick={enrollStudent} disabled={!selectedStudent || busy === "enroll"}>
                      {busy === "enroll" ? <LoaderCircle size={16} className="spin" /> : <UserPlus size={16} />} Inscrire
                    </button>
                  </div>
                </div>
              )}

              <div className="table-wrap">
                <div style={{ padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <h2 className="card-title">
                    <Users size={17} /> Élèves ({klass.enrollments.length})
                  </h2>
                  {klass.enrollments.length > 8 && <SearchInput value={filter} onChange={setFilter} placeholder="Filtrer…" label="Filtrer les élèves" style={{ maxWidth: 240 }} />}
                </div>
                {klass.enrollments.length === 0 ? (
                  <EmptyState icon={<Users size={22} />} title="Aucun élève inscrit" />
                ) : (
                  <table>
                    <thead>
                      <tr>
                        <th>Élève</th>
                        <th>Matricule</th>
                        {canEnroll && (
                          <th className="actions">
                            <span className="visually-hidden">Actions</span>
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {visible.map((e) => (
                        <tr key={e.student.id}>
                          <td>
                            <div className="cell-person">
                              <Avatar name={`${e.student.firstName} ${e.student.lastName}`} size="sm" />
                              <Link href={`/students/${e.student.id}`} className="cell-main">
                                {e.student.lastName} {e.student.firstName}
                              </Link>
                            </div>
                          </td>
                          <td className="tabular">{e.student.matricule}</td>
                          {canEnroll && (
                            <td className="actions">
                              <button className="btn btn-danger-ghost btn-sm" onClick={() => unenroll(e.student)} disabled={busy === e.student.id}>
                                <UserMinus size={15} /> Retirer
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            <div className="card">
              <h2 className="card-title" style={{ marginBottom: 10 }}>
                <BookOpen size={17} /> Matières enseignées
              </h2>
              {klass.classSubjects.length === 0 && <p className="muted">Aucune matière assignée.</p>}
              {klass.classSubjects.map((cs) => (
                <div key={cs.id} className="list-row">
                  <span className="cell-main">{cs.subject.name}</span>
                  <span className="muted" style={{ fontSize: 12.5, textAlign: "right" }}>
                    {cs.teacher ? `${cs.teacher.user.firstName} ${cs.teacher.user.lastName}` : "Non attribuée"}
                    <br />
                    coef. {cs.coefficient}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </Shell>
  );
}

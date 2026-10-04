"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { BookOpen, CheckCircle2, ClipboardCheck, Mic, RefreshCw } from "lucide-react";
import Shell from "../Shell";
import { EmptyState, TableSkeleton } from "../ui";
import { api, errorMessage } from "../../lib/api";
import { getStoredUser } from "../../lib/auth";

interface TeacherData {
  term: { id: string; name: string } | null;
  classes: { id: string; name: string; level: string; pupils: number; mainTeacher: boolean; subjects: string[] }[];
  today: { id: string; start: string; end: string; classId: string; class: string; subject: string; room: string | null; rollCallTaken: boolean }[];
  rollCallsToTake: { classId: string; class: string }[];
  totals: { classes: number; pupils: number; lessonsToday: number; marksThisTerm: number; homeworkToCome: number };
}

/** What a teacher needs when he opens the application: his day, his classes, what is left to do. */
export default function TeacherDashboard() {
  const [data, setData] = useState<TeacherData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const firstName = getStoredUser()?.firstName ?? "";

  const load = useCallback(() => {
    setLoading(true);
    api
      .get<TeacherData>("/dashboard/teacher")
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  return (
    <Shell title="Tableau de bord">
      <div className="page-header">
        <div>
          <h1 className="greeting">Bonjour {firstName}</h1>
          <p className="greeting-date">{new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}{data?.term ? ` · ${data.term.name}` : ""}</p>
        </div>
        <div className="page-header-meta">
          <button type="button" className="btn btn-ghost btn-sm" onClick={load} disabled={loading}>
            <RefreshCw size={14} className={loading ? "spin" : undefined} /> Actualiser
          </button>
          <Link href="/attendance" className="btn btn-primary">
            <ClipboardCheck size={16} aria-hidden="true" /> Faire l&apos;appel
          </Link>
        </div>
      </div>

      {error ? (
        <EmptyState tone="error" title="Tableau de bord indisponible">
          {error}
        </EmptyState>
      ) : !data ? (
        <TableSkeleton columns={4} rows={4} />
      ) : (
        <>
          <div className="stat-row" style={{ marginBottom: 18 }}>
            {[
              ["Mes classes", data.totals.classes],
              ["Mes élèves", data.totals.pupils],
              ["Cours aujourd'hui", data.totals.lessonsToday],
              ["Notes saisies ce trimestre", data.totals.marksThisTerm],
              ["Devoirs à venir", data.totals.homeworkToCome],
            ].map(([label, value]) => (
              <div className="card" key={label as string} style={{ padding: "12px 16px" }}>
                <div className="cell-sub">{label}</div>
                <div className="tabular" style={{ fontSize: 24, fontWeight: 600 }}>
                  {value}
                </div>
              </div>
            ))}
          </div>

          {data.rollCallsToTake.length > 0 && (
            <div className="alert alert-warning" role="status" style={{ marginBottom: 16 }}>
              <div className="alert-body">
                <span className="alert-title">Appel à faire :</span> {data.rollCallsToTake.map((c) => c.class).join(", ")}. <Link href="/attendance">Faire l&apos;appel</Link> ou <Link href="/quick-entry">le dicter</Link>.
              </div>
            </div>
          )}

          <h2 className="section-title">Mes cours aujourd&apos;hui</h2>
          <div className="table-wrap" style={{ marginBottom: 22 }}>
            {data.today.length === 0 ? (
              <EmptyState title="Aucun cours à l'emploi du temps aujourd'hui" />
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Horaire</th>
                    <th>Classe</th>
                    <th>Matière</th>
                    <th>Salle</th>
                    <th>Appel</th>
                  </tr>
                </thead>
                <tbody>
                  {data.today.map((l) => (
                    <tr key={l.id}>
                      <td className="tabular">
                        {l.start} – {l.end}
                      </td>
                      <td>
                        <Link href={`/classes/${l.classId}`}>{l.class}</Link>
                      </td>
                      <td>{l.subject}</td>
                      <td>{l.room ?? <span className="muted">—</span>}</td>
                      <td>
                        {l.rollCallTaken ? (
                          <span className="badge badge-green">
                            <CheckCircle2 size={13} /> Fait
                          </span>
                        ) : (
                          <span className="badge badge-warning">À faire</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <h2 className="section-title">Mes classes</h2>
          <div className="table-wrap">
            {data.classes.length === 0 ? (
              <EmptyState title="Aucune classe ne vous est affectée">La direction vous affecte des classes et des matières depuis « Classes ».</EmptyState>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Classe</th>
                    <th className="num">Élèves</th>
                    <th>Mes matières</th>
                    <th className="actions">
                      <span className="visually-hidden">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.classes.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <Link href={`/classes/${c.id}`} className="cell-main">
                          {c.name}
                        </Link>{" "}
                        {c.mainTeacher && <span className="badge badge-info">Professeur principal</span>}
                      </td>
                      <td className="num">{c.pupils}</td>
                      <td>{c.subjects.join(", ") || <span className="muted">—</span>}</td>
                      <td className="actions">
                        <Link href="/grades" className="btn btn-outline btn-sm">
                          <BookOpen size={15} /> Notes
                        </Link>
                        <Link href="/quick-entry" className="btn btn-ghost btn-sm">
                          <Mic size={15} /> Saisie rapide
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </Shell>
  );
}

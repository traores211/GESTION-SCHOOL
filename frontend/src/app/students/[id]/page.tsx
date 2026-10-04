"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Shell from "../../../components/Shell";
import { EmptyState, PageHeader, TableSkeleton } from "../../../components/ui";
import { api, ApiError } from "../../../lib/api";
import { getStoredUser } from "../../../lib/auth";
import DocumentsPanel from "../../../components/DocumentsPanel";
import { downloadFile } from "../../../lib/download";
import { ATTENDANCE_STATUS, INVOICE_STATUS, STUDENT_STATUS, statusBadge } from "../../../lib/labels";

interface StudentDetail {
  id: string;
  matricule: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender: string;
  nationality?: string;
  address?: string;
  phone?: string;
  status: string;
  placeOfBirth?: string;
  countryOfOrigin?: string;
  city?: string;
  country?: string;
  email?: string;
  regime?: string;
  entryDate?: string;
  previousSchool?: string;
  previousClass?: string;
  previousAverage?: number | null;
  parents: { id: string; firstName: string; lastName: string; phone: string; phone2?: string | null; relationship: string; relation: string; isLegalGuardian: boolean; isEmergencyContact: boolean; canPickUp: boolean }[];
  enrollments: { class: { id: string; name: string } }[];
  attendance: { id: string; date: string; status: string }[];
  attendanceStats: { status: string; _count: number }[];
  grades: { id: string; score: number; maxScore: number; subject: { name: string }; term: { name: string } }[];
  averageScore: number | null;
  invoices: {
    id: string;
    reference: string;
    label: string;
    totalAmount: number;
    status: string;
    payments: { amount: number }[];
  }[];
}

function formatFCFA(amount: number) {
  return new Intl.NumberFormat("fr-FR").format(Math.round(amount)) + " FCFA";
}

const RELATIONS: Record<string, string> = { PERE: "Père", MERE: "Mère", TUTEUR: "Tuteur", AUTRE: "Responsable" };
const REGIMES: Record<string, string> = { EXTERNE: "Externe", DEMI_PENSIONNAIRE: "Demi-pensionnaire", INTERNE: "Interne" };

const ATT_LABELS: Record<string, string> = {
  PRESENT: "Présences",
  ABSENT: "Absences",
  RETARD: "Retards",
  ABSENCE_JUSTIFIEE: "Absences justifiées",
};

export default function StudentDetailPage() {
  const params = useParams<{ id: string }>();
  const [student, setStudent] = useState<StudentDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"info" | "attendance" | "grades" | "billing" | "documents">("info");

  useEffect(() => {
    if (!params?.id) return;
    api
      .get<StudentDetail>(`/students/${params.id}`)
      .then(setStudent)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Erreur de chargement"));
  }, [params?.id]);

  return (
    <Shell title="Fiche élève">
      {error && (
        <div className="card">
          <EmptyState tone="error" title="Dossier introuvable">
            {error}
          </EmptyState>
        </div>
      )}
      {!student && !error && (
        <div className="card">
          <TableSkeleton rows={5} columns={2} />
        </div>
      )}

      {student && (
        <>
          <PageHeader
            breadcrumbs={[{ label: "Élèves", href: "/students" }, { label: `${student.firstName} ${student.lastName}` }]}
            title={`${student.firstName} ${student.lastName}`}
            description={`Matricule ${student.matricule} — ${student.enrollments[0]?.class?.name || "Non affecté"}`}
            actions={
              <>
                <span className={`badge ${statusBadge(STUDENT_STATUS, student.status).badge}`}>{statusBadge(STUDENT_STATUS, student.status).label}</span>
                {["SUPER_ADMIN", "ADMIN_ORGANISATION", "DIRECTOR"].includes(getStoredUser()?.role ?? "") && (
                  // Right of access: everything held on the pupil and the guardians, to hand to the family.
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => downloadFile(`/privacy/students/${student.id}/export`, `donnees-${student.matricule}.json`).catch(() => undefined)}>
                    Exporter les données
                  </button>
                )}
              </>
            }
          />

          <div className="tabs" role="tablist">
            <button type="button" role="tab" className="tab" aria-selected={tab === "info"} onClick={() => setTab("info")}>
              Informations
            </button>
            <button type="button" role="tab" className="tab" aria-selected={tab === "attendance"} onClick={() => setTab("attendance")}>
              Présence
            </button>
            <button type="button" role="tab" className="tab" aria-selected={tab === "grades"} onClick={() => setTab("grades")}>
              Notes
            </button>
            <button type="button" role="tab" className="tab" aria-selected={tab === "billing"} onClick={() => setTab("billing")}>
              Scolarité
            </button>
            <button type="button" role="tab" className="tab" aria-selected={tab === "documents"} onClick={() => setTab("documents")}>
              Documents
            </button>
          </div>

          {tab === "info" && (
            <div className="record-sheet">
              <div className="record-stub" aria-hidden="true">
                <span>Matricule</span>
                <strong>{student.matricule}</strong>
              </div>
              <section className="record-part" aria-labelledby="rec-id">
                <h2 id="rec-id">Identité</h2>
                <dl className="record-list">
                  <div>
                    <dt>Date de naissance</dt>
                    <dd className="tabular">{new Date(student.dateOfBirth).toLocaleDateString("fr-FR")}</dd>
                  </div>
                  <div>
                    <dt>Sexe</dt>
                    <dd>{student.gender}</dd>
                  </div>
                  <div>
                    <dt>Nationalité</dt>
                    <dd>{student.nationality || "—"}</dd>
                  </div>
                  <div>
                    <dt>Lieu de naissance</dt>
                    <dd>{student.placeOfBirth || "—"}</dd>
                  </div>
                  <div>
                    <dt>Pays d&apos;origine</dt>
                    <dd>{student.countryOfOrigin || "—"}</dd>
                  </div>
                  <div>
                    <dt>Adresse</dt>
                    <dd>{[student.address, student.city, student.country].filter(Boolean).join(", ") || "—"}</dd>
                  </div>
                  <div>
                    <dt>Téléphone</dt>
                    <dd className="tabular">{student.phone || "—"}</dd>
                  </div>
                </dl>
              </section>
              <section className="record-part" aria-labelledby="rec-school">
                <h2 id="rec-school">Scolarité</h2>
                <dl className="record-list">
                  <div>
                    <dt>Régime</dt>
                    <dd>{student.regime ? REGIMES[student.regime] || student.regime : "—"}</dd>
                  </div>
                  <div>
                    <dt>Date d&apos;entrée</dt>
                    <dd className="tabular">{student.entryDate ? new Date(student.entryDate).toLocaleDateString("fr-FR") : "—"}</dd>
                  </div>
                  <div>
                    <dt>Établissement précédent</dt>
                    <dd>{student.previousSchool || "—"}</dd>
                  </div>
                  <div>
                    <dt>Classe précédente</dt>
                    <dd>{student.previousClass || "—"}</dd>
                  </div>
                  <div>
                    <dt>Moyenne précédente</dt>
                    <dd className="tabular">{student.previousAverage != null ? `${student.previousAverage.toLocaleString("fr-FR")} / 20` : "—"}</dd>
                  </div>
                </dl>
              </section>
              <section className="record-part" aria-labelledby="rec-parents">
                <h2 id="rec-parents">Parents / tuteurs</h2>
                {student.parents.length === 0 && <p className="muted">Aucun parent renseigné.</p>}
                <dl className="record-list">
                  {student.parents.map((p) => (
                    <div key={p.id}>
                      <dt>{RELATIONS[p.relation] || p.relationship}</dt>
                      <dd>
                        {p.firstName} {p.lastName}
                        <span className="cell-sub tabular">{[p.phone, p.phone2].filter(Boolean).join(" · ")}</span>
                        <span className="cell-sub">
                          {p.isLegalGuardian && <span className="badge badge-neutral">Responsable légal</span>} {p.isEmergencyContact && <span className="badge badge-info">Contact d&apos;urgence</span>}{" "}
                          {!p.canPickUp && <span className="badge badge-warning">Ne récupère pas l&apos;enfant</span>}
                        </span>
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            </div>
          )}

          {tab === "attendance" && (
            <div>
              <div className="kpi-grid">
                {student.attendanceStats.map((s) => (
                  <div className="kpi-card" key={s.status}>
                    <div className="kpi-label">{ATT_LABELS[s.status] || s.status}</div>
                    <div className="kpi-value">{s._count}</div>
                  </div>
                ))}
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Statut</th>
                    </tr>
                  </thead>
                  <tbody>
                    {student.attendance.map((a) => (
                      <tr key={a.id}>
                        <td>{new Date(a.date).toLocaleDateString("fr-FR")}</td>
                        <td>
                          <span className={`badge ${statusBadge(ATTENDANCE_STATUS, a.status).badge}`}>{statusBadge(ATTENDANCE_STATUS, a.status).label}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === "grades" && (
            <div>
              {student.averageScore !== null && (
                <div className="kpi-grid kpi-grid-single">
                  <div className="kpi-card">
                    <div className="kpi-label">Moyenne générale (toutes notes)</div>
                    <div className="kpi-value">
                      {student.averageScore.toFixed(2)}
                      <span className="kpi-value-unit">/ 20</span>
                    </div>
                  </div>
                </div>
              )}
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Matière</th>
                      <th>Période</th>
                      <th className="num">Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {student.grades.map((g) => (
                      <tr key={g.id}>
                        <td>{g.subject.name}</td>
                        <td>{g.term.name}</td>
                        <td className="num">
                          {g.score} / {g.maxScore}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {student.grades.length === 0 && <div className="empty-state">Aucune note enregistrée.</div>}
              </div>
            </div>
          )}

          {tab === "documents" && <DocumentsPanel studentId={student.id} />}

          {tab === "billing" && (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th className="stub-cell">Référence</th>
                    <th>Libellé</th>
                    <th className="num">Montant</th>
                    <th className="num">Payé</th>
                    <th>Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {student.invoices.map((inv) => {
                    const paid = inv.payments.reduce((s, p) => s + p.amount, 0);
                    return (
                      <tr key={inv.id}>
                        <td className="stub-cell">{inv.reference}</td>
                        <td>{inv.label}</td>
                        <td className="num">{formatFCFA(inv.totalAmount)}</td>
                        <td className="num">{formatFCFA(paid)}</td>
                        <td>
                          <span className={`badge ${statusBadge(INVOICE_STATUS, inv.status).badge}`}>{statusBadge(INVOICE_STATUS, inv.status).label}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {student.invoices.length === 0 && <div className="empty-state">Aucune facture.</div>}
            </div>
          )}
        </>
      )}
    </Shell>
  );
}

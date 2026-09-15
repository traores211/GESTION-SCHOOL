"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Shell from "../../../components/Shell";
import { api, ApiError } from "../../../lib/api";

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
  parents: { id: string; firstName: string; lastName: string; phone: string; relationship: string }[];
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
  const [tab, setTab] = useState<"info" | "attendance" | "grades" | "billing">("info");

  useEffect(() => {
    if (!params?.id) return;
    api
      .get<StudentDetail>(`/students/${params.id}`)
      .then(setStudent)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Erreur de chargement"));
  }, [params?.id]);

  return (
    <Shell title="Fiche élève">
      {error && <p className="text-danger">{error}</p>}
      {!student && !error && <p className="muted">Chargement…</p>}

      {student && (
        <>
          <div className="page-header">
            <div>
              <h1>
                {student.firstName} {student.lastName}
              </h1>
              <p>
                Matricule {student.matricule} — {student.enrollments[0]?.class?.name || "Non affecté"}
              </p>
            </div>
            <span className="badge badge-green">{student.status}</span>
          </div>

          <div className="tabs">
            <div className={`tab${tab === "info" ? " active" : ""}`} onClick={() => setTab("info")}>
              Informations
            </div>
            <div className={`tab${tab === "attendance" ? " active" : ""}`} onClick={() => setTab("attendance")}>
              Présence
            </div>
            <div className={`tab${tab === "grades" ? " active" : ""}`} onClick={() => setTab("grades")}>
              Notes
            </div>
            <div className={`tab${tab === "billing" ? " active" : ""}`} onClick={() => setTab("billing")}>
              Scolarité
            </div>
          </div>

          {tab === "info" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div className="card">
                <h2 style={{ fontSize: 15, marginBottom: 12 }}>👤 Identité</h2>
                <p>
                  <strong>Date de naissance :</strong>{" "}
                  {new Date(student.dateOfBirth).toLocaleDateString("fr-FR")}
                </p>
                <p>
                  <strong>Sexe :</strong> {student.gender}
                </p>
                <p>
                  <strong>Nationalité :</strong> {student.nationality || "-"}
                </p>
                <p>
                  <strong>Adresse :</strong> {student.address || "-"}
                </p>
                <p>
                  <strong>Téléphone :</strong> {student.phone || "-"}
                </p>
              </div>
              <div className="card">
                <h2 style={{ fontSize: 15, marginBottom: 12 }}>👪 Parents / Tuteurs</h2>
                {student.parents.length === 0 && <p className="muted">Aucun parent renseigné.</p>}
                {student.parents.map((p) => (
                  <div key={p.id} style={{ marginBottom: 10 }}>
                    <p style={{ fontWeight: 700 }}>
                      {p.firstName} {p.lastName} <span className="muted">({p.relationship})</span>
                    </p>
                    <p className="muted" style={{ fontSize: 12.5 }}>
                      {p.phone}
                    </p>
                  </div>
                ))}
              </div>
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
                        <td>{a.status}</td>
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
                <div className="card" style={{ marginBottom: 16, display: "inline-block" }}>
                  <div className="kpi-label">Moyenne générale (toutes notes)</div>
                  <div className="kpi-value">{student.averageScore.toFixed(2)} / 20</div>
                </div>
              )}
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Matière</th>
                      <th>Période</th>
                      <th>Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {student.grades.map((g) => (
                      <tr key={g.id}>
                        <td>{g.subject.name}</td>
                        <td>{g.term.name}</td>
                        <td>
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

          {tab === "billing" && (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Référence</th>
                    <th>Libellé</th>
                    <th>Montant</th>
                    <th>Payé</th>
                    <th>Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {student.invoices.map((inv) => {
                    const paid = inv.payments.reduce((s, p) => s + p.amount, 0);
                    return (
                      <tr key={inv.id}>
                        <td>{inv.reference}</td>
                        <td>{inv.label}</td>
                        <td>{formatFCFA(inv.totalAmount)}</td>
                        <td>{formatFCFA(paid)}</td>
                        <td>
                          <span
                            className={`badge ${
                              inv.status === "PAID"
                                ? "badge-green"
                                : inv.status === "PARTIALLY_PAID"
                                ? "badge-warning"
                                : "badge-danger"
                            }`}
                          >
                            {inv.status}
                          </span>
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

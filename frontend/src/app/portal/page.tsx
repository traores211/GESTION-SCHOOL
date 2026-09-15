"use client";

import { useEffect, useState } from "react";
import Shell from "../../components/Shell";
import { api, ApiError } from "../../lib/api";

interface Child {
  id: string;
  firstName: string;
  lastName: string;
  matricule: string;
  enrollments: { class: { name: string } }[];
  school: { name: string };
}

interface ChildDetail extends Child {
  attendance: { date: string; status: string }[];
  grades: { score: number; maxScore: number; subject: { name: string }; term: { name: string } }[];
  invoices: { reference: string; label: string; totalAmount: number; status: string; payments: { amount: number }[] }[];
}

function formatFCFA(amount: number) {
  return new Intl.NumberFormat("fr-FR").format(Math.round(amount)) + " FCFA";
}

export default function ParentPortalPage() {
  const [children, setChildren] = useState<Child[]>([]);
  const [selected, setSelected] = useState<ChildDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Child[]>("/parent-portal/children")
      .then((list) => {
        setChildren(list);
        if (list[0]) loadChild(list[0].id);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Erreur de chargement"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadChild = (id: string) => {
    api.get<ChildDetail>(`/parent-portal/children/${id}`).then(setSelected).catch(() => {});
  };

  return (
    <Shell title="Mon espace parent">
      <div className="page-header">
        <div>
          <h1>👨‍👩‍👧 Mes enfants</h1>
          <p>Suivi scolaire, présence, notes et scolarité</p>
        </div>
      </div>

      {error && <p className="text-danger">{error}</p>}

      {children.length > 1 && (
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          {children.map((c) => (
            <button
              key={c.id}
              className={`btn ${selected?.id === c.id ? "btn-primary" : "btn-outline"} btn-sm`}
              onClick={() => loadChild(c.id)}
            >
              {c.firstName} {c.lastName}
            </button>
          ))}
        </div>
      )}

      {selected && (
        <>
          <div className="card" style={{ marginBottom: 20 }}>
            <h2 style={{ fontSize: 17 }}>{selected.firstName} {selected.lastName}</h2>
            <p className="muted">
              {selected.matricule} — {selected.enrollments[0]?.class?.name || "Non affecté"} — {selected.school.name}
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div className="card">
              <h3 style={{ fontSize: 14, marginBottom: 12 }}>✅ Présence récente</h3>
              {selected.attendance.slice(0, 8).map((a, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--border)" }}>
                  <span>{new Date(a.date).toLocaleDateString("fr-FR")}</span>
                  <span
                    className={`badge ${
                      a.status === "PRESENT" ? "badge-green" : a.status === "ABSENT" ? "badge-danger" : "badge-warning"
                    }`}
                  >
                    {a.status}
                  </span>
                </div>
              ))}
              {selected.attendance.length === 0 && <p className="muted">Aucune donnée de présence.</p>}
            </div>

            <div className="card">
              <h3 style={{ fontSize: 14, marginBottom: 12 }}>📚 Dernières notes</h3>
              {selected.grades.slice(0, 8).map((g, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--border)" }}>
                  <span>{g.subject.name} <span className="muted">({g.term.name})</span></span>
                  <strong>{g.score}/{g.maxScore}</strong>
                </div>
              ))}
              {selected.grades.length === 0 && <p className="muted">Aucune note disponible.</p>}
            </div>
          </div>

          <div className="card" style={{ marginTop: 16 }}>
            <h3 style={{ fontSize: 14, marginBottom: 12 }}>💰 Scolarité</h3>
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
                  {selected.invoices.map((inv) => {
                    const paid = inv.payments.reduce((s, p) => s + p.amount, 0);
                    return (
                      <tr key={inv.reference}>
                        <td>{inv.reference}</td>
                        <td>{inv.label}</td>
                        <td>{formatFCFA(inv.totalAmount)}</td>
                        <td>{formatFCFA(paid)}</td>
                        <td>
                          <span className={`badge ${inv.status === "PAID" ? "badge-green" : inv.status === "PARTIALLY_PAID" ? "badge-warning" : "badge-danger"}`}>
                            {inv.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {selected.invoices.length === 0 && <div className="empty-state">Aucune facture.</div>}
            </div>
          </div>
        </>
      )}
    </Shell>
  );
}

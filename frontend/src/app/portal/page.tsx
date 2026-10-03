"use client";

import { useEffect, useState } from "react";
import Shell from "../../components/Shell";
import { Smartphone } from "lucide-react";
import { api, ApiError, errorMessage } from "../../lib/api";
import { EmptyState, PageHeader } from "../../components/ui";
import { ATTENDANCE_STATUS, INVOICE_STATUS, statusBadge } from "../../lib/labels";

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
  invoices: { id: string; reference: string; label: string; totalAmount: number; status: string; payments: { amount: number; status: string }[] }[];
}

function formatFCFA(amount: number) {
  return new Intl.NumberFormat("fr-FR").format(Math.round(amount)) + " FCFA";
}

export default function ParentPortalPage() {
  const [children, setChildren] = useState<Child[]>([]);
  const [selected, setSelected] = useState<ChildDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [onlineEnabled, setOnlineEnabled] = useState(false);
  const [paying, setPaying] = useState<string | null>(null);
  const [payError, setPayError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Child[]>("/parent-portal/children")
      .then((list) => {
        setChildren(list);
        if (list[0]) loadChild(list[0].id);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Erreur de chargement"));
    api.get<{ enabled: boolean }>("/payments/config").then((c) => setOnlineEnabled(c.enabled)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadChild = (id: string) => {
    api.get<ChildDetail>(`/parent-portal/children/${id}`).then(setSelected).catch(() => {});
  };

  /** Opens the online payment page (Mobile Money, card) for what is left to pay on an invoice. */
  const pay = async (invoiceId: string) => {
    setPaying(invoiceId);
    setPayError(null);
    try {
      const link = await api.post<{ shareUrl: string }>(`/parent-portal/invoices/${invoiceId}/pay`, {});
      window.location.href = link.shareUrl;
    } catch (err) {
      setPayError(errorMessage(err));
      setPaying(null);
    }
  };

  return (
    <Shell title="Mon espace parent">
      <PageHeader title="Mes enfants" description="Suivi scolaire : présence, notes et scolarité." />

      {error && (
        <div className="card">
          <EmptyState tone="error" title="Informations indisponibles">
            {error}
          </EmptyState>
        </div>
      )}
      {!error && !selected && (
        <div className="grid-2">
          <div className="skeleton" style={{ height: 120 }} />
          <div className="skeleton" style={{ height: 120 }} />
        </div>
      )}

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

          <div className="grid-2">
            <div className="card">
              <h3 className="card-title" style={{ marginBottom: 12 }}>Présence récente</h3>
              {selected.attendance.slice(0, 8).map((a, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--border)" }}>
                  <span>{new Date(a.date).toLocaleDateString("fr-FR")}</span>
                  <span className={`badge ${statusBadge(ATTENDANCE_STATUS, a.status).badge}`}>{statusBadge(ATTENDANCE_STATUS, a.status).label}</span>
                </div>
              ))}
              {selected.attendance.length === 0 && <p className="muted">Aucune donnée de présence.</p>}
            </div>

            <div className="card">
              <h3 className="card-title" style={{ marginBottom: 12 }}>Dernières notes</h3>
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
            <h3 className="card-title" style={{ marginBottom: 12 }}>Scolarité</h3>
            {payError && (
              <div className="alert alert-danger" role="alert" style={{ marginBottom: 12 }}>
                <div className="alert-body">{payError}</div>
              </div>
            )}
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Référence</th>
                    <th>Libellé</th>
                    <th>Montant</th>
                    <th>Payé</th>
                    <th>Statut</th>
                    <th className="actions">
                      <span className="visually-hidden">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {selected.invoices.map((inv) => {
                    const paid = inv.payments.filter((p) => p.status === "SUCCESS").reduce((s, p) => s + p.amount, 0);
                    const payable = onlineEnabled && inv.status !== "PAID" && inv.status !== "CANCELLED" && inv.status !== "DRAFT" && paid < inv.totalAmount;
                    return (
                      <tr key={inv.reference}>
                        <td>{inv.reference}</td>
                        <td>{inv.label}</td>
                        <td>{formatFCFA(inv.totalAmount)}</td>
                        <td>{formatFCFA(paid)}</td>
                        <td>
                          <span className={`badge ${statusBadge(INVOICE_STATUS, inv.status).badge}`}>{statusBadge(INVOICE_STATUS, inv.status).label}</span>
                        </td>
                        <td className="actions">
                          {payable && (
                            <button className="btn btn-primary btn-sm" onClick={() => pay(inv.id)} disabled={paying !== null}>
                              <Smartphone size={14} /> {paying === inv.id ? "Ouverture…" : "Payer"}
                            </button>
                          )}
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

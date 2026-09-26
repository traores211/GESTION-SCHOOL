"use client";

import { useEffect, useState } from "react";
import Shell from "../../components/Shell";
import { useSession } from "../../lib/session";
import { ErrorAlert } from "../../components/ui/States";
import Modal from "../../components/ui/Modal";
import { api, ApiError } from "../../lib/api";

interface StudentOption {
  id: string;
  firstName: string;
  lastName: string;
  matricule: string;
}

interface InvoiceRow {
  id: string;
  reference: string;
  label: string;
  totalAmount: number;
  status: string;
  dueDate: string;
  student: StudentOption;
  payments: { amount: number; method: string }[];
}

const PAYMENT_METHODS = [
  { value: "CASH", label: "Espèces" },
  { value: "MOBILE_MONEY_ORANGE", label: "Orange Money" },
  { value: "MOBILE_MONEY_MTN", label: "MTN Mobile Money" },
  { value: "MOBILE_MONEY_MOOV", label: "Moov Money" },
  { value: "WAVE", label: "Wave" },
  { value: "BANK_TRANSFER", label: "Virement bancaire" },
  { value: "CHEQUE", label: "Chèque" },
  { value: "CARD", label: "Carte bancaire" },
];

function formatFCFA(amount: number) {
  return new Intl.NumberFormat("fr-FR").format(Math.round(amount)) + " FCFA";
}

export default function BillingPage() {
  const { can } = useSession();
  const [reminder, setReminder] = useState<string | null>(null);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showInvoiceForm, setShowInvoiceForm] = useState(false);
  const [payingInvoice, setPayingInvoice] = useState<InvoiceRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [invoiceForm, setInvoiceForm] = useState({
    studentId: "",
    label: "Scolarité",
    dueDate: new Date().toISOString().slice(0, 10),
    amount: 150000,
  });
  const [paymentForm, setPaymentForm] = useState({ amount: 0, method: "CASH", reference: "" });

  const load = () => {
    api.get<InvoiceRow[]>("/billing/invoices").then(setInvoices).catch((err) => setError(err instanceof ApiError ? err.message : "Erreur"));
  };

  useEffect(() => {
    load();
    api.get<StudentOption[]>("/students").then(setStudents).catch(() => {});
  }, []);

  const createInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      await api.post("/billing/invoices", {
        studentId: invoiceForm.studentId,
        label: invoiceForm.label,
        dueDate: invoiceForm.dueDate,
        items: [{ label: invoiceForm.label, amount: invoiceForm.amount }],
      });
      setShowInvoiceForm(false);
      load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Erreur lors de la création");
    } finally {
      setSaving(false);
    }
  };

  const recordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payingInvoice) return;
    setSaving(true);
    setFormError(null);
    try {
      await api.post(`/billing/invoices/${payingInvoice.id}/payments`, paymentForm);
      setPayingInvoice(null);
      load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Erreur lors du paiement");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Shell title="Facturation">
      <div className="page-header">
        <div>
          <h1>Facturation & Paiements</h1>
          <p>{invoices.length} facture(s) — Mobile Money, espèces, virement, chèque</p>
        </div>
        {can("billing:write") && (
          <div className="row">
          <button
            className="btn btn-outline"
            onClick={async () => {
              setReminder(null);
              try {
                const r = await api.post<{ invoices: number; notified: number }>("/billing/reminders");
                setReminder(r.invoices ? `${r.invoices} facture(s) échue(s) : ${r.notified} parent(s) relancé(s).` : "Aucune facture échue à relancer.");
              } catch (err) {
                setError(err instanceof ApiError ? err.message : "Relance impossible");
              }
            }}
          >
            Relancer les impayés échus
          </button>
          <button className="btn btn-primary" onClick={() => setShowInvoiceForm(true)}>
          Nouvelle facture
        </button>
          </div>
        )}
      </div>

      <ErrorAlert message={error} />
      {reminder && <div className="alert alert-success" role="status">{reminder}</div>}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Référence</th>
              <th>Élève</th>
              <th>Libellé</th>
              <th>Montant</th>
              <th>Payé</th>
              <th>Échéance</th>
              <th>Statut</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => {
              const paid = inv.payments.reduce((s, p) => s + p.amount, 0);
              return (
                <tr key={inv.id}>
                  <td>{inv.reference}</td>
                  <td>{inv.student.lastName} {inv.student.firstName}</td>
                  <td>{inv.label}</td>
                  <td>{formatFCFA(inv.totalAmount)}</td>
                  <td>{formatFCFA(paid)}</td>
                  <td>{new Date(inv.dueDate).toLocaleDateString("fr-FR")}</td>
                  <td>
                    <span
                      className={`badge ${
                        inv.status === "PAID" ? "badge-green" : inv.status === "PARTIALLY_PAID" ? "badge-warning" : "badge-danger"
                      }`}
                    >
                      {inv.status}
                    </span>
                  </td>
                  <td>
                    {inv.status !== "PAID" && (
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => {
                          setPayingInvoice(inv);
                          setPaymentForm({ amount: inv.totalAmount - paid, method: "CASH", reference: "" });
                        }}
                      >
                        Encaisser
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {invoices.length === 0 && <div className="empty-state">Aucune facture.</div>}
      </div>

      {showInvoiceForm && (
        <Modal title={<>Nouvelle facture</>} onClose={() => setShowInvoiceForm(false)}>
            
            <form onSubmit={createInvoice}>
              <div className="field">
                <label htmlFor="billing-f1">Élève</label>
                <select id="billing-f1" className="input" required value={invoiceForm.studentId} onChange={(e) => setInvoiceForm({ ...invoiceForm, studentId: e.target.value })}>
                  <option value="">— Sélectionner —</option>
                  {students.map((s) => (
                    <option key={s.id} value={s.id}>{s.lastName} {s.firstName} ({s.matricule})</option>
                  ))}
                </select>
              </div>
              <div className="form-grid">
                <div className="field">
                  <label htmlFor="billing-f2">Libellé</label>
                  <input id="billing-f2" className="input" required value={invoiceForm.label} onChange={(e) => setInvoiceForm({ ...invoiceForm, label: e.target.value })} />
                </div>
                <div className="field">
                  <label htmlFor="billing-f3">Montant (FCFA)</label>
                  <input id="billing-f3" type="number" className="input" required value={invoiceForm.amount} onChange={(e) => setInvoiceForm({ ...invoiceForm, amount: Number(e.target.value) })} />
                </div>
                <div className="field" style={{ gridColumn: "1 / -1" }}>
                  <label htmlFor="billing-f4">Échéance</label>
                  <input id="billing-f4" type="date" className="input" required value={invoiceForm.dueDate} onChange={(e) => setInvoiceForm({ ...invoiceForm, dueDate: e.target.value })} />
                </div>
              </div>
              {formError && <p className="text-danger" style={{ marginBottom: 12 }}>{formError}</p>}
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
                <button type="button" className="btn btn-outline" onClick={() => setShowInvoiceForm(false)}>Annuler</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Enregistrement…" : "Créer la facture"}</button>
              </div>
            </form>
          </Modal>
      )}

      {payingInvoice && (
        <Modal title={<>Encaisser un paiement</>} onClose={() => setPayingInvoice(null)}>
            
            <p className="muted" style={{ marginBottom: 16, fontSize: 13 }}>
              {payingInvoice.reference} — {payingInvoice.student.lastName} {payingInvoice.student.firstName}
            </p>
            <form onSubmit={recordPayment}>
              <div className="form-grid">
                <div className="field">
                  <label htmlFor="billing-f5">Montant (FCFA)</label>
                  <input id="billing-f5" type="number" className="input" required value={paymentForm.amount} onChange={(e) => setPaymentForm({ ...paymentForm, amount: Number(e.target.value) })} />
                </div>
                <div className="field">
                  <label htmlFor="billing-f6">Moyen de paiement</label>
                  <select id="billing-f6" className="input" value={paymentForm.method} onChange={(e) => setPaymentForm({ ...paymentForm, method: e.target.value })}>
                    {PAYMENT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </div>
                <div className="field" style={{ gridColumn: "1 / -1" }}>
                  <label htmlFor="billing-f7">Référence (optionnel)</label>
                  <input id="billing-f7" className="input" value={paymentForm.reference} onChange={(e) => setPaymentForm({ ...paymentForm, reference: e.target.value })} />
                </div>
              </div>
              {formError && <p className="text-danger" style={{ marginBottom: 12 }}>{formError}</p>}
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
                <button type="button" className="btn btn-outline" onClick={() => setPayingInvoice(null)}>Annuler</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Traitement…" : "Confirmer le paiement"}</button>
              </div>
            </form>
          </Modal>
      )}
    </Shell>
  );
}

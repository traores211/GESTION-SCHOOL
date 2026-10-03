"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Ban, CreditCard, Eye, LoaderCircle, Plus, Receipt, Undo2, Wallet } from "lucide-react";
import Shell from "../../components/Shell";
import { EmptyState, FormError, Modal, PageHeader, Pagination, SearchInput, SortHeader, TableSkeleton, useFeedback } from "../../components/ui";
import { KpiCard } from "../../components/dashboard/ui";
import { api, errorMessage } from "../../lib/api";
import { useTable } from "../../lib/useTable";
import { INVOICE_STATUS as STATUS } from "../../lib/labels";
import { getStoredUser } from "../../lib/auth";

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
  payments: { id: string; amount: number; method: string; status: string; paidAt: string; reference: string | null; refundReason: string | null }[];
  /** Computed by the API from successful payments only. */
  paidAmount?: number;
  remainingAmount?: number;
  cancelReason?: string | null;
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

/** Successful payments only (failed and refunded lines do not count). */
const paidOf = (inv: InvoiceRow) => inv.paidAmount ?? inv.payments.filter((p) => !p.status || p.status === "SUCCESS").reduce((s, p) => s + p.amount, 0);
const FINANCE_ROLES = ["SUPER_ADMIN", "ADMIN_ORGANISATION", "DIRECTOR", "COMPTABLE"];
const isLate = (inv: InvoiceRow) => inv.status !== "PAID" && inv.status !== "CANCELLED" && new Date(inv.dueDate) < new Date(new Date().toDateString());

export default function BillingPage() {
  const feedback = useFeedback();
  const [invoices, setInvoices] = useState<InvoiceRow[] | null>(null);
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showInvoiceForm, setShowInvoiceForm] = useState(false);
  const [payingInvoice, setPayingInvoice] = useState<InvoiceRow | null>(null);
  const [viewing, setViewing] = useState<InvoiceRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [invoiceForm, setInvoiceForm] = useState({ studentId: "", label: "Scolarité", dueDate: new Date().toISOString().slice(0, 10), amount: 150000 });
  const [paymentForm, setPaymentForm] = useState({ amount: 0, method: "CASH", reference: "" });

  const load = useCallback(() => {
    api
      .get<InvoiceRow[]>("/billing/invoices")
      .then((list) => {
        setInvoices(list);
        setError(null);
      })
      .catch((err) => setError(errorMessage(err)));
  }, []);

  useEffect(() => {
    load();
    api.get<StudentOption[]>("/students").then(setStudents).catch(() => {});
  }, [load]);

  const totals = useMemo(() => {
    const list = invoices ?? [];
    const billed = list.reduce((s, i) => s + i.totalAmount, 0);
    const paid = list.reduce((s, i) => s + paidOf(i), 0);
    return { billed, paid, due: billed - paid, late: list.filter(isLate).length, rate: billed ? (paid / billed) * 100 : 0 };
  }, [invoices]);

  const table = useTable<InvoiceRow, "reference" | "student" | "amount" | "due" | "status">({
    rows: (invoices ?? []).filter((i) => !statusFilter || (statusFilter === "LATE" ? isLate(i) : i.status === statusFilter)),
    accessors: {
      reference: (i) => i.reference,
      student: (i) => `${i.student.lastName} ${i.student.firstName}`,
      amount: (i) => i.totalAmount - paidOf(i),
      due: (i) => i.dueDate,
      status: (i) => STATUS[i.status]?.label ?? i.status,
    },
    searchText: (i) => `${i.reference} ${i.label} ${i.student.firstName} ${i.student.lastName} ${i.student.matricule}`,
    initialSort: { key: "due", dir: "asc" },
  });

  const createInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (invoiceForm.amount <= 0) return setFormError("Le montant doit être supérieur à 0");
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
      feedback.success("Facture créée", `${invoiceForm.label} · ${formatFCFA(invoiceForm.amount)}`);
      load();
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const remaining = payingInvoice ? payingInvoice.totalAmount - paidOf(payingInvoice) : 0;
  const canManageMoney = FINANCE_ROLES.includes(getStoredUser()?.role ?? "");

  /** Cancel an invoice or refund a payment: both need a reason, kept in the accounts and the journal. */
  const withReason = async (kind: "cancel" | "refund", id: string, label: string) => {
    const reason = await feedback.prompt({
      title: kind === "cancel" ? `Annuler la facture ${label} ?` : `Rembourser ce paiement (${label}) ?`,
      message: kind === "cancel" ? "La facture reste visible avec le statut « Annulée » ; elle ne peut plus recevoir de paiement." : "Le paiement reste dans l'historique avec le statut « Remboursé » et le reste à payer est recalculé.",
      label: "Motif",
      confirmLabel: kind === "cancel" ? "Annuler la facture" : "Rembourser",
    });
    if (!reason) return;
    try {
      const updated = await api.post<InvoiceRow>(kind === "cancel" ? `/billing/invoices/${id}/cancel` : `/billing/payments/${id}/refund`, { reason });
      feedback.success(kind === "cancel" ? "Facture annulée" : "Paiement remboursé");
      setViewing(updated);
      load();
    } catch (err) {
      feedback.error("Action impossible", errorMessage(err));
    }
  };

  const recordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payingInvoice) return;
    if (paymentForm.amount <= 0) return setFormError("Le montant doit être supérieur à 0");
    if (paymentForm.amount > remaining) return setFormError(`Le montant dépasse le reste à payer (${formatFCFA(remaining)})`);
    setSaving(true);
    setFormError(null);
    try {
      await api.post(`/billing/invoices/${payingInvoice.id}/payments`, paymentForm);
      feedback.success("Paiement enregistré", `${formatFCFA(paymentForm.amount)} · ${PAYMENT_METHODS.find((m) => m.value === paymentForm.method)?.label}`);
      setPayingInvoice(null);
      load();
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Shell title="Facturation">
      <PageHeader
        title="Facturation & paiements"
        description="Espèces, Mobile Money (Orange, MTN, Moov, Wave), virement, chèque ou carte."
        actions={
          <button
            className="btn btn-primary"
            onClick={() => {
              setFormError(null);
              setShowInvoiceForm(true);
            }}
          >
            <Plus size={16} /> Nouvelle facture
          </button>
        }
      />

      {invoices && (
        <div className="kpi-grid">
          <KpiCard label="Facturé" icon={<Receipt size={16} />} value={formatFCFA(totals.billed)} sub={`${invoices.length} facture(s)`} />
          <KpiCard label="Encaissé" icon={<Wallet size={16} />} value={formatFCFA(totals.paid)} meter={totals.rate} sub={`${Math.round(totals.rate)} % du facturé`} />
          <KpiCard label="Reste à encaisser" icon={<CreditCard size={16} />} accent="orange" value={formatFCFA(totals.due)} />
          <KpiCard label="En retard" icon={<Receipt size={16} />} accent={totals.late ? "danger" : "green"} value={totals.late} sub="échéance dépassée" />
        </div>
      )}

      <div className="table-toolbar">
        <div className="table-toolbar-left">
          <SearchInput value={table.query} onChange={table.setQuery} placeholder="Référence, élève, libellé…" label="Rechercher une facture" />
          <select className="input" style={{ width: "auto" }} aria-label="Filtrer par statut" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">Tous les statuts</option>
            <option value="LATE">En retard (échéance dépassée)</option>
            {["PENDING", "PARTIALLY_PAID", "PAID"].map((s) => (
              <option key={s} value={s}>
                {STATUS[s].label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="table-wrap">
        {error ? (
          <EmptyState tone="error" title="Impossible de charger les factures" action={<button className="btn btn-outline" onClick={load}>Réessayer</button>}>
            {error}
          </EmptyState>
        ) : !invoices ? (
          <TableSkeleton columns={7} />
        ) : table.total === 0 ? (
          <EmptyState icon={<Receipt size={22} />} title={table.query || statusFilter ? "Aucune facture ne correspond" : "Aucune facture"} />
        ) : (
          <>
            <table>
              <thead>
                <tr>
                  <SortHeader label="Référence" column="reference" sort={table.sort} onSort={table.toggleSort} className="stub-cell" />
                  <SortHeader label="Élève" column="student" sort={table.sort} onSort={table.toggleSort} />
                  <th>Libellé</th>
                  <SortHeader label="Reste dû" column="amount" sort={table.sort} onSort={table.toggleSort} className="num" />
                  <SortHeader label="Échéance" column="due" sort={table.sort} onSort={table.toggleSort} />
                  <SortHeader label="Statut" column="status" sort={table.sort} onSort={table.toggleSort} />
                  <th className="actions">
                    <span className="visually-hidden">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {table.pageRows.map((inv) => {
                  const paid = paidOf(inv);
                  const late = isLate(inv);
                  return (
                    <tr key={inv.id}>
                      <td className="stub-cell">{inv.reference}</td>
                      <td className="cell-main">
                        {inv.student.lastName} {inv.student.firstName}
                      </td>
                      <td>{inv.label}</td>
                      <td className="num">
                        <div className="cell-main">{formatFCFA(inv.totalAmount - paid)}</div>
                        <div className="cell-sub">sur {formatFCFA(inv.totalAmount)}</div>
                      </td>
                      <td className="nowrap" style={{ color: late ? "var(--danger)" : undefined, fontWeight: late ? 600 : undefined }}>
                        {new Date(inv.dueDate).toLocaleDateString("fr-FR")}
                      </td>
                      <td>
                        <span className={`badge ${late ? "badge-danger" : STATUS[inv.status]?.badge ?? "badge-neutral"}`}>{late ? "En retard" : STATUS[inv.status]?.label ?? inv.status}</span>
                      </td>
                      <td className="actions">
                        <button className="btn btn-ghost btn-sm" onClick={() => setViewing(inv)} aria-label={`Détail de la facture ${inv.reference}`}>
                          <Eye size={14} /> Détail
                        </button>
                        {inv.status !== "PAID" && inv.status !== "CANCELLED" && (
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => {
                              setFormError(null);
                              setPayingInvoice(inv);
                              setPaymentForm({ amount: inv.totalAmount - paid, method: "CASH", reference: "" });
                            }}
                          >
                            <CreditCard size={14} /> Encaisser
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <Pagination page={table.page} pageCount={table.pageCount} total={table.total} pageSize={table.pageSize} onPage={table.setPage} unit="facture" />
          </>
        )}
      </div>

      <Modal
        open={showInvoiceForm}
        onClose={() => setShowInvoiceForm(false)}
        busy={saving}
        title="Nouvelle facture"
        footer={
          <>
            <button type="button" className="btn btn-outline" onClick={() => setShowInvoiceForm(false)} disabled={saving}>
              Annuler
            </button>
            <button type="submit" form="invoice-form" className="btn btn-primary" disabled={saving}>
              {saving ? <LoaderCircle size={16} className="spin" /> : <Plus size={16} />} Créer la facture
            </button>
          </>
        }
      >
        <form id="invoice-form" onSubmit={createInvoice}>
          <FormError message={formError} />
          <div className="field">
            <label htmlFor="inv-student" className="required">
              Élève
            </label>
            <select id="inv-student" className="input" required value={invoiceForm.studentId} onChange={(e) => setInvoiceForm({ ...invoiceForm, studentId: e.target.value })}>
              <option value="">— Sélectionner —</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.lastName} {s.firstName} ({s.matricule})
                </option>
              ))}
            </select>
          </div>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="inv-label" className="required">
                Libellé
              </label>
              <input id="inv-label" className="input" required list="invoice-labels" value={invoiceForm.label} onChange={(e) => setInvoiceForm({ ...invoiceForm, label: e.target.value })} />
              <datalist id="invoice-labels">
                <option value="Scolarité" />
                <option value="Frais d'inscription" />
                <option value="Cantine" />
                <option value="Transport" />
                <option value="Tenue scolaire" />
              </datalist>
            </div>
            <div className="field">
              <label htmlFor="inv-amount" className="required">
                Montant (FCFA)
              </label>
              <input id="inv-amount" type="number" min={1} step={500} className="input" required value={invoiceForm.amount} onChange={(e) => setInvoiceForm({ ...invoiceForm, amount: Number(e.target.value) })} />
            </div>
            <div className="field full">
              <label htmlFor="inv-due" className="required">
                Échéance
              </label>
              <input id="inv-due" type="date" className="input" required value={invoiceForm.dueDate} onChange={(e) => setInvoiceForm({ ...invoiceForm, dueDate: e.target.value })} />
            </div>
          </div>
        </form>
      </Modal>

      <Modal
        open={!!payingInvoice}
        onClose={() => setPayingInvoice(null)}
        busy={saving}
        title="Encaisser un paiement"
        description={payingInvoice ? `${payingInvoice.reference} · ${payingInvoice.student.lastName} ${payingInvoice.student.firstName} · reste ${formatFCFA(remaining)}` : undefined}
        footer={
          <>
            <button type="button" className="btn btn-outline" onClick={() => setPayingInvoice(null)} disabled={saving}>
              Annuler
            </button>
            <button type="submit" form="payment-form" className="btn btn-primary" disabled={saving}>
              {saving ? <LoaderCircle size={16} className="spin" /> : <CreditCard size={16} />} Confirmer le paiement
            </button>
          </>
        }
      >
        <form id="payment-form" onSubmit={recordPayment}>
          <FormError message={formError} />
          <div className="form-grid">
            <div className="field">
              <label htmlFor="pay-amount" className="required">
                Montant (FCFA)
              </label>
              <input id="pay-amount" type="number" min={1} max={remaining} className="input" required value={paymentForm.amount} onChange={(e) => setPaymentForm({ ...paymentForm, amount: Number(e.target.value) })} />
              {paymentForm.amount > 0 && paymentForm.amount < remaining && <span className="field-hint">Paiement partiel : il restera {formatFCFA(remaining - paymentForm.amount)}.</span>}
            </div>
            <div className="field">
              <label htmlFor="pay-method">Moyen de paiement</label>
              <select id="pay-method" className="input" value={paymentForm.method} onChange={(e) => setPaymentForm({ ...paymentForm, method: e.target.value })}>
                {PAYMENT_METHODS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field full">
              <label htmlFor="pay-ref">Référence de transaction</label>
              <input id="pay-ref" className="input" placeholder={paymentForm.method.startsWith("MOBILE") || paymentForm.method === "WAVE" ? "Ex. ID de transaction Mobile Money" : "Optionnel"} value={paymentForm.reference} onChange={(e) => setPaymentForm({ ...paymentForm, reference: e.target.value })} />
            </div>
          </div>
        </form>
      </Modal>

      <Modal
        open={!!viewing}
        onClose={() => setViewing(null)}
        size="lg"
        title={viewing ? `Facture ${viewing.reference}` : ""}
        description={viewing ? `${viewing.student.lastName} ${viewing.student.firstName} · ${viewing.label} · échéance ${new Date(viewing.dueDate).toLocaleDateString("fr-FR")}` : undefined}
        footer={
          viewing && (
            <>
              {canManageMoney && viewing.status !== "CANCELLED" && paidOf(viewing) === 0 && (
                <button type="button" className="btn btn-danger-ghost" onClick={() => withReason("cancel", viewing.id, viewing.reference)}>
                  <Ban size={16} /> Annuler la facture
                </button>
              )}
              <span className="spacer" />
              <button type="button" className="btn btn-outline" onClick={() => setViewing(null)}>
                Fermer
              </button>
            </>
          )
        }
      >
        {viewing && (
          <>
            <div className="gen-stats" style={{ marginTop: 0 }}>
              <div className="gen-stat">
                <strong>{formatFCFA(viewing.totalAmount)}</strong>
                <span>montant facturé</span>
              </div>
              <div className="gen-stat is-good">
                <strong>{formatFCFA(paidOf(viewing))}</strong>
                <span>encaissé</span>
              </div>
              <div className={`gen-stat ${viewing.totalAmount - paidOf(viewing) > 0 ? "is-bad" : ""}`}>
                <strong>{formatFCFA(Math.max(0, viewing.totalAmount - paidOf(viewing)))}</strong>
                <span>reste à payer</span>
              </div>
            </div>
            {viewing.status === "CANCELLED" && (
              <div className="alert alert-warning" style={{ marginBottom: 12 }}>
                <Ban size={16} />
                <div className="alert-body">Facture annulée{viewing.cancelReason ? ` : ${viewing.cancelReason}` : ""}</div>
              </div>
            )}
            <h3 className="card-title" style={{ fontSize: 15 }}>
              Paiements
            </h3>
            {viewing.payments.length === 0 ? (
              <p className="muted">Aucun paiement enregistré.</p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Mode</th>
                      <th className="num">Montant</th>
                      <th>Statut</th>
                      <th className="actions">
                        <span className="visually-hidden">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {viewing.payments.map((p) => (
                      <tr key={p.id}>
                        <td className="nowrap">{new Date(p.paidAt).toLocaleDateString("fr-FR")}</td>
                        <td>
                          {PAYMENT_METHODS.find((m) => m.value === p.method)?.label ?? p.method}
                          {p.reference && <div className="cell-sub">{p.reference}</div>}
                        </td>
                        <td className="num">{formatFCFA(p.amount)}</td>
                        <td>
                          <span className={`badge ${p.status === "SUCCESS" ? "badge-green" : p.status === "REFUNDED" ? "badge-warning" : "badge-danger"}`}>
                            {p.status === "SUCCESS" ? "Encaissé" : p.status === "REFUNDED" ? "Remboursé" : p.status === "FAILED" ? "Échoué" : p.status}
                          </span>
                          {p.refundReason && <div className="cell-sub">{p.refundReason}</div>}
                        </td>
                        <td className="actions">
                          {canManageMoney && p.status === "SUCCESS" && (
                            <button type="button" className="btn btn-ghost btn-sm" onClick={() => withReason("refund", p.id, formatFCFA(p.amount))}>
                              <Undo2 size={14} /> Rembourser
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </Modal>
    </Shell>
  );
}

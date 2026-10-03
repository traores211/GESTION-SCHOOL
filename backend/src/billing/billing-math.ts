/** Billing rules, pure so they are unit tested: invoice status, balances, payment checks, stats. */

export type InvoiceState = 'DRAFT' | 'PENDING' | 'PARTIALLY_PAID' | 'PAID' | 'OVERDUE' | 'CANCELLED';

export interface PaymentLine {
  amount: number;
  status: string;
  paidAt: Date;
}

/** Amounts are FCFA (whole francs); rounding avoids floating dust in sums. */
export const round = (n: number) => Math.round(n);

export function paidAmount(payments: PaymentLine[]): number {
  return round(payments.filter((p) => p.status === 'SUCCESS').reduce((s, p) => s + p.amount, 0));
}

export function remaining(total: number, payments: PaymentLine[]): number {
  return Math.max(0, round(total) - paidAmount(payments));
}

/** Status of an invoice from its payments and due date. A cancelled invoice stays cancelled. */
export function invoiceStatus(invoice: { totalAmount: number; dueDate: Date; status: string }, payments: PaymentLine[], now = new Date()): InvoiceState {
  if (invoice.status === 'CANCELLED') return 'CANCELLED';
  if (invoice.status === 'DRAFT') return 'DRAFT';
  const paid = paidAmount(payments);
  if (paid >= round(invoice.totalAmount) && invoice.totalAmount > 0) return 'PAID';
  if (invoice.dueDate < now) return 'OVERDUE';
  return paid > 0 ? 'PARTIALLY_PAID' : 'PENDING';
}

/** Null when the payment can be recorded, otherwise the reason. */
export function paymentProblem(invoice: { totalAmount: number; status: string }, payments: PaymentLine[], amount: number): string | null {
  if (invoice.status === 'CANCELLED') return 'Cette facture est annulée : aucun paiement ne peut y être enregistré';
  if (invoice.status === 'DRAFT') return "Cette facture est un brouillon : émettez-la avant d'enregistrer un paiement";
  if (!Number.isFinite(amount) || amount <= 0) return 'Le montant doit être positif';
  if (round(amount) !== amount) return 'Le montant doit être un nombre entier de francs CFA';
  const left = remaining(invoice.totalAmount, payments);
  if (left === 0) return 'Cette facture est déjà entièrement payée';
  if (amount > left) return `Le montant dépasse le reste à payer (${left.toLocaleString('fr-FR')} FCFA)`;
  return null;
}

/** A cancelled invoice must not carry money: refund the payments first. */
export function cancelProblem(invoice: { status: string }, payments: PaymentLine[]): string | null {
  if (invoice.status === 'CANCELLED') return 'Cette facture est déjà annulée';
  if (paidAmount(payments) > 0) return "Des paiements sont enregistrés sur cette facture : remboursez-les avant de l'annuler";
  return null;
}

export interface FinanceStats {
  totalInvoiced: number;
  totalCollected: number;
  outstanding: number;
  recoveryRate: number;
  collectedToday: number;
}

/** School-wide figures; cancelled invoices are left out. */
export function financeStats(invoices: { totalAmount: number; status: string; payments: PaymentLine[] }[], now = new Date()): FinanceStats {
  const active = invoices.filter((i) => i.status !== 'CANCELLED');
  const totalInvoiced = round(active.reduce((s, i) => s + i.totalAmount, 0));
  const totalCollected = active.reduce((s, i) => s + paidAmount(i.payments), 0);
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const collectedToday = active.reduce((s, i) => s + paidAmount(i.payments.filter((p) => p.paidAt >= startOfDay)), 0);
  return {
    totalInvoiced,
    totalCollected,
    outstanding: Math.max(0, totalInvoiced - totalCollected),
    recoveryRate: totalInvoiced > 0 ? Math.round((totalCollected / totalInvoiced) * 1000) / 10 : 0,
    collectedToday,
  };
}

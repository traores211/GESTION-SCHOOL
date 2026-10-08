/** Billing rules, pure so they are unit tested: invoice status, balances, payment checks, stats. */

export type InvoiceState = 'DRAFT' | 'PENDING' | 'PARTIALLY_PAID' | 'PAID' | 'OVERDUE' | 'CANCELLED';

/**
 * The monetary columns in the database are `Decimal(14,2)`. A Prisma middleware converts them to
 * plain numbers at read time, but the generated types still carry `Prisma.Decimal` on each
 * monetary field. Accept both: the helper below unwraps either to a plain number. Keeps the
 * runtime behaviour unchanged (every value is a `number` once it hits user code).
 */
export type Money = number | { toNumber(): number };
const toNum = (v: Money | null | undefined): number => (v == null ? 0 : typeof v === 'number' ? v : v.toNumber());

export interface PaymentLine {
  amount: Money;
  status: string;
  paidAt: Date;
}

/** Amounts are FCFA (whole francs); rounding avoids floating dust in sums. */
export const round = (n: number) => Math.round(n);

export function paidAmount(payments: PaymentLine[]): number {
  return round(payments.filter((p) => p.status === 'SUCCESS').reduce((s, p) => s + toNum(p.amount), 0));
}

export function remaining(total: Money, payments: PaymentLine[]): number {
  return Math.max(0, round(toNum(total)) - paidAmount(payments));
}

/** Status of an invoice from its payments and due date. A cancelled invoice stays cancelled. */
export function invoiceStatus(invoice: { totalAmount: Money; dueDate: Date; status: string }, payments: PaymentLine[], now = new Date()): InvoiceState {
  if (invoice.status === 'CANCELLED') return 'CANCELLED';
  if (invoice.status === 'DRAFT') return 'DRAFT';
  const total = toNum(invoice.totalAmount);
  const paid = paidAmount(payments);
  if (paid >= round(total) && total > 0) return 'PAID';
  if (invoice.dueDate < now) return 'OVERDUE';
  return paid > 0 ? 'PARTIALLY_PAID' : 'PENDING';
}

/** Null when the payment can be recorded, otherwise the reason. */
export function paymentProblem(invoice: { totalAmount: Money; status: string }, payments: PaymentLine[], amount: number): string | null {
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
export function financeStats(invoices: { totalAmount: Money; status: string; payments: PaymentLine[] }[], now = new Date()): FinanceStats {
  const active = invoices.filter((i) => i.status !== 'CANCELLED');
  const totalInvoiced = round(active.reduce((s, i) => s + toNum(i.totalAmount), 0));
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

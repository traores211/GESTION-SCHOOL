/**
 * Payslip rules, pure so they are unit tested. Statutory Ivorian deductions (CNPS, ITS) are entered
 * as deductions by the accountant: their scales must be validated by the school's accountant before
 * being computed automatically.
 */

export const PERIOD_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Net pay in whole francs; refuses negative amounts and deductions above the gross pay. */
export function netSalary(base: number, bonuses: number, deductions: number): { net: number; gross: number } | { error: string } {
  if ([base, bonuses, deductions].some((n) => !Number.isFinite(n) || n < 0)) return { error: 'Les montants doivent être positifs' };
  const gross = Math.round(base + bonuses);
  if (deductions > gross) return { error: `Les retenues (${Math.round(deductions).toLocaleString('fr-FR')} FCFA) dépassent le brut (${gross.toLocaleString('fr-FR')} FCFA)` };
  return { gross, net: gross - Math.round(deductions) };
}

export type PayslipStatus = 'DRAFT' | 'VALIDATED' | 'PAID';

/** Draft → validated → paid. A paid slip is frozen; editing a validated slip sends it back to draft. */
export function payslipProblem(status: string, action: 'edit' | 'validate' | 'pay'): string | null {
  if (status === 'PAID') return 'Ce bulletin a déjà été payé et ne peut plus être modifié';
  if (action === 'validate' && status !== 'DRAFT') return 'Seul un bulletin en brouillon peut être validé';
  if (action === 'pay' && status !== 'VALIDATED') return 'Validez le bulletin avant de le payer';
  return null;
}

export function periodLabel(period: string): string {
  if (!PERIOD_PATTERN.test(period)) return period;
  const [y, m] = period.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

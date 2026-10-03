import { cancelProblem, financeStats, invoiceStatus, paidAmount, paymentProblem, remaining } from './billing-math';
import { SequenceService } from '../infra/sequence.service';

const day = (iso: string) => new Date(`${iso}T10:00:00Z`);
const pay = (amount: number, status = 'SUCCESS', paidAt = day('2026-09-15')) => ({ amount, status, paidAt });
const now = day('2026-10-01');

describe('billing rules', () => {
  it('counts only successful payments', () => {
    const payments = [pay(30000), pay(10000, 'FAILED'), pay(5000, 'REFUNDED'), pay(20000)];
    expect(paidAmount(payments)).toBe(50000);
    expect(remaining(75000, payments)).toBe(25000);
    expect(remaining(40000, payments)).toBe(0);
  });

  it('derives the invoice status from payments and due date', () => {
    const inv = (dueDate: string, status = 'PENDING') => ({ totalAmount: 75000, dueDate: day(dueDate), status });
    expect(invoiceStatus(inv('2026-10-30'), [], now)).toBe('PENDING');
    expect(invoiceStatus(inv('2026-10-30'), [pay(25000)], now)).toBe('PARTIALLY_PAID');
    expect(invoiceStatus(inv('2026-09-30'), [pay(25000)], now)).toBe('OVERDUE');
    expect(invoiceStatus(inv('2026-09-30'), [pay(75000)], now)).toBe('PAID');
    expect(invoiceStatus(inv('2026-09-30', 'CANCELLED'), [pay(75000)], now)).toBe('CANCELLED');
    expect(invoiceStatus(inv('2026-10-30'), [pay(75000, 'REFUNDED')], now)).toBe('PENDING');
  });

  it('refuses overpayments, payments on cancelled or paid invoices and odd amounts', () => {
    const invoice = { totalAmount: 75000, status: 'PARTIALLY_PAID' };
    expect(paymentProblem(invoice, [pay(50000)], 25000)).toBeNull();
    expect(paymentProblem(invoice, [pay(50000)], 30000)).toMatch(/dépasse le reste à payer \(25\s?000 FCFA\)/);
    expect(paymentProblem(invoice, [pay(75000)], 1000)).toMatch(/déjà entièrement payée/);
    expect(paymentProblem({ ...invoice, status: 'CANCELLED' }, [], 1000)).toMatch(/annulée/);
    expect(paymentProblem(invoice, [], -5)).toMatch(/positif/);
    expect(paymentProblem(invoice, [], 1000.5)).toMatch(/entier/);
  });

  it('only cancels invoices that carry no money', () => {
    expect(cancelProblem({ status: 'PENDING' }, [])).toBeNull();
    expect(cancelProblem({ status: 'PENDING' }, [pay(1000, 'REFUNDED')])).toBeNull();
    expect(cancelProblem({ status: 'PARTIALLY_PAID' }, [pay(1000)])).toMatch(/remboursez-les/);
    expect(cancelProblem({ status: 'CANCELLED' }, [])).toMatch(/déjà annulée/);
  });

  it('computes school figures without cancelled invoices', () => {
    const stats = financeStats(
      [
        { totalAmount: 100000, status: 'PAID', payments: [pay(100000, 'SUCCESS', now)] },
        { totalAmount: 50000, status: 'PARTIALLY_PAID', payments: [pay(20000)] },
        { totalAmount: 80000, status: 'CANCELLED', payments: [] },
      ],
      now,
    );
    expect(stats).toEqual({ totalInvoiced: 150000, totalCollected: 120000, outstanding: 30000, recoveryRate: 80, collectedToday: 100000 });
    expect(financeStats([]).recoveryRate).toBe(0);
  });

  it('finds the highest existing number to start a sequence after it', () => {
    expect(SequenceService.maxSuffix(['INV-2026-00017', 'INV-2026-00009', 'INV-2025-00500', null, 'autre'], 'INV-2026-')).toBe(17);
    expect(SequenceService.maxSuffix([], 'INV-2026-')).toBe(0);
  });
});

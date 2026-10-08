import { PERIOD_PATTERN, netSalary, payslipProblem, periodLabel } from './payroll-math';

describe('payroll rules', () => {
  it('computes gross and net pay in whole francs', () => {
    expect(netSalary(250000, 25000, 15750)).toEqual({ gross: 275000, net: 259250 });
    expect(netSalary(250000, 0, 0)).toEqual({ gross: 250000, net: 250000 });
  });

  it('refuses negative amounts and deductions above the gross pay', () => {
    expect(netSalary(250000, -1, 0)).toEqual({ error: expect.stringMatching(/positifs/) });
    expect(netSalary(100000, 0, 150000)).toEqual({ error: expect.stringMatching(/dépassent le brut/) });
  });

  it('enforces draft → validated → paid', () => {
    expect(payslipProblem('DRAFT', 'pay')).toMatch(/Validez le bulletin/);
    expect(payslipProblem('VALIDATED', 'pay')).toBeNull();
    expect(payslipProblem('VALIDATED', 'validate')).toMatch(/brouillon/);
    expect(payslipProblem('DRAFT', 'edit')).toBeNull();
    expect(payslipProblem('PAID', 'edit')).toMatch(/déjà été payé/);
  });

  it('validates and labels periods', () => {
    expect(PERIOD_PATTERN.test('2026-10')).toBe(true);
    expect(PERIOD_PATTERN.test('2026-13')).toBe(false);
    expect(PERIOD_PATTERN.test('10/2026')).toBe(false);
    expect(periodLabel('2026-10')).toBe('octobre 2026');
  });
});

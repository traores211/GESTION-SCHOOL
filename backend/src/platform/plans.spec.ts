import { PLANS, QUOTA_KEYS, effectiveQuotas, isLimited, planOf } from './plans';

describe('plans', () => {
  it('ships three baseline plans', () => {
    expect(Object.keys(PLANS).sort()).toEqual(['ENTERPRISE', 'PRO', 'STARTER']);
  });

  it('STARTER has concrete numeric caps on every quota', () => {
    for (const key of QUOTA_KEYS) {
      // customDomains is 0 for STARTER (allowed), the others are positive.
      expect(typeof PLANS.STARTER.quotas[key]).toBe('number');
    }
  });

  it('ENTERPRISE lifts most caps to unlimited', () => {
    expect(PLANS.ENTERPRISE.quotas.students).toBeNull();
    expect(PLANS.ENTERPRISE.quotas.staffUsers).toBeNull();
    expect(PLANS.ENTERPRISE.quotas.storageMb).toBeNull();
  });

  it('planOf falls back to STARTER on an unknown id', () => {
    expect(planOf('UNKNOWN').id).toBe('STARTER');
    expect(planOf(null).id).toBe('STARTER');
    expect(planOf('PRO').id).toBe('PRO');
  });
});

describe('effectiveQuotas', () => {
  it('returns the plan defaults when there is no override', () => {
    expect(effectiveQuotas('STARTER')).toEqual(PLANS.STARTER.quotas);
  });

  it('merges a numeric override on top of the baseline', () => {
    const q = effectiveQuotas('STARTER', { students: 999, storageMb: 2048 });
    expect(q.students).toBe(999);
    expect(q.storageMb).toBe(2048);
    expect(q.classes).toBe(PLANS.STARTER.quotas.classes); // untouched
  });

  it('ignores a null override (keeps the baseline)', () => {
    const q = effectiveQuotas('PRO', { students: null, customDomains: null });
    expect(q.students).toBe(PLANS.PRO.quotas.students);
    expect(q.customDomains).toBe(PLANS.PRO.quotas.customDomains);
  });

  it('accepts an override of 0 (hard-cap to zero)', () => {
    const q = effectiveQuotas('ENTERPRISE', { customDomains: 0 });
    expect(q.customDomains).toBe(0);
  });
});

describe('isLimited', () => {
  it('tells whether a quota is capped or unlimited', () => {
    expect(isLimited(10)).toBe(true);
    expect(isLimited(0)).toBe(true);
    expect(isLimited(null)).toBe(false);
  });
});

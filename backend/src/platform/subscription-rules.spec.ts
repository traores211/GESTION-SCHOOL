import { schoolCode, schoolYear, slugify, subscriptionState } from './subscription-rules';

const now = new Date('2026-10-03T12:00:00Z');
const inDays = (n: number) => new Date(now.getTime() + n * 86400000);

describe('subscription state', () => {
  it('counts the days left in a trial and stays writable until the end', () => {
    const s = subscriptionState({ subscriptionStatus: 'TRIAL', subscriptionPlan: 'STARTER', trialEndsAt: inDays(12.5) }, now);
    expect(s).toMatchObject({ status: 'TRIAL', daysLeft: 13, readOnly: false });
    expect(subscriptionState({ subscriptionStatus: 'TRIAL', subscriptionPlan: 'STARTER', trialEndsAt: inDays(0.2) }, now).daysLeft).toBe(1);
  });

  it('becomes read-only when the trial is over or the subscription is suspended', () => {
    expect(subscriptionState({ subscriptionStatus: 'TRIAL', subscriptionPlan: 'STARTER', trialEndsAt: inDays(-1) }, now)).toMatchObject({ daysLeft: 0, readOnly: true });
    expect(subscriptionState({ subscriptionStatus: 'SUSPENDED', subscriptionPlan: 'PRO', trialEndsAt: null }, now)).toMatchObject({ daysLeft: null, readOnly: true });
  });

  it('never restricts an active subscription, even with an old trial date', () => {
    expect(subscriptionState({ subscriptionStatus: 'ACTIVE', subscriptionPlan: 'PRO', trialEndsAt: inDays(-90) }, now)).toMatchObject({ status: 'ACTIVE', daysLeft: null, readOnly: false });
    expect(subscriptionState({ subscriptionStatus: 'whatever', subscriptionPlan: 'STARTER', trialEndsAt: null }, now).status).toBe('ACTIVE');
  });
});

describe('naming a new school', () => {
  it('builds a slug and a code from the name', () => {
    expect(slugify('Groupe Scolaire « La Réussite »')).toBe('groupe-scolaire-la-reussite');
    expect(slugify('***')).toBe('ecole');
    expect(schoolCode('Groupe Scolaire La Réussite', 42)).toBe('GSR-0042');
    expect(schoolCode('Collège Notre-Dame de la Paix', 7)).toBe('CNDP-0007');
    expect(schoolCode('...', 1)).toBe('ECOLE-0001');
  });
});

describe('school year', () => {
  it('starts in September: October belongs to the year that just began', () => {
    const y = schoolYear(new Date(2026, 9, 3));
    expect(y.name).toBe('2026-2027');
    expect(y.terms.map((t) => t.order)).toEqual([1, 2, 3]);
    expect(y.startDate.toISOString().slice(0, 10)).toBe('2026-09-15');
    expect(y.endDate.toISOString().slice(0, 10)).toBe('2027-06-30');
  });

  it('a date in spring belongs to the year started the previous September', () => {
    expect(schoolYear(new Date(2027, 3, 10)).name).toBe('2026-2027');
    expect(schoolYear(new Date(2027, 7, 20)).name).toBe('2027-2028');
  });
});

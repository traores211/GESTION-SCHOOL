/** Subscription rules, pure so they are unit tested. */

export type SubscriptionStatus = 'TRIAL' | 'ACTIVE' | 'SUSPENDED';

export interface SubscriptionState {
  status: SubscriptionStatus;
  plan: string;
  trialEndsAt: Date | null;
  /** Whole days left in the trial (0 on the last day); null outside a trial. */
  daysLeft: number | null;
  /** True when the school can only read its data (trial over or subscription suspended). */
  readOnly: boolean;
}

export const TRIAL_DAYS = Number(process.env.TRIAL_DAYS || 30);

export function subscriptionState(org: { subscriptionStatus: string; subscriptionPlan: string; trialEndsAt: Date | null }, now = new Date()): SubscriptionState {
  const status = (['TRIAL', 'ACTIVE', 'SUSPENDED'].includes(org.subscriptionStatus) ? org.subscriptionStatus : 'ACTIVE') as SubscriptionStatus;
  const inTrial = status === 'TRIAL' && org.trialEndsAt !== null;
  const daysLeft = inTrial ? Math.max(0, Math.ceil((org.trialEndsAt!.getTime() - now.getTime()) / 86400000)) : null;
  const trialOver = inTrial && org.trialEndsAt!.getTime() <= now.getTime();
  return { status, plan: org.subscriptionPlan, trialEndsAt: org.trialEndsAt, daysLeft, readOnly: status === 'SUSPENDED' || trialOver };
}

/** "Groupe Scolaire La Réussite" → "groupe-scolaire-la-reussite" */
export function slugify(name: string): string {
  return (
    name
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 50) || 'ecole'
  );
}

/** School code shown in the public address: initials of the name and a number ("GSLR-0042"). */
export function schoolCode(name: string, number: number): string {
  const initials = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^A-Za-z0-9]+/)
    .filter((w) => w.length > 2 || /^[A-Z0-9]+$/.test(w))
    .map((w) => w[0].toUpperCase())
    .join('')
    .slice(0, 5);
  return `${initials || 'ECOLE'}-${String(number).padStart(4, '0')}`;
}

/** School year containing a date: starts in September, ends in June ("2026-2027"), three terms. */
export function schoolYear(today: Date) {
  const start = today.getMonth() >= 7 ? today.getFullYear() : today.getFullYear() - 1;
  const d = (y: number, m: number, day: number) => new Date(Date.UTC(y, m - 1, day));
  return {
    name: `${start}-${start + 1}`,
    startDate: d(start, 9, 15),
    endDate: d(start + 1, 6, 30),
    terms: [
      { name: 'Trimestre 1', order: 1, startDate: d(start, 9, 15), endDate: d(start, 12, 19) },
      { name: 'Trimestre 2', order: 2, startDate: d(start + 1, 1, 5), endDate: d(start + 1, 3, 27) },
      { name: 'Trimestre 3', order: 3, startDate: d(start + 1, 4, 6), endDate: d(start + 1, 6, 30) },
    ],
  };
}

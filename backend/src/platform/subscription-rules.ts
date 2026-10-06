/** Subscription rules, pure so they are unit tested. */

import { LIFECYCLE_STATES, LifecycleState, isLifecycleState, isReadOnly } from './lifecycle';

/**
 * Status values exposed to the rest of the application. Historically only TRIAL / ACTIVE /
 * SUSPENDED existed; the lifecycle machine (PROSPECT, PENDING, EXPIRED, CLOSED) added more. All
 * are kept here so dashboards and the subscription interceptor can read a single enum.
 */
export type SubscriptionStatus = LifecycleState;

export interface SubscriptionState {
  status: SubscriptionStatus;
  plan: string;
  trialEndsAt: Date | null;
  /** Whole days left in the trial (0 on the last day); null outside a trial. */
  daysLeft: number | null;
  /** True when the school can only read its data (trial over, subscription suspended, closed). */
  readOnly: boolean;
  /** True when the organisation accounts may still sign in (false only for CLOSED). */
  loginAllowed: boolean;
}

export const TRIAL_DAYS = Number(process.env.TRIAL_DAYS || 30);

export function subscriptionState(org: { subscriptionStatus: string; subscriptionPlan: string; trialEndsAt: Date | null }, now = new Date()): SubscriptionState {
  // Unknown values fall back to ACTIVE: a bug in the database never locks a school out.
  const status: LifecycleState = isLifecycleState(org.subscriptionStatus) ? org.subscriptionStatus : 'ACTIVE';
  const inTrial = status === 'TRIAL' && org.trialEndsAt !== null;
  const daysLeft = inTrial ? Math.max(0, Math.ceil((org.trialEndsAt!.getTime() - now.getTime()) / 86400000)) : null;
  const trialOver = inTrial && org.trialEndsAt!.getTime() <= now.getTime();
  return {
    status,
    plan: org.subscriptionPlan,
    trialEndsAt: org.trialEndsAt,
    daysLeft,
    // A TRIAL whose end date is past reads as read-only straight away, even before the state
    // machine lazily promotes it to EXPIRED on the next back-office read.
    readOnly: isReadOnly(status) || trialOver,
    loginAllowed: status !== 'CLOSED',
  };
}

/** True when the organisation accepts writes right now (negation of SubscriptionState.readOnly). */
export function isWritable(org: { subscriptionStatus: string; subscriptionPlan: string; trialEndsAt: Date | null }, now = new Date()): boolean {
  return !subscriptionState(org, now).readOnly;
}

/** List the possible subscription states, in display order (used by the back office). */
export function listStates(): readonly SubscriptionStatus[] {
  return LIFECYCLE_STATES;
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

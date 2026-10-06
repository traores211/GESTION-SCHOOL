/**
 * The subscription state machine of an organisation (one establishment or a group of schools).
 * All transitions pass through `assertTransition`; the service module writes a lifecycle event
 * for every allowed change so the whole history can be shown and audited.
 */

export const LIFECYCLE_STATES = ['PROSPECT', 'PENDING', 'TRIAL', 'ACTIVE', 'SUSPENDED', 'EXPIRED', 'CLOSED'] as const;
export type LifecycleState = (typeof LIFECYCLE_STATES)[number];

export function isLifecycleState(value: unknown): value is LifecycleState {
  return typeof value === 'string' && (LIFECYCLE_STATES as readonly string[]).includes(value);
}

/**
 * Allowed transitions. The right-hand side lists the states a given state may move to.
 * Rules of thumb:
 *   - any paying lifecycle can be SUSPENDED and reactivated (ACTIVE ↔ SUSPENDED).
 *   - a trial can go straight to ACTIVE (payment received) or EXPIRE on its own (automatic).
 *   - EXPIRED and SUSPENDED can both come back to ACTIVE if the school pays or the editor allows it.
 *   - CLOSED is a terminal state (the data is kept for retention, no further transition).
 */
export const TRANSITIONS: Record<LifecycleState, readonly LifecycleState[]> = {
  PROSPECT: ['PENDING', 'TRIAL', 'ACTIVE', 'CLOSED'],
  PENDING: ['TRIAL', 'ACTIVE', 'CLOSED'],
  TRIAL: ['ACTIVE', 'EXPIRED', 'SUSPENDED', 'CLOSED'],
  // ACTIVE → TRIAL is allowed because an administrator sometimes extends a free period on top
  // of an active subscription (migration gift, retention action).
  ACTIVE: ['TRIAL', 'SUSPENDED', 'EXPIRED', 'CLOSED'],
  SUSPENDED: ['ACTIVE', 'TRIAL', 'CLOSED'],
  EXPIRED: ['ACTIVE', 'TRIAL', 'CLOSED'],
  CLOSED: [], // terminal: a new organisation must be created to come back
};

/** Transitions a non-privileged administrator (the editor) can trigger from the back office. */
export const MANUAL_TRANSITIONS: Readonly<Record<LifecycleState, readonly LifecycleState[]>> = TRANSITIONS;

/**
 * Transitions that happen on their own (not triggered by an administrator). Today: a running
 * TRIAL whose trialEndsAt is past becomes EXPIRED next time it is read.
 */
export const AUTO_TRANSITIONS: Readonly<Record<LifecycleState, readonly LifecycleState[]>> = {
  PROSPECT: [],
  PENDING: [],
  TRIAL: ['EXPIRED'],
  ACTIVE: [],
  SUSPENDED: [],
  EXPIRED: [],
  CLOSED: [],
};

/** True when `to` is reachable from `from`. Null/same-value is accepted (nothing to do). */
export function canTransition(from: LifecycleState | null | undefined, to: LifecycleState): boolean {
  if (!from) return true; // first event (sign-up / creation)
  if (from === to) return true; // idempotent (useful for the lazy expiry)
  return (TRANSITIONS[from] ?? []).includes(to);
}

/** Throws when the transition is invalid. The caller catches and translates to a 400 Bad Request. */
export function assertTransition(from: LifecycleState | null | undefined, to: LifecycleState): void {
  if (!isLifecycleState(to)) {
    throw new Error(`Statut inconnu : ${to}`);
  }
  if (!canTransition(from, to)) {
    throw new Error(`Transition interdite : ${from} → ${to}`);
  }
}

/**
 * True when the status forbids writes (read-only mode): SUSPENDED, EXPIRED and CLOSED.
 * A TRIAL whose end date is past is also read-only in effect, but the lazy promotion to EXPIRED
 * is what turns it into a real EXPIRED row.
 */
export function isReadOnly(state: LifecycleState): boolean {
  return state === 'SUSPENDED' || state === 'EXPIRED' || state === 'CLOSED';
}

/** True when the school may still sign in (CLOSED locks the doors; everything else does not). */
export function isLoginAllowed(state: LifecycleState): boolean {
  return state !== 'CLOSED';
}

/** Human-readable label used in the UI and in the notification messages. */
export const LIFECYCLE_LABELS: Record<LifecycleState, string> = {
  PROSPECT: 'Prospect',
  PENDING: 'Dossier en attente',
  TRIAL: "Période d'essai",
  ACTIVE: 'Abonné',
  SUSPENDED: 'Suspendu',
  EXPIRED: 'Essai terminé',
  CLOSED: 'Clôturé',
};

/** Reason labels used when writing a lifecycle event (shown in the history). */
export const LIFECYCLE_REASONS = {
  SIGNUP: "Création de l'espace",
  VALIDATE: 'Dossier validé',
  START_TRIAL: "Démarrage de l'essai gratuit",
  EXTEND_TRIAL: "Prolongation de l'essai",
  ACTIVATE: "Activation de l'abonnement",
  SUSPEND: "Suspension",
  EXPIRE: "Fin de l'essai",
  CLOSE: "Clôture",
  REOPEN: "Réouverture",
  PLAN_CHANGE: 'Changement de formule',
} as const;
export type LifecycleReason = keyof typeof LIFECYCLE_REASONS;

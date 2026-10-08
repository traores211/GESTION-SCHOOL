import { TRANSITIONS, assertTransition, canTransition, isLifecycleState, isLoginAllowed, isReadOnly } from './lifecycle';
import { subscriptionState } from './subscription-rules';

describe('lifecycle state machine', () => {
  it('exposes seven states', () => {
    expect(Object.keys(TRANSITIONS).sort()).toEqual(['ACTIVE', 'CLOSED', 'EXPIRED', 'PENDING', 'PROSPECT', 'SUSPENDED', 'TRIAL']);
  });

  it('accepts the brief\'s canonical journey', () => {
    const journey: ReadonlyArray<[string, string]> = [
      ['PROSPECT', 'PENDING'],
      ['PENDING', 'TRIAL'],
      ['TRIAL', 'ACTIVE'],
      ['ACTIVE', 'SUSPENDED'],
      ['SUSPENDED', 'ACTIVE'],
      ['ACTIVE', 'EXPIRED'],
      ['EXPIRED', 'CLOSED'],
    ];
    for (const [from, to] of journey) {
      expect(canTransition(from as never, to as never)).toBe(true);
    }
  });

  it('allows idempotent and first transitions', () => {
    expect(canTransition(null, 'TRIAL')).toBe(true);
    expect(canTransition('ACTIVE', 'ACTIVE')).toBe(true);
  });

  it('forbids impossible jumps', () => {
    expect(canTransition('CLOSED', 'ACTIVE')).toBe(false); // CLOSED is terminal
    expect(canTransition('PROSPECT', 'EXPIRED')).toBe(false); // cannot expire what never ran
    expect(canTransition('PENDING', 'SUSPENDED')).toBe(false); // nothing to suspend yet
    expect(() => assertTransition('CLOSED', 'ACTIVE')).toThrow(/interdite/);
  });

  it('rejects unknown target states up front', () => {
    expect(() => assertTransition('ACTIVE', 'WHATEVER' as never)).toThrow(/inconnu/);
    expect(isLifecycleState('WHATEVER')).toBe(false);
    expect(isLifecycleState('ACTIVE')).toBe(true);
  });
});

describe('read-only states', () => {
  it('are SUSPENDED, EXPIRED and CLOSED', () => {
    expect(isReadOnly('SUSPENDED')).toBe(true);
    expect(isReadOnly('EXPIRED')).toBe(true);
    expect(isReadOnly('CLOSED')).toBe(true);
    expect(isReadOnly('TRIAL')).toBe(false);
    expect(isReadOnly('ACTIVE')).toBe(false);
  });

  it('bar sign-in only when CLOSED', () => {
    expect(isLoginAllowed('CLOSED')).toBe(false);
    expect(isLoginAllowed('SUSPENDED')).toBe(true);
    expect(isLoginAllowed('EXPIRED')).toBe(true);
  });
});

describe('subscriptionState picks up the new states', () => {
  const base = { subscriptionPlan: 'PRO', trialEndsAt: null };
  it('EXPIRED is read-only, keeps login', () => {
    expect(subscriptionState({ subscriptionStatus: 'EXPIRED', ...base })).toMatchObject({ status: 'EXPIRED', readOnly: true, loginAllowed: true });
  });
  it('CLOSED is read-only AND locks sign-in', () => {
    expect(subscriptionState({ subscriptionStatus: 'CLOSED', ...base })).toMatchObject({ status: 'CLOSED', readOnly: true, loginAllowed: false });
  });
  it('PROSPECT and PENDING are writable and accept sign-in', () => {
    expect(subscriptionState({ subscriptionStatus: 'PROSPECT', ...base }).readOnly).toBe(false);
    expect(subscriptionState({ subscriptionStatus: 'PENDING', ...base }).loginAllowed).toBe(true);
  });
});

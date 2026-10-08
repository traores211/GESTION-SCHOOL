import { gateMessage, isEarlyExit, isLate, minutesOf, nextKind } from './gate-rules';

const at = (h: number, m: number, day = 5) => new Date(2026, 9, day, h, m, 0);

describe('gate rules', () => {
  it('alternates arrival and departure within a day', () => {
    expect(nextKind(null, at(7, 20))).toBe('ENTREE');
    expect(nextKind({ kind: 'ENTREE', occurredAt: at(7, 20) }, at(12, 0))).toBe('SORTIE');
    expect(nextKind({ kind: 'SORTIE', occurredAt: at(12, 0) }, at(14, 0))).toBe('ENTREE');
  });

  it('starts every day with an arrival, even if the pupil was not checked out the day before', () => {
    expect(nextKind({ kind: 'ENTREE', occurredAt: at(7, 20, 4) }, at(7, 25, 5))).toBe('ENTREE');
  });

  it('reads times and refuses nonsense', () => {
    expect(minutesOf('07:30')).toBe(450);
    expect(minutesOf('7:05')).toBe(425);
    expect(minutesOf('25:00')).toBeNull();
    expect(minutesOf('matin')).toBeNull();
  });

  it('flags a late arrival after the tolerance', () => {
    expect(isLate(at(7, 15), '07:00')).toBe(false);
    expect(isLate(at(7, 16), '07:00')).toBe(true);
    expect(isLate(at(9, 0), 'inconnu')).toBe(false);
  });

  it('flags an exit before the end of the day', () => {
    expect(isEarlyExit(at(15, 30), '18:00')).toBe(true);
    expect(isEarlyExit(at(18, 0), '18:00')).toBe(false);
  });

  it('writes the message for the family, agreeing with the gender', () => {
    expect(gateMessage({ firstName: 'Alice', gender: 'F' }, 'ENTREE', at(7, 32))).toBe('Votre enfant Alice est arrivée à 07:32.');
    expect(gateMessage({ firstName: 'Paul', gender: 'M' }, 'ENTREE', at(7, 5))).toBe('Votre enfant Paul est arrivé à 07:05.');
    expect(gateMessage({ firstName: 'Alice', gender: 'F' }, 'SORTIE', at(17, 4))).toBe("Votre enfant Alice a quitté l'établissement à 17:04.");
    expect(gateMessage({ firstName: 'Paul', gender: 'M' }, 'SORTIE', at(15, 0), 'Jean KOUASSI')).toBe("Votre enfant Paul a quitté l'établissement à 15:00, accompagné de Jean KOUASSI.");
  });
});

import { canMoveYear, canonicalLevel, classCode, nextClassName, nextLevel, proposedOutcome, yearIsFrozen } from './promotion-rules';

describe('promotion rules', () => {
  it('climbs the ladder of levels, primary to lycée', () => {
    expect(nextLevel('CM2')).toBe('6ème');
    expect(nextLevel('6ème')).toBe('5ème');
    expect(nextLevel('3eme')).toBe('2nde');
    expect(nextLevel('Terminale')).toBeNull();
    expect(nextLevel('Maternelle')).toBeNull();
    expect(canonicalLevel('6E')).toBe('6ème');
  });

  it('names the next class by keeping the section', () => {
    expect(nextClassName('6ème A', '6ème')).toBe('5ème A');
    expect(nextClassName('CM2', 'CM2')).toBe('6ème');
    expect(nextClassName('Sixième B', '6ème')).toBe('5ème B');
    expect(nextClassName('1ère D2', '1ère')).toBe('Tle D2');
    expect(nextClassName('Tle D', 'Tle')).toBeNull();
  });

  it('derives a short class code', () => {
    expect(classCode('5ème A')).toBe('5A');
    expect(classCode('Tle D1')).toBe('TLED1');
    expect(classCode('CM2')).toBe('CM2');
  });

  it('proposes the council decision first, then the annual average', () => {
    expect(proposedOutcome({ councilDecision: 'ADMIS', annualAverage: 8, level: '6ème' })).toBe('ADMIS');
    expect(proposedOutcome({ councilDecision: 'REDOUBLE', annualAverage: 14, level: '6ème' })).toBe('REDOUBLE');
    expect(proposedOutcome({ councilDecision: 'EXCLU', annualAverage: 14, level: '6ème' })).toBe('SORTANT');
    expect(proposedOutcome({ councilDecision: null, annualAverage: 10, level: '6ème' })).toBe('ADMIS');
    expect(proposedOutcome({ councilDecision: null, annualAverage: 9.99, level: '6ème' })).toBe('REDOUBLE');
    expect(proposedOutcome({ councilDecision: null, annualAverage: null, level: '6ème' })).toBeNull();
  });

  it('makes the pupils who pass the last level leave', () => {
    expect(proposedOutcome({ councilDecision: 'ADMIS', annualAverage: 12, level: 'Tle' })).toBe('SORTANT');
    expect(proposedOutcome({ councilDecision: null, annualAverage: 7, level: 'Tle' })).toBe('REDOUBLE');
  });

  it('moves a school year through its life cycle', () => {
    expect(canMoveYear('PREPARATION', 'OUVERTE')).toBe(true);
    expect(canMoveYear('OUVERTE', 'CLOTUREE')).toBe(true);
    expect(canMoveYear('CLOTUREE', 'OUVERTE')).toBe(true);
    expect(canMoveYear('CLOTUREE', 'ARCHIVEE')).toBe(true);
    expect(canMoveYear('ARCHIVEE', 'OUVERTE')).toBe(false);
    expect(canMoveYear('OUVERTE', 'ARCHIVEE')).toBe(false);
    expect(yearIsFrozen('CLOTUREE') && yearIsFrozen('ARCHIVEE') && !yearIsFrozen('OUVERTE')).toBe(true);
  });
});

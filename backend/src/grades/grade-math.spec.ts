import { classAverages, generalAverage, rankLabel, ranks, subjectAverage, DEFAULT_DISTINCTIONS, annualAverage, appreciation, distinction, passRate, suggestedDecision } from './grade-math';

const g = (studentId: string, subjectId: string, score: number, maxScore = 20, coefficient = 1) => ({ studentId, subjectId, score, maxScore, coefficient });

describe('report card arithmetic', () => {
  it('brings every mark back to /20 and weights it', () => {
    expect(subjectAverage([g('a', 'm', 15), g('a', 'm', 8, 10)])).toBeCloseTo(15.5);
    expect(subjectAverage([g('a', 'm', 10, 20, 1), g('a', 'm', 16, 20, 3)])).toBeCloseTo(14.5);
    expect(subjectAverage([])).toBeNull();
    expect(subjectAverage([g('a', 'm', 12, 0)])).toBeNull(); // a zero scale is ignored, not a division by zero
  });

  it('leaves ungraded subjects out of the general average', () => {
    expect(generalAverage([{ average: 12, coefficient: 4 }, { average: 16, coefficient: 2 }, { average: null, coefficient: 3 }])).toBeCloseTo(13.333, 2);
    expect(generalAverage([{ average: null, coefficient: 2 }])).toBeNull();
  });

  it('ranks with ties and leaves pupils without marks unranked', () => {
    const averages = new Map<string, number | null>([
      ['a', 14.5],
      ['b', 12],
      ['c', 14.5],
      ['d', 9.25],
      ['e', null],
    ]);
    const r = ranks(averages);
    expect(r.get('a')).toEqual({ rank: 1, tied: true });
    expect(r.get('c')).toEqual({ rank: 1, tied: true });
    expect(r.get('b')).toEqual({ rank: 3, tied: false });
    expect(r.get('d')?.rank).toBe(4);
    expect(r.has('e')).toBe(false);
    expect(rankLabel(r.get('a'))).toBe('1er ex æquo');
    expect(rankLabel(r.get('b'))).toBe('3e');
  });

  it('computes the general average of each pupil of a class', () => {
    const coefficients = new Map([
      ['math', 4],
      ['fr', 3],
    ]);
    const averages = classAverages([g('a', 'math', 16), g('a', 'fr', 9), g('b', 'math', 10), g('b', 'fr', 14), g('b', 'eps', 20)], coefficients);
    expect(averages.get('a')).toBeCloseTo((16 * 4 + 9 * 3) / 7);
    expect(averages.get('b')).toBeCloseTo((10 * 4 + 14 * 3) / 7); // subjects outside the class programme are ignored
  });
});

describe('report card wording', () => {
  it('gives the usual appreciation of an average', () => {
    expect([19, 16, 14.2, 12, 10, 9.99, 6, 2, null].map(appreciation)).toEqual(['Excellent', 'Très bien', 'Bien', 'Assez bien', 'Passable', 'Insuffisant', 'Faible', 'Très faible', null]);
  });

  it('awards distinctions and sanctions on the thresholds', () => {
    expect(distinction(16)?.code).toBe('FELICITATIONS');
    expect(distinction(15.999)?.code).toBe('FELICITATIONS'); // 16.00 once rounded to the hundredth
    expect(distinction(14)?.code).toBe('ENCOURAGEMENTS');
    expect(distinction(12)?.code).toBe('TABLEAU_HONNEUR');
    expect(distinction(11.99)).toBeNull();
    expect(distinction(8.5)).toBeNull();
    expect(distinction(8.49)?.code).toBe('AVERTISSEMENT');
    expect(distinction(6.99)?.code).toBe('BLAME');
    expect(distinction(null)).toBeNull();
    expect(distinction(13, { ...DEFAULT_DISTINCTIONS, honours: 13.5 })).toBeNull();
  });

  it('weights the annual average: first term once, the others twice', () => {
    expect(annualAverage([{ order: 1, average: 10 }, { order: 2, average: 12 }, { order: 3, average: 14 }])).toBeCloseTo((10 + 24 + 28) / 5);
    expect(annualAverage([{ order: 2, average: 12 }, { order: 1, average: 9 }])).toBeCloseTo((9 + 24) / 3);
    // A term without marks is left out instead of counting as zero.
    expect(annualAverage([{ order: 1, average: 10 }, { order: 2, average: null }, { order: 3, average: 13 }])).toBeCloseTo((10 + 26) / 3);
    expect(annualAverage([{ order: 1, average: null }])).toBeNull();
  });

  it('suggests the council decision and computes the pass rate', () => {
    expect([12, 10, 9.996, 9.99, 8.5, 8.49, null].map((a) => suggestedDecision(a))).toEqual(['ADMIS', 'ADMIS', 'ADMIS', 'REDOUBLE', 'REDOUBLE', 'EXCLU', null]);
    expect(passRate([12, 9, 10, null])).toBe(66.7);
    expect(passRate([null])).toBeNull();
  });
});

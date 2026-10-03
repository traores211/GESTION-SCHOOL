import { classAverages, generalAverage, rankLabel, ranks, subjectAverage } from './grade-math';

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

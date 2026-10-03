/** Report card arithmetic, pure so it is unit tested. All averages are on 20. */

export interface GradeLike {
  studentId: string;
  subjectId: string;
  score: number;
  maxScore: number;
  coefficient: number;
}

/** Weighted average on 20 of a set of marks (each mark brought back to /20), or null without marks. */
export function subjectAverage(grades: Pick<GradeLike, 'score' | 'maxScore' | 'coefficient'>[]): number | null {
  const valid = grades.filter((g) => g.maxScore > 0 && g.coefficient > 0);
  const weight = valid.reduce((s, g) => s + g.coefficient, 0);
  if (!weight) return null;
  return valid.reduce((s, g) => s + (g.score / g.maxScore) * 20 * g.coefficient, 0) / weight;
}

/** General average from subject averages and subject coefficients; ungraded subjects are left out. */
export function generalAverage(rows: { average: number | null; coefficient: number }[]): number | null {
  const graded = rows.filter((r): r is { average: number; coefficient: number } => r.average !== null && r.coefficient > 0);
  const weight = graded.reduce((s, r) => s + r.coefficient, 0);
  return weight ? graded.reduce((s, r) => s + r.average * r.coefficient, 0) / weight : null;
}

/** General average of every student of a class for a term. */
export function classAverages(grades: GradeLike[], subjectCoefficients: Map<string, number>): Map<string, number | null> {
  const byStudent = new Map<string, GradeLike[]>();
  for (const g of grades) byStudent.set(g.studentId, [...(byStudent.get(g.studentId) ?? []), g]);
  const result = new Map<string, number | null>();
  for (const [studentId, list] of byStudent) {
    const rows = [...subjectCoefficients.entries()].map(([subjectId, coefficient]) => ({ coefficient, average: subjectAverage(list.filter((g) => g.subjectId === subjectId)) }));
    result.set(studentId, generalAverage(rows));
  }
  return result;
}

/**
 * Competition ranking with ties ("1, 2, 2, 4"): equal averages (to the hundredth) share a rank.
 * Students without an average are not ranked.
 */
export function ranks(averages: Map<string, number | null>): Map<string, { rank: number; tied: boolean }> {
  const sorted = [...averages.entries()].filter((e): e is [string, number] => e[1] !== null).sort((a, b) => b[1] - a[1]);
  const result = new Map<string, { rank: number; tied: boolean }>();
  const key = (n: number) => Math.round(n * 100);
  for (const [id, avg] of sorted) {
    const first = sorted.findIndex(([, a]) => key(a) === key(avg));
    const count = sorted.filter(([, a]) => key(a) === key(avg)).length;
    result.set(id, { rank: first + 1, tied: count > 1 });
  }
  return result;
}

/** "1er", "2e", "3e ex æquo". */
export function rankLabel(rank: { rank: number; tied: boolean } | undefined): string | null {
  if (!rank) return null;
  return `${rank.rank === 1 ? '1er' : `${rank.rank}e`}${rank.tied ? ' ex æquo' : ''}`;
}

export const round2 = (n: number | null) => (n === null ? null : Math.round(n * 100) / 100);

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

// ---------------------------------------------------------------- report card wording (Côte d'Ivoire)

/** Usual appreciation of an average on 20, used when the teacher wrote none. */
export function appreciation(average: number | null): string | null {
  if (average === null) return null;
  if (average >= 18) return 'Excellent';
  if (average >= 16) return 'Très bien';
  if (average >= 14) return 'Bien';
  if (average >= 12) return 'Assez bien';
  if (average >= 10) return 'Passable';
  if (average >= 8) return 'Insuffisant';
  if (average >= 5) return 'Faible';
  return 'Très faible';
}

export interface DistinctionScale {
  honours: number;
  encouragement: number;
  congratulations: number;
  warning: number;
  reprimand: number;
}

/** Thresholds most Ivorian secondary schools use; a school can set its own. */
export const DEFAULT_DISTINCTIONS: DistinctionScale = { honours: 12, encouragement: 14, congratulations: 16, warning: 8.5, reprimand: 7 };

/** Distinction or sanction of the class council for a term average. */
export function distinction(average: number | null, scale: DistinctionScale = DEFAULT_DISTINCTIONS): { code: string; label: string } | null {
  if (average === null) return null;
  const a = Math.round(average * 100) / 100;
  if (a >= scale.congratulations) return { code: 'FELICITATIONS', label: "Tableau d'honneur avec félicitations" };
  if (a >= scale.encouragement) return { code: 'ENCOURAGEMENTS', label: "Tableau d'honneur avec encouragements" };
  if (a >= scale.honours) return { code: 'TABLEAU_HONNEUR', label: "Tableau d'honneur" };
  if (a < scale.reprimand) return { code: 'BLAME', label: 'Blâme pour travail insuffisant' };
  if (a < scale.warning) return { code: 'AVERTISSEMENT', label: 'Avertissement pour travail insuffisant' };
  return null;
}

/**
 * Annual average: the first term counts once, the following ones twice — (T1 + 2×T2 + 2×T3) / 5 for
 * trimesters, (S1 + 2×S2) / 3 for semesters. Terms without an average are left out.
 */
export function annualAverage(terms: { order: number; average: number | null }[]): number | null {
  const sorted = [...terms].sort((a, b) => a.order - b.order);
  const first = sorted[0]?.order;
  const graded = sorted.filter((t): t is { order: number; average: number } => t.average !== null);
  const weight = graded.reduce((s, t) => s + (t.order === first ? 1 : 2), 0);
  return weight ? graded.reduce((s, t) => s + t.average * (t.order === first ? 1 : 2), 0) / weight : null;
}

export type CouncilDecision = 'ADMIS' | 'REDOUBLE' | 'EXCLU';

export const DECISION_LABELS: Record<CouncilDecision, string> = {
  ADMIS: 'Admis(e) en classe supérieure',
  REDOUBLE: 'Autorisé(e) à redoubler',
  EXCLU: 'Non autorisé(e) à redoubler',
};

/** What the annual average suggests; the class council decides and may depart from it. */
export function suggestedDecision(annual: number | null, passMark = 10, repeatMark = 8.5): CouncilDecision | null {
  if (annual === null) return null;
  const a = Math.round(annual * 100) / 100;
  return a >= passMark ? 'ADMIS' : a >= repeatMark ? 'REDOUBLE' : 'EXCLU';
}

/** Pass rate (share of ranked pupils at or above the pass mark), in percent with one decimal. */
export function passRate(averages: (number | null)[], passMark = 10): number | null {
  const ranked = averages.filter((a): a is number => a !== null);
  return ranked.length ? Math.round((ranked.filter((a) => Math.round(a * 100) / 100 >= passMark).length / ranked.length) * 1000) / 10 : null;
}

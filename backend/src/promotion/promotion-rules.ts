/**
 * End-of-year promotion rules (Ivorian system): the ladder of levels, the name of the next class and
 * the outcome proposed for each pupil. Pure functions: no database, tested on their own.
 */
export const OUTCOMES = ['ADMIS', 'REDOUBLE', 'ORIENTE', 'SORTANT'] as const;
export type Outcome = (typeof OUTCOMES)[number];

export const YEAR_STATUSES = ['PREPARATION', 'OUVERTE', 'CLOTUREE', 'ARCHIVEE'] as const;
export type YearStatus = (typeof YEAR_STATUSES)[number];

/** Allowed moves of a school year; a closed year may be reopened, an archived one is final. */
const YEAR_MOVES: Record<YearStatus, YearStatus[]> = {
  PREPARATION: ['OUVERTE'],
  OUVERTE: ['CLOTUREE'],
  CLOTUREE: ['OUVERTE', 'ARCHIVEE'],
  ARCHIVEE: [],
};
export const canMoveYear = (from: string, to: string) => (YEAR_MOVES[from as YearStatus] ?? []).includes(to as YearStatus);
/** Marks, roll calls and enrolments are frozen once the year is closed. */
export const yearIsFrozen = (status: string) => status === 'CLOTUREE' || status === 'ARCHIVEE';

const LADDER = ['CP1', 'CP2', 'CE1', 'CE2', 'CM1', 'CM2', '6ème', '5ème', '4ème', '3ème', '2nde', '1ère', 'Tle'];
const ALIASES: Record<string, string> = {
  '6eme': '6ème', '6e': '6ème', sixieme: '6ème',
  '5eme': '5ème', '5e': '5ème', cinquieme: '5ème',
  '4eme': '4ème', '4e': '4ème', quatrieme: '4ème',
  '3eme': '3ème', '3e': '3ème', troisieme: '3ème',
  '2nde': '2nde', '2nd': '2nde', seconde: '2nde',
  '1ere': '1ère', '1re': '1ère', premiere: '1ère',
  tle: 'Tle', terminale: 'Tle', term: 'Tle',
  cp1: 'CP1', cp2: 'CP2', ce1: 'CE1', ce2: 'CE2', cm1: 'CM1', cm2: 'CM2',
};
const plain = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

/** Canonical level ("6eme" → "6ème"), or null when the level is not on the ladder. */
export function canonicalLevel(level: string): string | null {
  return ALIASES[plain(level)] ?? null;
}

/** The level above, null for the last one (Terminale) or for a level the ladder does not know. */
export function nextLevel(level: string): string | null {
  const canonical = canonicalLevel(level);
  if (!canonical) return null;
  return LADDER[LADDER.indexOf(canonical) + 1] ?? null;
}

/** Levels that end with an official examination: the pupils who pass leave the cycle or the school. */
export const isLastLevel = (level: string) => canonicalLevel(level) === 'Tle';

/** "6ème A" → "5ème A": the level is replaced, the rest of the name (section, series) is kept. */
export function nextClassName(name: string, level: string): string | null {
  const next = nextLevel(level);
  if (!next) return null;
  const trimmed = name.trim();
  const levelPattern = new RegExp(`^${level.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i');
  if (levelPattern.test(trimmed)) return `${next}${trimmed.slice(level.trim().length)}`;
  // The name does not start with its level ("Sixième A"): the suffix after the first word is kept
  const rest = trimmed.split(/\s+/).slice(1).join(' ');
  return rest ? `${next} ${rest}` : next;
}

/** Short code of a class from its name: "5ème A" → "5A", "Tle D1" → "TLED1". */
export function classCode(name: string): string {
  const code = plain(name).replace(/eme|ere|nde/g, '').replace(/[^a-z0-9]/g, '').toUpperCase();
  return code.slice(0, 10) || 'CLASSE';
}

/**
 * Outcome proposed for a pupil: the decision of the class council when there is one, otherwise the
 * annual average against the pass mark. It is a proposal: the management confirms or changes it.
 */
export function proposedOutcome(input: { councilDecision: string | null; annualAverage: number | null; level: string; passMark?: number }): Outcome | null {
  const pass = input.passMark ?? 10;
  let admitted: boolean | null = null;
  if (input.councilDecision === 'ADMIS') admitted = true;
  else if (input.councilDecision === 'REDOUBLE') admitted = false;
  else if (input.councilDecision === 'EXCLU') return 'SORTANT';
  else if (input.annualAverage !== null) admitted = input.annualAverage >= pass;
  if (admitted === null) return null;
  if (!admitted) return 'REDOUBLE';
  return isLastLevel(input.level) || !nextLevel(input.level) ? 'SORTANT' : 'ADMIS';
}

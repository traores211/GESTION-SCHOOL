/** Normalization of the free text found in timetable files: days, times, and name comparison keys. */

export function stripAccents(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/** Lowercase, no accents, punctuation turned into spaces, collapsed whitespace. */
export function textKey(value: string) {
  return stripAccents(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function cleanCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).replace(/ /g, ' ').replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();
}

// ------------------------------------------------------------------ days

const DAY_ALIASES: Record<string, number> = {
  lundi: 1, lun: 1, monday: 1, mon: 1,
  mardi: 2, mar: 2, tuesday: 2, tue: 2, tues: 2,
  mercredi: 3, mer: 3, merc: 3, wednesday: 3, wed: 3,
  jeudi: 4, jeu: 4, thursday: 4, thu: 4, thur: 4, thurs: 4,
  vendredi: 5, ven: 5, vend: 5, friday: 5, fri: 5,
  samedi: 6, sam: 6, saturday: 6, sat: 6,
  dimanche: 7, dim: 7, sunday: 7, sun: 7,
};

/** "Lundi", "LUN.", "monday" → 1. Only whole-cell matches (and "Lundi matin"), never a guess. */
export function parseDay(value: string | null | undefined): number | null {
  if (!value) return null;
  const key = textKey(value);
  if (!key) return null;
  if (DAY_ALIASES[key]) return DAY_ALIASES[key];
  const [first, ...rest] = key.split(' ');
  if (DAY_ALIASES[first] && first.length >= 3 && rest.every((w) => ['matin', 'apres', 'midi', 'soir', 'am', 'pm'].includes(w))) {
    return DAY_ALIASES[first];
  }
  return null;
}

/** Finds a day word anywhere in a line of text ("Lundi 08h-10h Maths"). */
export function findDayInText(value: string): number | null {
  for (const word of textKey(value).split(' ')) {
    if (word.length >= 5 && DAY_ALIASES[word]) return DAY_ALIASES[word];
  }
  return null;
}

// ------------------------------------------------------------------ times

function hhmm(h: number, m: number): string | null {
  if (!Number.isInteger(h) || !Number.isInteger(m) || h < 0 || h > 23 || m < 0 || m > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** "8h", "08h30", "8:30", "8.30", "8H", Excel day fractions (0.354…) → "HH:MM". */
export function parseTime(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') {
    if (value > 0 && value < 1) {
      const minutes = Math.round(value * 24 * 60);
      return hhmm(Math.floor(minutes / 60), minutes % 60);
    }
    return Number.isInteger(value) && value >= 0 && value <= 23 ? hhmm(value, 0) : null;
  }
  if (value instanceof Date) return hhmm(value.getUTCHours(), value.getUTCMinutes());
  const text = String(value).trim().toLowerCase();
  const match = text.match(/^(\d{1,2})\s*(?:[h:.]\s*(\d{2})?|heures?)?\s*(?:min)?$/);
  if (!match) return null;
  return hhmm(Number(match[1]), match[2] ? Number(match[2]) : 0);
}

const RANGE =
  /(\d{1,2})\s*(?:([h:.])\s*(\d{2})?)?\s*(?:-|–|—|à|a|au|to|>|\/)\s*(\d{1,2})\s*(?:([h:.])\s*(\d{2})?)?/i;

/**
 * "08h00-10h00", "8h - 10h", "8:00 à 9:55", "8-10" → {start, end}. In `strict` mode (free text) at least
 * one side must carry an h/: marker so "6-7" in "classe 6-7" is not read as a time.
 */
export function parseTimeRange(value: string | null | undefined, strict = false): { start: string; end: string } | null {
  if (!value) return null;
  const match = String(value).match(RANGE);
  if (!match) return null;
  const [, h1, sep1, m1, h2, sep2, m2] = match;
  if (strict && !sep1 && !sep2) return null;
  const start = hhmm(Number(h1), m1 ? Number(m1) : 0);
  const end = hhmm(Number(h2), m2 ? Number(m2) : 0);
  if (!start || !end || start >= end) return null;
  if (!sep1 && !sep2 && (Number(h1) < 6 || Number(h2) > 22)) return null;
  return { start, end };
}

/** "4", "4h", "4 h 30", "3,5" → hours (weekly volume). */
export function parseHours(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return value > 0 && value <= 40 ? value : null;
  const text = String(value).trim().toLowerCase().replace(',', '.');
  const match = text.match(/^(\d{1,2}(?:\.\d+)?)\s*(?:h(?:eures?)?)?\s*(\d{2})?\s*(?:\/\s*sem(?:aine)?)?$/);
  if (!match) return null;
  const hours = Number(match[1]) + (match[2] ? Number(match[2]) / 60 : 0);
  return hours > 0 && hours <= 40 ? Math.round(hours * 100) / 100 : null;
}

// ------------------------------------------------------------------ name keys

const PERSON_TITLES = new Set(['m', 'mr', 'mme', 'mlle', 'melle', 'monsieur', 'madame', 'mademoiselle', 'prof', 'pr', 'professeur', 'dr', 'docteur']);

/** Name key for teachers: titles removed, tokens sorted ("M. Kouassi Aya" ≡ "Aya KOUASSI"). */
export function personKey(value: string) {
  return textKey(value)
    .split(' ')
    .filter((t) => t && !PERSON_TITLES.has(t))
    .sort()
    .join(' ');
}

/** Name key for classes: "6ème A", "6e A", "6EME-A", "6°A" → "6e a"; "Terminale D" → "tle d". */
export function classKey(value: string) {
  let key = textKey(value);
  key = key
    .replace(/\b(\d{1,2})\s*(?:e|eme|em|ieme|me)\b/g, '$1e')
    .replace(/\b1\s*(?:ere|re|er)\b/g, '1re')
    .replace(/\b(?:terminale|term|tle|tale)\b/g, 'tle')
    .replace(/\b(?:seconde|2nde|2nd|2de)\b/g, '2nde')
    .replace(/\bclasse\b/g, '')
    .replace(/\b(\d{1,2}e|1re|2nde|tle)\s*([a-z0-9])\b/g, '$1 $2');
  return key.replace(/\s+/g, ' ').trim();
}

/** Name key for rooms: "Salle 12", "S12", "salle n°12" → "12". */
export function roomKey(value: string) {
  return textKey(value)
    .replace(/^(?:salle|s|room|local)\s*(?:n|no|num)?\s*(?=\w)/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const SUBJECT_ALIASES: Record<string, string> = {
  maths: 'mathematiques', math: 'mathematiques', mathematique: 'mathematiques', mathematiques: 'mathematiques',
  fr: 'francais', franc: 'francais', francais: 'francais',
  ang: 'anglais', angl: 'anglais', anglais: 'anglais', english: 'anglais',
  esp: 'espagnol', espagnol: 'espagnol', all: 'allemand', allemand: 'allemand',
  hg: 'histoire geographie', 'hist geo': 'histoire geographie', 'histoire geo': 'histoire geographie', 'histoire et geographie': 'histoire geographie',
  svt: 'sciences de la vie et de la terre', 'sciences de la vie et de la terre': 'sciences de la vie et de la terre',
  pc: 'physique chimie', 'physique chimie': 'physique chimie', 'sciences physiques': 'physique chimie', physique: 'physique chimie',
  eps: 'education physique et sportive', sport: 'education physique et sportive', 'education physique et sportive': 'education physique et sportive',
  philo: 'philosophie', philosophie: 'philosophie',
  info: 'informatique', informatique: 'informatique', tic: 'informatique',
  edhc: 'edhc', ecm: 'edhc',
};

/** Name key for subjects, folding the usual abbreviations ("Maths" ≡ "Mathématiques", "HG" ≡ "Histoire-Géo"). */
export function subjectKey(value: string) {
  const key = textKey(value);
  return SUBJECT_ALIASES[key] ?? key;
}

// ------------------------------------------------------------------ heuristics for untyped text

export function looksLikeClass(value: string) {
  const key = classKey(value);
  return /^(\d{1,2}e|1re|2nde|tle|cp\d?|ce\d|cm\d|ps|ms|gs)( [a-z0-9]{1,3})?$/.test(key);
}

export function looksLikeRoom(value: string) {
  return /^(salle|s\s*\d|labo|laboratoire|amphi|gymnase|terrain|cdi|atelier|room)\b/i.test(stripAccents(value.trim()));
}

export function looksLikePerson(value: string) {
  return /^(m\.|mr\.?|mme\.?|mlle\.?|monsieur|madame|prof\.?|pr\.?|dr\.?)\s+\S/i.test(value.trim());
}

const BREAK_WORDS = ['recreation', 'recre', 'pause', 'dejeuner', 'repas', 'cantine', 'libre', 'break', 'lunch'];

export function isBreakCell(value: string) {
  const key = textKey(value);
  return !key || BREAK_WORDS.some((w) => key === w || key.startsWith(`${w} `)) || /^[-–—x/.]+$/.test(value.trim());
}

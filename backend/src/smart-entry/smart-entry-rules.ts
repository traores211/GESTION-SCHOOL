/**
 * Turning what a teacher says, or what is read on a photographed sheet, into a PROPOSAL of roll call
 * or marks. Nothing here writes anything: every row goes to a review screen, and anything uncertain is
 * flagged instead of guessed. Pure functions: no database, tested on their own.
 */
export interface RosterPupil {
  id: string;
  firstName: string;
  lastName: string;
}

export type Confidence = 'SURE' | 'A_VERIFIER' | 'INCONNU';

export interface Match {
  studentId: string | null;
  confidence: Confidence;
  /** Why the row needs a look: unknown name, two pupils with that name, approximate spelling */
  issue: string | null;
}

export const plain = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

/** Edit distance, to forgive a letter misheard or misread ("Kouasi" for "Kouassi"). */
export function distance(a: string, b: string): number {
  if (a === b) return 0;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let last = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const keep = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, last + (a[i - 1] === b[j - 1] ? 0 : 1));
      last = keep;
    }
  }
  return prev[b.length];
}

const close = (heard: string, known: string) => heard === known || (known.length >= 4 && distance(heard, known) <= (known.length >= 7 ? 2 : 1));

/**
 * Finds the pupil a spoken or written name refers to. A first name alone is enough when only one pupil
 * of the class has it; two pupils with the same name are never chosen between: the row is flagged.
 */
export function matchPupil(heard: string, roster: RosterPupil[]): Match {
  const words = plain(heard).split(' ').filter(Boolean);
  if (!words.length) return { studentId: null, confidence: 'INCONNU', issue: 'Nom manquant' };
  const scored = roster
    .map((p) => {
      const names = plain(`${p.firstName} ${p.lastName}`).split(' ');
      const exact = words.filter((w) => names.includes(w)).length;
      const near = words.filter((w) => !names.includes(w) && names.some((n) => close(w, n))).length;
      return { p, exact, near, hit: exact + near };
    })
    .filter((s) => s.hit === words.length)
    .sort((a, b) => b.exact - a.exact);
  if (!scored.length) return { studentId: null, confidence: 'INCONNU', issue: `Aucun élève de la classe ne correspond à « ${heard.trim()} »` };
  const best = scored.filter((s) => s.exact === scored[0].exact);
  if (best.length > 1) return { studentId: null, confidence: 'INCONNU', issue: `Plusieurs élèves correspondent à « ${heard.trim()} » : ${best.map((s) => `${s.p.firstName} ${s.p.lastName}`).join(', ')}` };
  const only = best[0];
  if (only.near > 0) return { studentId: only.p.id, confidence: 'A_VERIFIER', issue: `Nom approchant : « ${heard.trim()} » lu comme ${only.p.firstName} ${only.p.lastName}` };
  return { studentId: only.p.id, confidence: 'SURE', issue: null };
}

// ---------------------------------------------------------------- roll call

export type RollStatus = 'PRESENT' | 'ABSENT' | 'RETARD';
const STATUS_WORDS: [RegExp, RollStatus][] = [
  [/\b(en retard|retard|retardataire)\b/, 'RETARD'],
  [/\b(absente?s?|pas la|manquante?)\b/, 'ABSENT'],
  [/\b(presente?s?|la)\b/, 'PRESENT'],
];

export interface RollRow extends Match {
  heard: string;
  status: RollStatus;
}

/**
 * "Alice Kouassi présente. Paul Yao absent, Marc Traoré en retard" → one row per pupil named.
 * Pupils who are not named are not in the result: the screen shows them as "non cité".
 */
export function parseRollCall(transcript: string, roster: RosterPupil[]): RollRow[] {
  let text = ` ${plain(transcript)} `;
  // Each status word ends a segment: the words before it are the name
  const marker = '\u0001';
  for (const [pattern, status] of STATUS_WORDS) text = text.replace(new RegExp(pattern.source, 'g'), `${marker}${status}${marker}`);
  const parts = text.split(marker).map((p) => p.trim());
  const rows: RollRow[] = [];
  for (let i = 0; i + 1 < parts.length; i += 2) {
    const heard = parts[i].replace(/\b(et|puis|est|sont|eleve|l eleve)\b/g, ' ').replace(/\s+/g, ' ').trim();
    const status = parts[i + 1] as RollStatus;
    if (!heard) continue;
    rows.push({ heard, status, ...matchPupil(heard, roster) });
  }
  return flagRepeats(rows);
}

/** A pupil named twice with different results is a doubt, never a silent overwrite. */
function flagRepeats<T extends Match>(rows: T[]): T[] {
  const seen = new Map<string, number>();
  for (const r of rows) if (r.studentId) seen.set(r.studentId, (seen.get(r.studentId) ?? 0) + 1);
  return rows.map((r) => (r.studentId && (seen.get(r.studentId) ?? 0) > 1 ? { ...r, confidence: 'A_VERIFIER' as Confidence, issue: 'Élève cité plusieurs fois : gardez une seule ligne' } : r));
}

// ---------------------------------------------------------------- marks

const UNITS: Record<string, number> = {
  zero: 0, un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10,
  onze: 11, douze: 12, treize: 13, quatorze: 14, quinze: 15, seize: 16, vingt: 20,
};

/** A spoken or written mark: "15", "12,5", "12 virgule 5", "quinze", "dix sept et demi". Null when unreadable. */
export function parseSpokenNumber(text: string): number | null {
  // A stray sign ("1?", "~12", "15+") means the reader was not sure: no number is guessed from it
  if (/[^\p{L}\d\s,.\-/]/u.test(text)) return null;
  const t =plain(text.replace(/[,.]/g, ' virgule ')).replace(/\bsur \d+\b/g, '').trim();
  if (!t) return null;
  const [whole, ...decimal] = t.split(' virgule ');
  const half = /\bet demie?\b/.test(whole);
  const words = whole.replace(/\bet demie?\b/g, '').trim().split(' ').filter(Boolean);
  let value: number | null = null;
  if (words.length === 1 && /^\d+$/.test(words[0])) value = Number(words[0]);
  else if (words.length && words.every((w) => w in UNITS)) {
    // "dix sept", "dix huit", "dix neuf": the only compound numbers up to twenty
    if (words.length === 1) value = UNITS[words[0]];
    else if (words.length === 2 && words[0] === 'dix' && UNITS[words[1]] >= 7 && UNITS[words[1]] <= 9) value = 10 + UNITS[words[1]];
  }
  if (value === null) return null;
  if (half) value += 0.5;
  if (decimal.length) {
    const d = decimal.join('').trim();
    const digits = /^\d+$/.test(d) ? d : d in UNITS ? String(UNITS[d]) : null;
    if (digits === null) return null;
    value += Number(`0.${digits}`);
  }
  return value;
}

export interface MarkRow extends Match {
  heard: string;
  score: number | null;
  scoreText: string;
}

function markRow(name: string, scoreText: string, roster: RosterPupil[], maxScore: number, doubt?: string | null): MarkRow {
  const match = matchPupil(name, roster);
  const score = parseSpokenNumber(scoreText);
  let { confidence, issue } = match;
  const problems = [issue];
  if (score === null) problems.push(`Note illisible : « ${scoreText.trim()} »`);
  else if (score > maxScore) problems.push(`La note ${score} dépasse le barème ${maxScore}`);
  if (doubt) problems.push(doubt);
  if ((score === null || score > maxScore || doubt) && confidence === 'SURE') confidence = 'A_VERIFIER';
  issue = problems.filter(Boolean).join(' · ') || null;
  return { heard: name.trim(), scoreText: scoreText.trim(), score: score !== null && score <= maxScore ? score : null, studentId: match.studentId, confidence, issue };
}

const NUMBER_WORD = `(?:\\d+|${Object.keys(UNITS).join('|')})`;
const SCORE = new RegExp(`\\b(${NUMBER_WORD}(?: (?:sept|huit|neuf))?(?: et demie?)?(?: virgule ${NUMBER_WORD})?)\\b`);

/** "Alice 15, Paul 12 virgule 5, Marc dix-sept" → one row per pupil; a name without a mark is flagged. */
export function parseSpokenMarks(transcript: string, roster: RosterPupil[], maxScore = 20): MarkRow[] {
  const rows: MarkRow[] = [];
  // Decimal commas ("12,5") are kept apart from the commas that separate pupils
  let rest = plain(transcript.replace(/(\d)[,.](\d)/g, '$1 virgule $2'));
  while (rest) {
    const m = SCORE.exec(rest);
    if (!m) {
      const name = rest.replace(/\b(et|puis|a|a eu|note)\b/g, ' ').replace(/\s+/g, ' ').trim();
      if (name) rows.push(markRow(name, '', roster, maxScore));
      break;
    }
    const name = rest.slice(0, m.index).replace(/\b(et|puis|a eu|a|note|sur)\b/g, ' ').replace(/\s+/g, ' ').trim();
    if (name) rows.push(markRow(name, m[1], roster, maxScore));
    rest = rest.slice(m.index + m[1].length).replace(/^ sur \d+/, '').trim();
  }
  return flagRepeats(rows);
}

/** Lines read on a sheet (name + mark as written), matched to the class and flagged like spoken marks. */
export function matchSheetLines(lines: { name: string; score: string | null; doubt?: string | null }[], roster: RosterPupil[], maxScore = 20): MarkRow[] {
  return flagRepeats(lines.map((l) => markRow(l.name, (l.score ?? '').replace(/\s*\/\s*\d+$/, ''), roster, maxScore, l.doubt)));
}

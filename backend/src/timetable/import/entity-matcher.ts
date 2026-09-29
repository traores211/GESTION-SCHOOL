import { EntityCandidate, EntityKind, EntityResolution, KnownEntity, MatchStatus } from './types';
import { classKey, personKey, roomKey, subjectKey } from './normalize';

export const KEY_BY_KIND: Record<EntityKind, (value: string) => string> = {
  class: classKey,
  subject: subjectKey,
  teacher: personKey,
  room: roomKey,
};

function bigrams(value: string) {
  const s = value.replace(/\s+/g, ' ');
  const grams = new Map<string, number>();
  for (let i = 0; i < s.length - 1; i++) {
    const g = s.slice(i, i + 2);
    grams.set(g, (grams.get(g) ?? 0) + 1);
  }
  return grams;
}

/** Sørensen–Dice similarity on character bigrams, 0…1. */
export function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const ga = bigrams(a);
  const gb = bigrams(b);
  let common = 0;
  for (const [g, n] of ga) common += Math.min(n, gb.get(g) ?? 0);
  return (2 * common) / (a.length - 1 + b.length - 1);
}

function score(kind: EntityKind, rawKey: string, candidateKey: string): number {
  if (rawKey === candidateKey) return 1;
  const rawTokens = rawKey.split(' ').filter(Boolean);
  const candTokens = candidateKey.split(' ').filter(Boolean);
  let s = similarity(rawKey, candidateKey);
  // "Kouassi" vs "aya kouassi": a surname alone is a strong but not certain hint.
  if (kind === 'teacher' && rawTokens.length && rawTokens.every((t) => candTokens.includes(t))) s = Math.max(s, 0.85);
  // "Maths" vs "mathematiques" once folded, "Physique" vs "physique chimie"
  if (kind === 'subject' && (candidateKey.startsWith(rawKey) || rawKey.startsWith(candidateKey)) && rawKey.length >= 3) {
    s = Math.max(s, 0.8);
  }
  // Classes differ by one letter ("6e a" / "6e b") while being very similar: be strict.
  if (kind === 'class') s = s >= 0.95 ? s : s * 0.8;
  return s;
}

const PROBABLE = 0.75;
const AMBIGUITY_MARGIN = 0.08;

/**
 * Maps one raw name to the known entities. Exact (normalized) matches are accepted; close ones are
 * only *proposed* and must be confirmed; two close candidates make the name ambiguous.
 */
export function matchEntity(
  kind: EntityKind,
  raw: string,
  known: KnownEntity[],
): { status: MatchStatus; id: string | null; candidates: EntityCandidate[] } {
  const keyOf = KEY_BY_KIND[kind];
  const rawKey = keyOf(raw);
  const scored = known
    .map((k) => ({
      id: k.id,
      name: k.name,
      score: Math.max(...[k.name, ...(k.aliases ?? [])].map((n) => score(kind, rawKey, keyOf(n)))),
    }))
    .filter((c) => c.score >= 0.5)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, 5)
    .map((c) => ({ ...c, score: Math.round(c.score * 100) / 100 }));

  const [best, second] = scored;
  if (!best) return { status: 'unknown', id: null, candidates: [] };
  if (best.score === 1 && (!second || second.score < 1)) return { status: 'exact', id: best.id, candidates: scored };
  if (best.score >= PROBABLE) {
    if (second && best.score - second.score < AMBIGUITY_MARGIN) return { status: 'ambiguous', id: null, candidates: scored };
    return { status: 'probable', id: best.id, candidates: scored };
  }
  return { status: 'unknown', id: null, candidates: scored };
}

/** Groups every raw name of one kind found in the rows and resolves each once. */
export function resolveEntities(kind: EntityKind, rawNames: (string | null)[], known: KnownEntity[]): EntityResolution[] {
  const counts = new Map<string, number>();
  for (const name of rawNames) if (name && name.trim()) counts.set(name.trim(), (counts.get(name.trim()) ?? 0) + 1);
  return [...counts.entries()]
    .map(([raw, occurrences]) => {
      const m = matchEntity(kind, raw, known);
      const canCreate = kind !== 'teacher'; // teachers are staff accounts: map them, never create silently
      return {
        kind,
        raw,
        occurrences,
        status: m.status,
        suggestedAction: m.id ? 'match' : m.status === 'ambiguous' ? 'match' : canCreate ? 'create' : 'ignore',
        suggestedId: m.id,
        candidates: m.candidates,
      } satisfies EntityResolution;
    })
    .sort((a, b) => a.raw.localeCompare(b.raw));
}

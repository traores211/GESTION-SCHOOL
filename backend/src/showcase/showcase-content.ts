/**
 * Content of the public showcase beyond the identity columns of the school, and the draft that is
 * edited, previewed and then published. Pure functions: no database, tested on their own.
 */
export const SETTINGS_KEYS = [
  'tagline', 'description', 'address', 'city', 'phone', 'whatsappNumber', 'foundedYear', 'logoUrl', 'coverImageUrl',
  'website', 'mapUrl', 'facebookUrl', 'instagramUrl', 'linkedinUrl', 'youtubeUrl',
] as const;
export const CONTENT_KEYS = ['primaryColor', 'faviconUrl', 'history', 'values', 'directorName', 'directorMessage', 'openingHours', 'facilities', 'activities', 'events', 'downloads'] as const;

export interface ShowcaseContent {
  primaryColor?: string | null;
  faviconUrl?: string | null;
  history?: string | null;
  values?: string | null;
  directorName?: string | null;
  directorMessage?: string | null;
  openingHours?: string | null;
  facilities?: string[];
  activities?: string[];
  events?: { title: string; date: string; description?: string | null }[];
  downloads?: { label: string; url: string }[];
}

type Draft = Record<string, unknown>;

const pick = (source: Draft, keys: readonly string[]) => Object.fromEntries(keys.filter((k) => k in source).map((k) => [k, source[k]]));

/** Keeps the known keys only: a draft never carries a field the showcase does not have. */
export function cleanDraft(input: Draft): Draft {
  return pick(input, [...SETTINGS_KEYS, ...CONTENT_KEYS]);
}

/** What publishing writes: the identity columns on one side, the content document on the other. */
export function splitDraft(draft: Draft, published: ShowcaseContent): { settings: Draft; content: ShowcaseContent } {
  return { settings: pick(draft, SETTINGS_KEYS), content: { ...published, ...(pick(draft, CONTENT_KEYS) as ShowcaseContent) } };
}

/** The showcase as it would look once the draft is published; untouched fields keep their published value. */
export function previewOf<T extends Draft>(published: T, content: ShowcaseContent, draft: Draft | null): T & { content: ShowcaseContent } {
  if (!draft) return { ...published, content };
  const { settings, content: next } = splitDraft(draft, content);
  return { ...published, ...settings, content: next };
}

/** Coming events first, the nearest on top; past events are dropped from the public page. */
export function upcomingEvents(events: ShowcaseContent['events'], today: Date) {
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  return (events ?? []).filter((e) => new Date(e.date).getTime() >= start).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

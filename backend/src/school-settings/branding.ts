/** WCAG 2.x relative luminance / contrast helpers, used to refuse unreadable brand colors. */
export function luminance(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error('Invalid color');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255);
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrastRatio(a: string, b: string): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

/** Primary color is used as a button background under white text: needs ≥ 4.5:1 (WCAG AA). */
export function isReadableOnWhiteText(hex: string): boolean {
  return contrastRatio(hex, '#ffffff') >= 4.5;
}

export const SECTION_TYPES = [
  'hero',
  'about',
  'director',
  'history',
  'values',
  'levels',
  'team',
  'gallery',
  'news',
  'events',
  'documents',
  'admissions',
  'contact',
] as const;

export type SectionType = (typeof SECTION_TYPES)[number];

export interface ShowcaseSection {
  type: SectionType;
  enabled: boolean;
  title?: string;
  content?: string;
  items?: { title?: string; text?: string; imageUrl?: string; url?: string; date?: string }[];
}

/** Default layout offered to a new school (the admin reorders / toggles / fills it). */
export const DEFAULT_SECTIONS: ShowcaseSection[] = [
  { type: 'hero', enabled: true },
  { type: 'about', enabled: true, title: 'Notre établissement' },
  { type: 'director', enabled: false, title: 'Le mot du directeur' },
  { type: 'levels', enabled: true, title: 'Niveaux et formations' },
  { type: 'values', enabled: false, title: 'Nos valeurs' },
  { type: 'team', enabled: false, title: "L'équipe" },
  { type: 'gallery', enabled: false, title: 'Galerie' },
  { type: 'news', enabled: true, title: 'Actualités' },
  { type: 'events', enabled: false, title: 'Agenda' },
  { type: 'documents', enabled: false, title: 'Documents à télécharger' },
  { type: 'admissions', enabled: true, title: 'Préinscription en ligne' },
  { type: 'contact', enabled: true, title: 'Nous contacter' },
];

/** Only http(s) absolute URLs or site-relative paths: blocks javascript:, data:, etc. */
export function isSafeUrl(url: string): boolean {
  if (url.startsWith('/') && !url.startsWith('//')) return true;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

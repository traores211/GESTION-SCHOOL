export interface ShowcaseHighlight {
  id: string;
  value: string;
  label: string;
}

export interface ShowcasePhoto {
  id: string;
  url: string;
  caption: string | null;
}

export interface ShowcasePartner {
  id: string;
  name: string;
  logoUrl: string | null;
  website: string | null;
}

export interface ShowcaseTestimonial {
  id: string;
  authorName: string;
  authorRole: string | null;
  content: string;
  photoUrl: string | null;
}

/** Published content beyond the identity of the school; every part is optional. */
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

export interface Showcase {
  content: ShowcaseContent;
  /** True when the page shows a draft that is not published yet. */
  preview: boolean;
  name: string;
  code: string;
  tagline: string | null;
  description: string | null;
  city: string | null;
  address: string | null;
  email: string;
  phone: string | null;
  website: string | null;
  logoUrl: string | null;
  coverImageUrl: string | null;
  foundedYear: number | null;
  mapUrl: string | null;
  whatsappNumber: string | null;
  social: { facebook: string | null; instagram: string | null; linkedin: string | null; youtube: string | null };
  academicYear: string | null;
  /** Current school year and its terms, for the public calendar. */
  calendar: { start: string; end: string; terms: { name: string; order: number; startDate: string; endDate: string }[] } | null;
  /** Tuition per level, from the instalments actually billed this year. */
  fees: { level: string; annual: number; instalments: { label: string; amount: number; dueDate: string }[] }[];
  /** Subjects and coefficients taught at each level this year. */
  programs: { level: string; subjects: { name: string; coefficient: number }[] }[];
  levels: string[];
  classesCount: number;
  studentsCount: number;
  highlights: ShowcaseHighlight[];
  photos: ShowcasePhoto[];
  partners: ShowcasePartner[];
  testimonials: ShowcaseTestimonial[];
  announcements: { id: string; title: string; content: string; imageUrl: string | null; publishedAt: string }[];
}

/** Settings editable from the back-office (PATCH /showcase/settings). */
export interface ShowcaseSettings {
  code: string;
  name: string;
  email: string;
  tagline: string | null;
  description: string | null;
  address: string | null;
  city: string | null;
  phone: string | null;
  website: string | null;
  logoUrl: string | null;
  coverImageUrl: string | null;
  foundedYear: number | null;
  mapUrl: string | null;
  facebookUrl: string | null;
  instagramUrl: string | null;
  linkedinUrl: string | null;
  youtubeUrl: string | null;
  whatsappNumber: string | null;
}

export interface ShowcaseAdminData {
  school: ShowcaseSettings;
  highlights: (ShowcaseHighlight & { order: number })[];
  photos: (ShowcasePhoto & { order: number })[];
  partners: (ShowcasePartner & { order: number })[];
  testimonials: (ShowcaseTestimonial & { order: number; isPublished: boolean })[];
}

/** Ivorian school cycles, used to group class levels on the showcase. */
const CYCLES: { name: string; description: string; match: RegExp }[] = [
  { name: "Maternelle", description: "Éveil et premiers apprentissages", match: /^(ps|ms|gs|petite|moyenne|grande)/i },
  { name: "Primaire", description: "Du CP1 au CM2", match: /^(cp|ce|cm)/i },
  { name: "Collège", description: "Premier cycle du secondaire, jusqu'au BEPC", match: /^(6|5|4|3)(e|è|ème|eme)/i },
  { name: "Lycée", description: "Second cycle, jusqu'au Baccalauréat", match: /^(2nde|seconde|1(e|è|ère|ere)|t(le|erm))/i },
  { name: "Technique & professionnel", description: "Brevets de technicien et BTS", match: /^(bt|bts|cap)/i },
];

export function groupLevelsByCycle(levels: string[]) {
  const groups: { name: string; description: string; levels: string[] }[] = [];
  const rest: string[] = [];
  for (const level of levels) {
    const cycle = CYCLES.find((c) => c.match.test(level.trim()));
    if (!cycle) {
      rest.push(level);
      continue;
    }
    let group = groups.find((g) => g.name === cycle.name);
    if (!group) {
      group = { name: cycle.name, description: cycle.description, levels: [] };
      groups.push(group);
    }
    group.levels.push(level);
  }
  groups.sort((a, b) => CYCLES.findIndex((c) => c.name === a.name) - CYCLES.findIndex((c) => c.name === b.name));
  if (rest.length) groups.push({ name: "Autres niveaux", description: "", levels: rest });
  // Descending class numbers read naturally for the collège (6ème → 3ème)
  for (const g of groups) g.levels.sort((a, b) => (parseInt(b) || 0) - (parseInt(a) || 0));
  return groups;
}

/** Admission workflow as implemented by the back-office (AdmissionStatus). */
export const ADMISSION_STEPS = [
  { title: "Candidature en ligne", text: "Remplissez le formulaire, sans créer de compte." },
  { title: "Étude du dossier", text: "L'établissement vérifie les pièces et vous recontacte." },
  { title: "Test et entretien", text: "Selon le niveau demandé, un test ou un entretien est organisé." },
  { title: "Admission et inscription", text: "Une fois admis, l'inscription est finalisée auprès du secrétariat." },
];

/** Bulk import rules, pure so they are unit tested: column recognition and cell parsing. */

export type ImportKind = 'students' | 'staff' | 'balances' | 'grades';

export interface ColumnSpec {
  field: string;
  /** Header shown in the template. */
  header: string;
  /** Other accepted headers (compared without accents, case or punctuation). */
  aliases: string[];
  required?: boolean;
  example: string;
}

export const IMPORT_SPECS: Record<ImportKind, { label: string; columns: ColumnSpec[] }> = {
  students: {
    label: 'Élèves et responsables',
    columns: [
      { field: 'lastName', header: 'Nom', aliases: ['nom de famille', 'nom eleve', 'noms'], required: true, example: 'KONÉ' },
      { field: 'firstName', header: 'Prénoms', aliases: ['prenom', 'prenom eleve'], required: true, example: 'Awa Mariam' },
      { field: 'dateOfBirth', header: 'Date de naissance', aliases: ['ne le', 'nee le', 'naissance', 'date naissance', 'ddn'], required: true, example: '15/06/2013' },
      { field: 'gender', header: 'Sexe', aliases: ['genre', 'sexe m f'], required: true, example: 'F' },
      { field: 'className', header: 'Classe', aliases: ['classe actuelle', 'niveau classe'], example: '6ème A' },
      { field: 'matricule', header: 'Matricule', aliases: ['numero matricule', 'n matricule', 'matricule eleve'], example: '' },
      { field: 'placeOfBirth', header: 'Lieu de naissance', aliases: ['ne a', 'lieu naissance'], example: 'Abidjan' },
      { field: 'nationality', header: 'Nationalité', aliases: [], example: 'Ivoirienne' },
      { field: 'address', header: 'Adresse', aliases: ['quartier', 'domicile'], example: 'Cocody Angré' },
      { field: 'guardianLastName', header: 'Nom du responsable', aliases: ['nom parent', 'nom tuteur', 'nom du parent', 'nom du tuteur'], example: 'KONÉ' },
      { field: 'guardianFirstName', header: 'Prénom du responsable', aliases: ['prenom parent', 'prenom tuteur', 'prenoms du responsable', 'prenom du parent'], example: 'Ibrahim' },
      { field: 'guardianPhone', header: 'Téléphone du responsable', aliases: ['telephone parent', 'tel parent', 'contact parent', 'telephone', 'contact', 'tel responsable'], example: '07 01 02 03 04' },
      { field: 'guardianEmail', header: 'E-mail du responsable', aliases: ['email parent', 'email responsable', 'mail parent', 'email', 'mail'], example: 'i.kone@exemple.ci' },
      { field: 'guardianRelation', header: 'Lien', aliases: ['lien de parente', 'relation', 'qualite'], example: 'Père' },
    ],
  },
  staff: {
    label: 'Personnel',
    columns: [
      { field: 'lastName', header: 'Nom', aliases: ['nom de famille'], required: true, example: 'KOUASSI' },
      { field: 'firstName', header: 'Prénoms', aliases: ['prenom'], required: true, example: 'Konan' },
      { field: 'email', header: 'E-mail', aliases: ['email', 'mail', 'adresse email', 'adresse e mail', 'courriel'], required: true, example: 'k.kouassi@ecole.ci' },
      { field: 'position', header: 'Fonction', aliases: ['poste', 'emploi', 'matiere enseignee'], required: true, example: 'Professeur de mathématiques' },
      { field: 'role', header: 'Rôle', aliases: ['role', 'profil', 'acces'], example: 'Enseignant' },
      { field: 'phone', header: 'Téléphone', aliases: ['tel', 'contact', 'portable'], example: '07 05 06 07 08' },
      { field: 'hireDate', header: "Date d'embauche", aliases: ['embauche', 'date embauche', 'date d entree', 'date entree'], example: '01/09/2022' },
      { field: 'baseSalary', header: 'Salaire de base', aliases: ['salaire', 'salaire mensuel'], example: '250000' },
      { field: 'department', header: 'Département', aliases: ['departement', 'service', 'discipline'], example: 'Sciences' },
    ],
  },
  balances: {
    label: "Soldes d'ouverture",
    columns: [
      { field: 'matricule', header: 'Matricule', aliases: ['numero matricule', 'n matricule'], required: true, example: '2026-0001' },
      { field: 'amount', header: 'Montant dû', aliases: ['montant', 'solde', 'reste a payer', 'reste du', 'impaye'], required: true, example: '75000' },
      { field: 'label', header: 'Libellé', aliases: ['objet', 'designation', 'motif'], example: 'Solde antérieur' },
      { field: 'dueDate', header: 'Échéance', aliases: ['date limite', 'date echeance', 'a payer avant'], example: '31/10/2026' },
    ],
  },
  grades: {
    label: 'Notes',
    columns: [
      { field: 'matricule', header: 'Matricule', aliases: ['numero matricule', 'n matricule'], required: true, example: '2026-0001' },
      { field: 'subject', header: 'Matière', aliases: ['discipline', 'code matiere'], required: true, example: 'Mathématiques' },
      { field: 'term', header: 'Période', aliases: ['trimestre', 'semestre', 'periode'], required: true, example: 'Trimestre 1' },
      { field: 'score', header: 'Note', aliases: ['resultat', 'moyenne', 'points'], required: true, example: '14,5' },
      { field: 'maxScore', header: 'Barème', aliases: ['sur', 'note sur', 'bareme'], example: '20' },
      { field: 'type', header: 'Type', aliases: ['type devaluation', 'evaluation', 'nature'], example: 'Devoir' },
      { field: 'comment', header: 'Appréciation', aliases: ['commentaire', 'observation', 'remarque'], example: '' },
    ],
  },
};

/** Lower case, no accents, no punctuation: "N° Matricule" and "numero matricule" compare equal. */
export function key(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/n[°º]/g, 'n ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export interface HeaderMapping {
  /** field → column index */
  columns: Record<string, number>;
  missing: string[];
  ignored: string[];
}

/** Matches the header row of a file with the expected columns (exact header first, then aliases). */
export function mapHeaders(headers: string[], spec: ColumnSpec[]): HeaderMapping {
  const keys = headers.map(key);
  const columns: Record<string, number> = {};
  const used = new Set<number>();
  for (const pass of ['header', 'aliases'] as const) {
    for (const column of spec) {
      if (columns[column.field] !== undefined) continue;
      const names = pass === 'header' ? [key(column.header)] : column.aliases.map(key);
      const index = keys.findIndex((k, i) => !used.has(i) && k !== '' && names.includes(k));
      if (index >= 0) {
        columns[column.field] = index;
        used.add(index);
      }
    }
  }
  return {
    columns,
    missing: spec.filter((c) => c.required && columns[c.field] === undefined).map((c) => c.header),
    ignored: headers.filter((h, i) => h.trim() && !used.has(i)),
  };
}

/** One object per data row, with the 1-based line number of the file. */
export function readRows(rows: string[][], mapping: HeaderMapping): { line: number; values: Record<string, string> }[] {
  return rows.slice(1).map((row, i) => ({
    line: i + 2,
    values: Object.fromEntries(Object.entries(mapping.columns).map(([field, index]) => [field, (row[index] ?? '').trim()])),
  }));
}

/** "15/06/2013", "15-06-13", "2013-06-15", "15.06.2013" → Date (UTC midnight); null when not a real date. */
export function parseDate(text: string): Date | null {
  const t = text.trim();
  if (!t) return null;
  let y: number, m: number, d: number;
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t);
  if (match) [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  else {
    match = /^(\d{1,2})[/.\- ](\d{1,2})[/.\- ](\d{2}|\d{4})$/.exec(t);
    if (!match) return null;
    [d, m, y] = [Number(match[1]), Number(match[2]), Number(match[3])];
    if (y < 100) y += y > 50 ? 1900 : 2000;
  }
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d ? date : null;
}

export function parseGender(text: string): 'M' | 'F' | null {
  const k = key(text);
  if (['m', 'g', 'h', 'masculin', 'garcon', 'homme'].includes(k)) return 'M';
  if (['f', 'feminin', 'fille', 'femme'].includes(k)) return 'F';
  return null;
}

/** "150 000", "150.000 FCFA", "150000,00" → 150000; null when not a whole positive amount. */
export function parseAmount(text: string): number | null {
  const t = text.replace(/f\s?cfa|xof|francs?/gi, '').replace(/\s/g, '');
  if (!t) return null;
  const normalised = /^\d{1,3}([.,]\d{3})+$/.test(t) ? t.replace(/[.,]/g, '') : t.replace(/[.,]0{1,2}$/, '');
  if (!/^\d+$/.test(normalised)) return null;
  const n = Number(normalised);
  return n > 0 ? n : null;
}

/** "14,5", "14.5", "14,5/20" → { score, maxScore? } */
export function parseScore(text: string): { score: number; maxScore?: number } | null {
  const match = /^(\d+(?:[.,]\d+)?)(?:\s*\/\s*(\d+(?:[.,]\d+)?))?$/.exec(text.trim());
  if (!match) return null;
  const score = Number(match[1].replace(',', '.'));
  const maxScore = match[2] ? Number(match[2].replace(',', '.')) : undefined;
  return Number.isFinite(score) ? { score, maxScore } : null;
}

const ROLES: Record<string, string> = {
  enseignant: 'ENSEIGNANT', enseignante: 'ENSEIGNANT', professeur: 'ENSEIGNANT', prof: 'ENSEIGNANT', instituteur: 'ENSEIGNANT', institutrice: 'ENSEIGNANT', maitre: 'ENSEIGNANT', maitresse: 'ENSEIGNANT',
  secretaire: 'SECRETARY', secretariat: 'SECRETARY', comptable: 'COMPTABLE', econome: 'COMPTABLE', caissier: 'COMPTABLE', caissiere: 'COMPTABLE',
  directeur: 'DIRECTOR', directrice: 'DIRECTOR', direction: 'DIRECTOR', proviseur: 'DIRECTOR', principal: 'DIRECTOR',
};

/** Access role from what the office wrote ("Professeur", "Secrétaire"…); teacher when left empty. */
export function parseRole(text: string): string | null {
  const k = key(text);
  if (!k) return 'ENSEIGNANT';
  if (['enseignant', 'secretary', 'comptable', 'director'].includes(k)) return k.toUpperCase();
  return ROLES[k.split(' ')[0]] ?? null;
}

const GRADE_TYPES: Record<string, string> = {
  devoir: 'DEVOIR', interrogation: 'INTERROGATION', interro: 'INTERROGATION', composition: 'COMPOSITION', compo: 'COMPOSITION', examen: 'EXAMEN', oral: 'ORAL', tp: 'TP', projet: 'PROJET',
};

export function parseGradeType(text: string): string | null {
  const k = key(text);
  return k ? GRADE_TYPES[k.split(' ')[0]] ?? null : 'DEVOIR';
}

export const isEmail = (text: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(text);

/** Template file (CSV for Excel: semicolons, UTF-8 with BOM) with the headers and one example row. */
export function templateCsv(kind: ImportKind): string {
  const cell = (v: string) => (/[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const columns = IMPORT_SPECS[kind].columns;
  return `${String.fromCharCode(0xfeff)}${columns.map((c) => cell(c.header)).join(';')}\r\n${columns.map((c) => cell(c.example)).join(';')}\r\n`;
}

/** Identity key used to spot the same pupil twice (in the file or already in the school). */
export function personKey(lastName: string, firstName: string, dateOfBirth: Date | null): string {
  return `${key(lastName)}|${key(firstName)}|${dateOfBirth ? dateOfBirth.toISOString().slice(0, 10) : ''}`;
}

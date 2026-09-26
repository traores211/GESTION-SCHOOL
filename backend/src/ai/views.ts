import { Permission } from '../authz/permissions';

/**
 * Schema-driven dashboards. The AI (or a user) produces a JSON spec made ONLY of blocks from
 * this closed catalogue; each block reads a NAMED data source defined in code, with its own
 * permission. No code is ever generated or executed.
 */
export const DATA_SOURCES: Record<string, { permission: Permission; label: string; kinds: ('kpi' | 'table' | 'chart')[] }> = {
  'students.count': { permission: 'students:read', label: 'Effectif', kinds: ['kpi'] },
  'fees.stats': { permission: 'billing:read', label: 'Synthèse financière', kinds: ['kpi', 'chart'] },
  'fees.unpaid': { permission: 'billing:read', label: 'Factures impayées', kinds: ['kpi', 'table', 'chart'] },
  'fees.overdue': { permission: 'billing:read', label: 'Factures échues', kinds: ['kpi', 'table'] },
  'attendance.today': { permission: 'attendance:read', label: "Présences du jour", kinds: ['kpi', 'chart'] },
  'grades.below_average': { permission: 'grades:read', label: 'Élèves sous la moyenne', kinds: ['kpi', 'table'] },
  'admissions.pending': { permission: 'admissions:read', label: 'Candidatures en cours', kinds: ['kpi', 'table'] },
  'payroll.summary': { permission: 'payroll:read', label: 'Masse salariale du mois', kinds: ['kpi'] },
  'students.by_class': { permission: 'classes:read', label: 'Effectif par classe', kinds: ['chart', 'table'] },
};

export interface ViewComponent {
  type: 'kpi' | 'table' | 'chart';
  source: string;
  title?: string;
  chart?: 'bar' | 'donut' | 'line';
}

export interface ViewSpec {
  title: string;
  components: ViewComponent[];
}

/** Returns the list of problems (empty = valid). Unknown keys are rejected, not ignored. */
export function validateViewSpec(spec: unknown, granted: readonly Permission[]): string[] {
  const errors: string[] = [];
  if (!spec || typeof spec !== 'object') return ['La vue doit être un objet'];
  const s = spec as Record<string, unknown>;
  for (const k of Object.keys(s)) if (!['title', 'components'].includes(k)) errors.push(`Propriété inconnue : ${k}`);
  if (typeof s.title !== 'string' || !s.title.trim() || s.title.length > 80) errors.push('Titre requis (80 caractères max)');
  if (!Array.isArray(s.components) || s.components.length === 0 || s.components.length > 12) {
    errors.push('1 à 12 composants requis');
    return errors;
  }
  s.components.forEach((c, i) => {
    if (!c || typeof c !== 'object') return errors.push(`Composant ${i + 1} invalide`);
    const comp = c as Record<string, unknown>;
    for (const k of Object.keys(comp)) if (!['type', 'source', 'title', 'chart'].includes(k)) errors.push(`Composant ${i + 1} : propriété inconnue ${k}`);
    const src = DATA_SOURCES[comp.source as string];
    if (!src) return errors.push(`Composant ${i + 1} : source inconnue ${String(comp.source)}`);
    if (!['kpi', 'table', 'chart'].includes(comp.type as string) || !src.kinds.includes(comp.type as 'kpi')) {
      errors.push(`Composant ${i + 1} : type ${String(comp.type)} non disponible pour ${String(comp.source)}`);
    }
    if (comp.chart !== undefined && !['bar', 'donut', 'line'].includes(comp.chart as string)) errors.push(`Composant ${i + 1} : graphique inconnu`);
    if (comp.title !== undefined && (typeof comp.title !== 'string' || comp.title.length > 80)) errors.push(`Composant ${i + 1} : titre invalide`);
    if (!granted.includes(src.permission)) errors.push(`Composant ${i + 1} : accès non autorisé à ${String(comp.source)}`);
  });
  return errors;
}

import { BadRequestException } from '@nestjs/common';
import { Permission } from '../authz/permissions';
import { AuthUser } from '../common/current-user.decorator';
import { Feature } from '../platform/features';

/**
 * Tool catalogue of the AI agent. A tool is a thin facade over an EXISTING business service,
 * executed with the end user's identity: same tenant scoping, same permission, same validation,
 * same audit. The model only ever sees the tools the user is allowed to call.
 */
export interface ToolContext {
  user: AuthUser;
  services: ToolServices;
}

// Loosely typed on purpose (the concrete services are injected by AiService).
export interface ToolServices {
  students: any;
  classes: any;
  billing: any;
  attendance: any;
  timetable: any;
  documents: any;
  settings: any;
  data: any;
  prisma: any;
}

export interface AiTool {
  name: string;
  description: string;
  permission: Permission;
  feature?: Feature;
  /** Sensitive: never executed directly; becomes a pending action the user must confirm. */
  sensitive: boolean;
  input_schema: Record<string, unknown>;
  /** Throws BadRequestException on invalid input. Returns the normalised input. */
  validate(input: unknown): Record<string, unknown>;
  /** Human readable description of what a sensitive call will do (shown in the confirmation card). */
  describe?(input: Record<string, unknown>): string;
  run(ctx: ToolContext, input: Record<string, unknown>): Promise<unknown>;
}

// ---- tiny input validators (the model's input is untrusted) ----
type Spec = Record<string, { type: 'string' | 'number' | 'boolean' | 'string[]'; required?: boolean; max?: number; enum?: string[] }>;

function check(input: unknown, spec: Spec): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new BadRequestException('Paramètres invalides');
  const obj = input as Record<string, unknown>;
  for (const k of Object.keys(obj)) if (!(k in spec)) throw new BadRequestException(`Paramètre inconnu : ${k}`);
  const out: Record<string, unknown> = {};
  for (const [k, s] of Object.entries(spec)) {
    const v = obj[k];
    if (v === undefined || v === null) {
      if (s.required) throw new BadRequestException(`Paramètre requis : ${k}`);
      continue;
    }
    if (s.type === 'string[]') {
      if (!Array.isArray(v) || v.length > (s.max ?? 50) || v.some((x) => typeof x !== 'string' || x.length > 100)) throw new BadRequestException(`Paramètre invalide : ${k}`);
    } else if (typeof v !== s.type) {
      throw new BadRequestException(`Paramètre invalide : ${k}`);
    } else if (s.type === 'string' && ((v as string).length > (s.max ?? 200) || (s.enum && !s.enum.includes(v as string)))) {
      throw new BadRequestException(`Paramètre invalide : ${k}`);
    } else if (s.type === 'number' && (!Number.isFinite(v) || (s.max !== undefined && (v as number) > s.max))) {
      throw new BadRequestException(`Paramètre invalide : ${k}`);
    }
    out[k] = v;
  }
  return out;
}

function schema(spec: Spec, descriptions: Record<string, string>) {
  const properties: Record<string, unknown> = {};
  for (const [k, s] of Object.entries(spec)) {
    properties[k] =
      s.type === 'string[]'
        ? { type: 'array', items: { type: 'string' }, description: descriptions[k] }
        : { type: s.type, description: descriptions[k], ...(s.enum ? { enum: s.enum } : {}) };
  }
  return {
    type: 'object',
    properties,
    required: Object.entries(spec).filter(([, s]) => s.required).map(([k]) => k),
    additionalProperties: false,
  };
}

function tool(
  def: Omit<AiTool, 'validate' | 'input_schema'> & { spec: Spec; params?: Record<string, string> },
): AiTool {
  const { spec, params = {}, ...rest } = def;
  return { ...rest, input_schema: schema(spec, params), validate: (i) => check(i, spec) };
}

const SECTION_TYPES = ['hero', 'about', 'director', 'history', 'values', 'levels', 'team', 'gallery', 'news', 'events', 'documents', 'admissions', 'contact'];

export const TOOLS: AiTool[] = [
  tool({
    name: 'search_students',
    description: "Recherche des élèves de l'établissement par nom, prénom ou matricule, et/ou par classe. Renvoie au plus 50 élèves.",
    permission: 'students:read',
    sensitive: false,
    spec: { query: { type: 'string', max: 100 }, classId: { type: 'string', max: 40 } },
    params: { query: 'Texte recherché (facultatif)', classId: 'Identifiant de classe (voir list_classes)' },
    async run({ user, services }, i) {
      const { items, total } = await services.students.findAll(user, i.query as string, i.classId as string, 1, 50);
      return {
        total,
        students: items.map((s: any) => ({ id: s.id, name: `${s.lastName} ${s.firstName}`, matricule: s.matricule, class: s.enrollments[0]?.class?.name ?? null, status: s.status })),
      };
    },
  }),
  tool({
    name: 'get_student',
    description: "Fiche synthétique d'un élève (classe, présences, moyenne et factures selon les droits de l'utilisateur).",
    permission: 'students:read',
    sensitive: false,
    spec: { studentId: { type: 'string', required: true, max: 40 } },
    async run({ user, services }, i) {
      const s = await services.students.findOne(user, i.studentId as string);
      return {
        id: s.id,
        name: `${s.lastName} ${s.firstName}`,
        matricule: s.matricule,
        class: s.enrollments[0]?.class?.name ?? null,
        attendance: s.attendanceStats,
        averageScore: s.averageScore,
        invoices: s.invoices.map((inv: any) => ({ reference: inv.reference, total: inv.totalAmount, status: inv.status })),
      };
    },
  }),
  tool({
    name: 'list_classes',
    description: "Liste des classes de l'année scolaire courante avec leur effectif et leur identifiant.",
    permission: 'classes:read',
    sensitive: false,
    spec: {},
    async run({ user, services }) {
      const classes = await services.classes.findAll(user);
      return classes.map((c: any) => ({ id: c.id, name: c.name, level: c.level, students: c._count?.enrollments ?? 0 }));
    },
  }),
  tool({
    name: 'create_class',
    description: "Crée une classe dans l'année scolaire courante. Action sensible : l'utilisateur doit confirmer.",
    permission: 'classes:write',
    sensitive: true,
    spec: { name: { type: 'string', required: true, max: 60 }, code: { type: 'string', required: true, max: 20 }, level: { type: 'string', required: true, max: 40 }, capacity: { type: 'number', max: 200 } },
    params: { name: 'Nom affiché, ex. "6ème B"', code: 'Code court unique, ex. "6B"', level: 'Niveau, ex. "6ème"', capacity: 'Capacité (facultatif)' },
    describe: (i) => `Créer la classe « ${i.name} » (code ${i.code}, niveau ${i.level}${i.capacity ? `, ${i.capacity} places` : ''}).`,
    async run({ user, services }, i) {
      const c = await services.classes.create(user, i);
      return { created: true, id: c.id, name: c.name };
    },
  }),
  tool({
    name: 'get_unpaid_invoices',
    description: 'Factures avec un reste à payer (optionnellement uniquement celles échues), avec le montant restant par élève.',
    permission: 'billing:read',
    sensitive: false,
    spec: { overdueOnly: { type: 'boolean' } },
    async run({ user, services }, i) {
      const rows = await services.billing.unpaid(user, Boolean(i.overdueOnly), 100);
      const students = new Set(rows.map((r: any) => r.student.id));
      return { invoices: rows.length, students: students.size, totalRemaining: rows.reduce((s: number, r: any) => s + r.remaining, 0), rows: rows.slice(0, 50) };
    },
  }),
  tool({
    name: 'get_finance_stats',
    description: 'Synthèse financière : total facturé, encaissé, impayés, taux de recouvrement, encaissé aujourd’hui.',
    permission: 'billing:read',
    sensitive: false,
    spec: {},
    run: ({ user, services }) => services.billing.financeStats(user),
  }),
  tool({
    name: 'send_payment_reminders',
    description: 'Envoie un rappel de paiement aux parents des élèves ayant des factures échues. Action sensible : confirmation requise.',
    permission: 'billing:write',
    sensitive: true,
    spec: {},
    describe: () => 'Envoyer un rappel de paiement aux parents de tous les élèves ayant une facture échue, et marquer ces factures « en retard ».',
    run: ({ user, services }) => services.billing.sendReminders(user),
  }),
  tool({
    name: 'get_attendance_today',
    description: "Statistiques de présence des élèves aujourd'hui (présents, absents, retards, taux).",
    permission: 'attendance:read',
    sensitive: false,
    spec: {},
    run: ({ user, services }) => services.attendance.todayStats(user),
  }),
  tool({
    name: 'list_students_below_average',
    description: 'Élèves dont la moyenne de la période courante (ou indiquée) est inférieure à un seuil (par défaut 10/20), éventuellement pour une classe.',
    permission: 'grades:read',
    sensitive: false,
    spec: { threshold: { type: 'number', max: 20 }, classId: { type: 'string', max: 40 }, termId: { type: 'string', max: 40 } },
    params: { threshold: 'Seuil sur 20 (défaut 10)', classId: 'Classe (facultatif)', termId: 'Période (facultatif)' },
    run: ({ user, services }, i) => services.data.belowAverage(user, (i.threshold as number) ?? 10, i.classId as string, i.termId as string),
  }),
  tool({
    name: 'get_payroll_summary',
    description: 'Masse salariale du mois courant (nombre de bulletins et total net).',
    permission: 'payroll:read',
    feature: 'payroll',
    sensitive: false,
    spec: {},
    run: ({ user, services }) => services.data.payrollSummary(user),
  }),
  tool({
    name: 'get_schedule',
    description: "Emploi du temps publié d'une classe (jour 1 = lundi).",
    permission: 'timetable:read',
    feature: 'timetable',
    sensitive: false,
    spec: { classId: { type: 'string', required: true, max: 40 } },
    async run({ user, services }, i) {
      const { settings, timetable } = await services.timetable.get(user, i.classId as string);
      if (!timetable) return { published: false };
      return {
        published: true,
        periods: settings.periodLabels,
        entries: timetable.entries.map((e: any) => ({ day: e.day, period: e.period, subject: e.subject.name, teacher: e.teacher ? `${e.teacher.user.firstName} ${e.teacher.user.lastName}` : null, room: e.room?.name ?? null })),
      };
    },
  }),
  tool({
    name: 'generate_timetable',
    description:
      "Génère un brouillon d'emploi du temps (solveur déterministe) pour des classes, avec contraintes. Ne publie pas. Action sensible : remplace le brouillon existant, confirmation requise.",
    permission: 'timetable:write',
    feature: 'timetable',
    sensitive: true,
    spec: {
      classIds: { type: 'string[]', required: true, max: 40 },
      maxPerDayPerSubject: { type: 'number', max: 6 },
      blockedDay: { type: 'number', max: 6 },
      blockedFromPeriod: { type: 'number', max: 12 },
    },
    params: {
      classIds: 'Identifiants des classes (voir list_classes)',
      maxPerDayPerSubject: 'Heures max d’une même matière par jour',
      blockedDay: 'Jour libéré (1 = lundi) — ex. 3 pour mercredi',
      blockedFromPeriod: 'À partir de quelle heure le jour libéré est fermé (ex. 5 = après-midi)',
    },
    describe: (i) =>
      `Générer un nouveau brouillon d'emploi du temps pour ${(i.classIds as string[]).length} classe(s)` +
      (i.blockedDay ? `, sans cours le jour ${i.blockedDay} à partir de l'heure ${i.blockedFromPeriod ?? 1}` : '') +
      '. Le brouillon actuel de ces classes sera remplacé ; rien ne sera publié.',
    async run({ user, services }, i) {
      const blockedSlots = i.blockedDay
        ? Array.from({ length: 12 - ((i.blockedFromPeriod as number) ?? 1) + 1 }, (_, k) => ({ day: i.blockedDay as number, period: ((i.blockedFromPeriod as number) ?? 1) + k }))
        : [];
      const r = await services.timetable.generate(user, i.classIds, { maxPerDayPerSubject: i.maxPerDayPerSubject, blockedSlots });
      return { placed: r.placed, unplaced: r.unplaced, blockingConflicts: r.conflicts.filter((c: any) => c.severity === 'error').length };
    },
  }),
  tool({
    name: 'list_document_templates',
    description: 'Modèles de documents disponibles (certificats, attestations…).',
    permission: 'documents:read',
    feature: 'documents',
    sensitive: false,
    spec: {},
    async run({ user, services }) {
      const t = await services.documents.templates(user);
      return t.map((x: any) => ({ id: x.id, name: x.name, context: x.context, version: x.currentVersion }));
    },
  }),
  tool({
    name: 'generate_document',
    description: "Génère un document officiel numéroté (ex. certificat de scolarité) à partir d'un modèle pour un élève ou un membre du personnel. Action sensible : confirmation requise.",
    permission: 'documents:write',
    feature: 'documents',
    sensitive: true,
    spec: { templateId: { type: 'string', required: true, max: 40 }, subjectId: { type: 'string', max: 40 } },
    params: { templateId: 'Modèle (voir list_document_templates)', subjectId: 'Élève (id) ou membre du personnel (id StaffMember)' },
    describe: (i) => `Générer un document numéroté à partir du modèle ${i.templateId}${i.subjectId ? ` pour ${i.subjectId}` : ''}. Il sera enregistré dans l'historique.`,
    run: ({ user, services }, i) => services.documents.generate(user, i.templateId, i.subjectId),
  }),
  tool({
    name: 'update_showcase_section',
    description: "Active/désactive une section de la vitrine publique et peut modifier son titre et son texte. Action sensible (contenu public) : confirmation requise.",
    permission: 'school:settings',
    feature: 'showcase',
    sensitive: true,
    spec: { type: { type: 'string', required: true, enum: SECTION_TYPES }, enabled: { type: 'boolean', required: true }, title: { type: 'string', max: 120 }, content: { type: 'string', max: 5000 } },
    params: { type: 'Type de section', enabled: 'Section visible', title: 'Titre', content: 'Texte (sans HTML)' },
    describe: (i) => `${i.enabled ? 'Afficher' : 'Masquer'} la section « ${i.type} » de la vitrine publique${i.title ? `, titre « ${i.title} »` : ''}${i.content ? ', avec le texte proposé' : ''}.`,
    async run({ user, services }, i) {
      const settings = await services.settings.get(user);
      const sections = [...(settings.showcaseSections as any[])];
      const idx = sections.findIndex((s) => s.type === i.type);
      const next = { ...(idx >= 0 ? sections[idx] : { type: i.type }), enabled: i.enabled, ...(i.title ? { title: i.title } : {}), ...(i.content ? { content: i.content } : {}) };
      if (idx >= 0) sections[idx] = next;
      else sections.push(next);
      await services.settings.update(user, { showcaseSections: sections });
      return { updated: true, section: i.type };
    },
  }),
  tool({
    name: 'build_dashboard',
    description:
      "Propose un tableau de bord composé de blocs (kpi, chart, table) lisant des sources nommées : students.count, fees.stats, fees.unpaid, fees.overdue, attendance.today, grades.below_average, admissions.pending, payroll.summary, students.by_class. Le tableau est validé puis affiché ; l'utilisateur choisit de l'enregistrer.",
    permission: 'views:write',
    feature: 'ai.views',
    sensitive: false,
    spec: { title: { type: 'string', required: true, max: 80 }, componentsJson: { type: 'string', required: true, max: 4000 } },
    params: { title: 'Titre du tableau de bord', componentsJson: 'Tableau JSON de composants [{"type":"kpi","source":"fees.unpaid","title":"..."}]' },
    async run({ user, services }, i) {
      let components: unknown;
      try {
        components = JSON.parse(i.componentsJson as string);
      } catch {
        return { valid: false, errors: ['componentsJson n’est pas un JSON valide'] };
      }
      const spec = { title: i.title, components };
      const errors = services.data.validate(user, spec);
      return errors.length ? { valid: false, errors } : { valid: true, view: spec };
    },
  }),
];

/**
 * Decision aids computed from the school's own data with explicit rules (no generative model):
 * every sentence and figure can be traced back to a count or an amount.
 */

// ---------------------------------------------------------------- weekly summary

export interface WeekFigures {
  attendance: { marked: number; present: number; unjustified: number };
  collected: number;
  marksEntered: number;
  newApplications: number;
  smsSent: number;
}

export interface DigestInput {
  thisWeek: WeekFigures;
  lastWeek: WeekFigures;
  outstanding: number;
  overdue: { count: number; amount: number };
  newlyOverdue: { count: number; amount: number };
  repeatedAbsentees: { name: string; className: string; absences: number }[];
  stalledApplications: number;
  classesWithoutMarks: string[];
  pendingJustifications: number;
}

export type Tone = 'good' | 'warning' | 'info';

export interface DigestLine {
  topic: 'attendance' | 'finance' | 'grades' | 'admissions';
  tone: Tone;
  text: string;
}

const fcfa = (n: number) => `${new Intl.NumberFormat('fr-FR').format(Math.round(n)).replace(/\s/g, ' ')} FCFA`;
const pct = (n: number) => `${(Math.round(n * 10) / 10).toString().replace('.', ',')} %`;
const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;

export function attendanceRate(a: WeekFigures['attendance']): number | null {
  return a.marked ? (a.present / a.marked) * 100 : null;
}

/** The week in a few sentences, most important first within each topic. */
export function buildDigest(d: DigestInput): DigestLine[] {
  const lines: DigestLine[] = [];
  const rate = attendanceRate(d.thisWeek.attendance);
  const before = attendanceRate(d.lastWeek.attendance);

  if (rate === null) lines.push({ topic: 'attendance', tone: 'warning', text: "Aucun appel n'a été enregistré cette semaine." });
  else {
    const change = before === null ? null : rate - before;
    const trend = change === null || Math.abs(change) < 0.5 ? 'stable' : change > 0 ? `en hausse de ${pct(change).replace(' %', ' point(s)')}` : `en baisse de ${pct(-change).replace(' %', ' point(s)')}`;
    lines.push({ topic: 'attendance', tone: rate < 90 || (change !== null && change <= -2) ? 'warning' : 'good', text: `Taux de présence : ${pct(rate)}, ${trend} par rapport à la semaine précédente.` });
  }
  if (d.repeatedAbsentees.length) {
    const names = d.repeatedAbsentees.slice(0, 3).map((p) => `${p.name} (${p.className}, ${p.absences} absences)`).join(', ');
    lines.push({ topic: 'attendance', tone: 'warning', text: `${plural(d.repeatedAbsentees.length, 'élève a', 'élèves ont')} au moins 3 absences non justifiées cette semaine : ${names}${d.repeatedAbsentees.length > 3 ? '…' : '.'}` });
  }
  if (d.pendingJustifications) lines.push({ topic: 'attendance', tone: 'info', text: `${plural(d.pendingJustifications, 'justificatif envoyé par un parent attend', 'justificatifs envoyés par des parents attendent')} une réponse.` });

  const diff = d.thisWeek.collected - d.lastWeek.collected;
  lines.push({
    topic: 'finance',
    tone: d.thisWeek.collected > 0 ? 'good' : 'info',
    text: `${fcfa(d.thisWeek.collected)} encaissés cette semaine${d.lastWeek.collected > 0 ? ` (${diff >= 0 ? '+' : '−'}${fcfa(Math.abs(diff))} par rapport à la semaine précédente)` : ''}.`,
  });
  if (d.newlyOverdue.count) lines.push({ topic: 'finance', tone: 'warning', text: `${plural(d.newlyOverdue.count, 'facture est passée', 'factures sont passées')} en retard cette semaine, pour ${fcfa(d.newlyOverdue.amount)}.` });
  if (d.outstanding > 0) lines.push({ topic: 'finance', tone: d.overdue.amount > d.outstanding / 2 ? 'warning' : 'info', text: `Reste à encaisser : ${fcfa(d.outstanding)}, dont ${fcfa(d.overdue.amount)} en retard (${plural(d.overdue.count, 'facture', 'factures')}).` });

  if (d.thisWeek.marksEntered) lines.push({ topic: 'grades', tone: 'good', text: `${plural(d.thisWeek.marksEntered, 'note saisie', 'notes saisies')} cette semaine.` });
  if (d.classesWithoutMarks.length) {
    lines.push({ topic: 'grades', tone: 'warning', text: `${plural(d.classesWithoutMarks.length, "classe n'a", "classes n'ont")} encore aucune note pour la période en cours : ${d.classesWithoutMarks.slice(0, 5).join(', ')}${d.classesWithoutMarks.length > 5 ? '…' : '.'}` });
  }

  if (d.thisWeek.newApplications) lines.push({ topic: 'admissions', tone: 'good', text: `${plural(d.thisWeek.newApplications, 'nouvelle candidature reçue', 'nouvelles candidatures reçues')} cette semaine.` });
  if (d.stalledApplications) lines.push({ topic: 'admissions', tone: 'warning', text: `${plural(d.stalledApplications, 'dossier est', 'dossiers sont')} sans suite depuis plus de 7 jours.` });
  return lines;
}

// ---------------------------------------------------------------- collection forecast

export interface ForecastInvoice {
  totalAmount: number;
  paid: number;
  dueDate: Date;
  /** Date of the last successful payment, if any. */
  lastPaidAt: Date | null;
  status: string;
}

export const AGE_BUCKETS = [
  { key: 'notDue', label: 'Pas encore échues', min: -Infinity, max: 0 },
  { key: 'late30', label: '1 à 30 jours de retard', min: 0, max: 30 },
  { key: 'late90', label: '31 à 90 jours de retard', min: 30, max: 90 },
  { key: 'older', label: 'Plus de 90 jours de retard', min: 90, max: Infinity },
] as const;

const days = (from: Date, to: Date) => (to.getTime() - from.getTime()) / 86400000;

function bucketOf(daysLate: number) {
  return AGE_BUCKETS.find((b) => daysLate > b.min && daysLate <= b.max) ?? AGE_BUCKETS[0];
}

/**
 * What the school can expect to collect from its unpaid invoices. For each age bucket, the share
 * that ends up paid is measured on the school's closed history (invoices due more than 120 days
 * ago: how much of what was still unpaid at that age was eventually paid), then applied to what is
 * unpaid today. With too little history, prudent default rates are used and flagged.
 */
export function collectionForecast(invoices: ForecastInvoice[], now = new Date()) {
  const active = invoices.filter((i) => i.status !== 'CANCELLED' && i.status !== 'DRAFT');
  const DEFAULT_RATES: Record<string, number> = { notDue: 0.9, late30: 0.7, late90: 0.45, older: 0.2 };
  const history = active.filter((i) => days(i.dueDate, now) > 120 && i.totalAmount > 0);

  // For a closed invoice, the age at which it was settled tells which buckets it "survived" unpaid.
  const measured = AGE_BUCKETS.map((bucket) => {
    let exposed = 0;
    let recovered = 0;
    for (const inv of history) {
      const settledAfter = inv.lastPaidAt ? days(inv.dueDate, inv.lastPaidAt) : Infinity;
      const fullyPaid = inv.paid >= inv.totalAmount;
      // Still (at least partly) unpaid when it entered this bucket?
      if (fullyPaid && settledAfter <= bucket.min) continue;
      exposed += inv.totalAmount;
      recovered += inv.paid;
    }
    return { key: bucket.key, exposed, rate: exposed > 0 ? recovered / exposed : null };
  });
  const enoughHistory = history.length >= 30;

  const buckets = AGE_BUCKETS.map((bucket) => {
    const open = active.filter((i) => i.totalAmount - i.paid > 0 && bucketOf(days(i.dueDate, now)).key === bucket.key);
    const outstanding = open.reduce((s, i) => s + (i.totalAmount - i.paid), 0);
    const m = measured.find((x) => x.key === bucket.key)!;
    const rate = enoughHistory && m.rate !== null ? Math.min(1, m.rate) : DEFAULT_RATES[bucket.key];
    return { key: bucket.key, label: bucket.label, invoices: open.length, outstanding: Math.round(outstanding), rate: Math.round(rate * 100) / 100, expected: Math.round(outstanding * rate) };
  });
  const outstanding = buckets.reduce((s, b) => s + b.outstanding, 0);
  const expected = buckets.reduce((s, b) => s + b.expected, 0);
  return {
    basis: enoughHistory ? ('history' as const) : ('default' as const),
    historySize: history.length,
    outstanding,
    expected,
    atRisk: outstanding - expected,
    buckets,
  };
}

// ---------------------------------------------------------------- appreciation suggestion

export interface AppreciationInput {
  average: number | null;
  previousAverage: number | null;
  unjustifiedAbsences: number;
  strongest: { subject: string; average: number } | null;
  weakest: { subject: string; average: number } | null;
}

/** A council appreciation proposed from the results; the council edits or replaces it. */
export function suggestAppreciation(p: AppreciationInput): string | null {
  if (p.average === null) return null;
  const a = p.average;
  const parts: string[] = [];
  parts.push(
    a >= 16 ? 'Excellent trimestre.' : a >= 14 ? 'Très bon trimestre.' : a >= 12 ? 'Bon trimestre.' : a >= 10 ? 'Résultats satisfaisants dans l’ensemble.' : a >= 8.5 ? 'Résultats insuffisants.' : 'Résultats très insuffisants.',
  );
  if (p.previousAverage !== null) {
    const change = a - p.previousAverage;
    if (change >= 1) parts.push('Des progrès nets par rapport à la période précédente.');
    else if (change <= -1) parts.push('Les résultats sont en baisse par rapport à la période précédente.');
  }
  if (p.weakest && p.weakest.average < 10 && a >= 10) parts.push(`Un effort est attendu en ${p.weakest.subject}.`);
  else if (p.strongest && p.strongest.average >= 14 && a < 12) parts.push(`De bonnes dispositions en ${p.strongest.subject}, à étendre aux autres matières.`);
  if (p.unjustifiedAbsences >= 3) parts.push('Les absences non justifiées doivent cesser.');
  parts.push(a >= 14 ? 'Félicitations, continuez ainsi.' : a >= 10 ? 'Poursuivez vos efforts.' : 'Un travail régulier et soutenu est indispensable.');
  return parts.join(' ');
}

/** Monday 00:00 of the week containing `date` (local time). */
export function weekStart(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

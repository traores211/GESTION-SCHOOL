export type Period = "7d" | "30d" | "90d" | "year";

export const PERIOD_OPTIONS: { value: Period; label: string; long: string }[] = [
  { value: "7d", label: "7 j", long: "7 derniers jours" },
  { value: "30d", label: "30 j", long: "30 derniers jours" },
  { value: "90d", label: "90 j", long: "90 derniers jours" },
  { value: "year", label: "Année", long: "Depuis la rentrée" },
];

export interface DashboardFilterOptions {
  academicYears: { id: string; name: string; isCurrent: boolean }[];
  classes: { id: string; name: string; level: string; academicYearId: string }[];
  terms: { id: string; name: string; order: number; academicYearId: string }[];
}

export interface DashboardQuery {
  period: Period;
  academicYearId: string;
  classId: string;
  termId: string;
}

export interface Analytics {
  filters: {
    period: Period;
    academicYear: { id: string; name: string };
    classId: string | null;
    term: { id: string; name: string } | null;
    from: string;
    to: string;
    previousFrom: string;
    previousTo: string;
  };
  thresholds: {
    attendanceRateWarning: number;
    classFillWarning: number;
    classFillDanger: number;
    recoveryRateWarning: number;
    classAverageWarning: number;
  };
  kpis: {
    enrolledStudents: number;
    attendanceRate: { value: number | null; previous: number | null; delta: number | null };
    collected: { value: number; previous: number; variation: number | null };
    recoveryRate: number | null;
    totalInvoiced: number;
    totalPaid: number;
    outstanding: number;
    overdue: { count: number; amount: number };
    pendingAdmissions: number;
  };
  attendanceTrend: {
    date: string;
    present: number;
    late: number;
    absent: number;
    justified: number;
    total: number;
    rate: number | null;
  }[];
  attendanceByClass: { classId: string; name: string; absences: number; late: number; total: number; rate: number | null }[];
  collectionsByMonth: { month: string; amount: number; variation: number | null }[];
  paymentsByMethod: { method: string; amount: number; count: number }[];
  invoicesByStatus: { status: InvoiceStatus; count: number; amount: number }[];
  overdueInvoices: {
    id: string;
    reference: string;
    student: { id: string; firstName: string; lastName: string; matricule: string };
    dueDate: string;
    daysLate: number;
    outstanding: number;
  }[];
  admissionsFunnel: { status: string; count: number }[];
  classFill: { classId: string; name: string; level: string; enrolled: number; capacity: number; rate: number | null }[];
  gradesByClass: {
    classId: string;
    name: string;
    studentsGraded: number;
    average: number | null;
    successRate: number | null;
    best: number | null;
    lowest: number | null;
  }[];
  alerts: { level: "danger" | "warning"; message: string }[];
}

export type InvoiceStatus = "PAID" | "PARTIALLY_PAID" | "PENDING" | "OVERDUE" | "CANCELLED" | "DRAFT";

export const INVOICE_STATUS: Record<InvoiceStatus, { label: string; icon: string; color: string }> = {
  PAID: { label: "Soldées", icon: "✓", color: "var(--brand)" },
  PARTIALLY_PAID: { label: "Partiellement payées", icon: "◐", color: "var(--warning-mark)" },
  PENDING: { label: "En attente (non échues)", icon: "○", color: "var(--neutral-bar)" },
  OVERDUE: { label: "Échues impayées", icon: "!", color: "var(--danger)" },
  DRAFT: { label: "Brouillons", icon: "·", color: "var(--border-strong)" },
  CANCELLED: { label: "Annulées", icon: "×", color: "var(--border-strong)" },
};

export const INVOICE_STATUS_ORDER: InvoiceStatus[] = ["PAID", "PARTIALLY_PAID", "PENDING", "OVERDUE", "DRAFT", "CANCELLED"];

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: "Espèces",
  MOBILE_MONEY_ORANGE: "Orange Money",
  MOBILE_MONEY_MTN: "MTN MoMo",
  MOBILE_MONEY_MOOV: "Moov Money",
  WAVE: "Wave",
  BANK_TRANSFER: "Virement",
  CHEQUE: "Chèque",
  CARD: "Carte bancaire",
};

export const ADMISSION_STATUS_LABELS: Record<string, string> = {
  CANDIDATURE: "Candidature",
  DOSSIER_INCOMPLET: "Dossier incomplet",
  DOSSIER_COMPLET: "Dossier complet",
  ETUDE: "En étude",
  TEST: "Test",
  ENTRETIEN: "Entretien",
  ADMIS: "Admis",
  INSCRIPTION: "Inscription",
  CONFIRME: "Confirmé",
  REJETE: "Rejeté",
};

const numberFormat = new Intl.NumberFormat("fr-FR");

export function formatNumber(value: number) {
  return numberFormat.format(Math.round(value));
}

export function formatFCFA(value: number) {
  return `${formatNumber(value)} FCFA`;
}

/** Short amount for axes and tight spaces: 1,2 M / 450 k. */
export function formatCompact(value: number) {
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} M`;
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toLocaleString("fr-FR", { maximumFractionDigits: 0 })} k`;
  return formatNumber(value);
}

export function formatPercent(value: number | null, digits = 1) {
  if (value === null) return "—";
  return `${value.toLocaleString("fr-FR", { maximumFractionDigits: digits })} %`;
}

export function formatDate(value: string | Date, options: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short" }) {
  return new Date(value).toLocaleDateString("fr-FR", options);
}

export function formatMonth(month: string, style: "short" | "long" = "short") {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("fr-FR", { month: style, year: style === "long" ? "numeric" : "2-digit" });
}

/** Admission workflow: types mirroring the /admissions API, labels and helpers. */

export type AdmissionStatus = "CANDIDATURE" | "DOSSIER_INCOMPLET" | "DOSSIER_COMPLET" | "ETUDE" | "TEST" | "ENTRETIEN" | "ADMIS" | "REJETE" | "INSCRIPTION" | "CONFIRME";

export const STATUS_LABELS: Record<AdmissionStatus, string> = {
  CANDIDATURE: "Candidature reçue",
  DOSSIER_INCOMPLET: "Dossier incomplet",
  DOSSIER_COMPLET: "Dossier complet",
  ETUDE: "À l'étude",
  TEST: "Test d'admission",
  ENTRETIEN: "Entretien",
  ADMIS: "Admis",
  REJETE: "Non retenu",
  INSCRIPTION: "Inscription",
  CONFIRME: "Inscription confirmée",
};

/** Main path shown in the progress bar; side steps are placed on it. */
export const MAIN_PATH: { status: AdmissionStatus; label: string }[] = [
  { status: "CANDIDATURE", label: "Candidature" },
  { status: "DOSSIER_COMPLET", label: "Dossier complet" },
  { status: "ETUDE", label: "Étude" },
  { status: "ADMIS", label: "Décision" },
  { status: "INSCRIPTION", label: "Inscription" },
  { status: "CONFIRME", label: "Confirmée" },
];

export function pathIndex(status: AdmissionStatus): number {
  const map: Partial<Record<AdmissionStatus, AdmissionStatus>> = { DOSSIER_INCOMPLET: "CANDIDATURE", TEST: "ETUDE", ENTRETIEN: "ETUDE", REJETE: "ADMIS" };
  return Math.max(0, MAIN_PATH.findIndex((s) => s.status === (map[status] ?? status)));
}

export function statusTone(status: AdmissionStatus): "danger" | "olive" | "orange" | "info" {
  if (status === "REJETE") return "danger";
  if (status === "CONFIRME" || status === "INSCRIPTION" || status === "ADMIS") return "olive";
  if (status === "DOSSIER_INCOMPLET") return "orange";
  return "info";
}

export const PIECE_LABELS: Record<string, string> = { MANQUANT: "Manquante", RECU: "Reçue", VALIDE: "Validée", REFUSE: "Refusée" };
export const OPINION_LABELS: Record<string, string> = { FAVORABLE: "Favorable", RESERVE: "Réservé", DEFAVORABLE: "Défavorable" };

export interface AdmissionRow {
  id: string;
  reference: string | null;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  status: AdmissionStatus;
  source: string;
  requestedLevel: string | null;
  guardianName: string | null;
  guardianPhone: string | null;
  submittedAt: string;
  updatedAt: string;
  student: { id: string; matricule: string } | null;
  piecesRequired: number;
  piecesReceived: number;
  lastEvent: { title: string; createdAt: string; userName: string | null } | null;
}

export interface Piece {
  id: string;
  kind: string;
  label: string;
  required: boolean;
  status: "MANQUANT" | "RECU" | "VALIDE" | "REFUSE";
  note: string | null;
  fileName: string | null;
  fileMime: string | null;
  hasFile: boolean;
  updatedAt: string;
}

export interface TimelineEvent {
  id: string;
  type: "CREATED" | "STATUS" | "NOTE" | "CONTACT" | "PIECE" | "TEST" | "INTERVIEW" | "CLASS" | "UPDATED" | "ENROLLED";
  title: string;
  message: string | null;
  fromStatus: AdmissionStatus | null;
  toStatus: AdmissionStatus | null;
  data: { changes?: { field: string; before: unknown; after: unknown }[]; [k: string]: unknown } | null;
  userName: string | null;
  createdAt: string;
}

export interface Transition {
  to: AdmissionStatus;
  label: string;
  tone: "primary" | "secondary" | "danger";
  allowed: boolean;
  blockedBy?: string;
  needsReason?: boolean;
}

export interface Dossier extends Omit<AdmissionRow, "piecesRequired" | "piecesReceived" | "lastEvent" | "student"> {
  dateOfBirth: string | null;
  gender: string;
  previousSchool: string | null;
  address: string | null;
  guardianEmail: string | null;
  guardianRelation: string | null;
  testScheduledAt: string | null;
  testScore: number | null;
  testMaxScore: number | null;
  interviewAt: string | null;
  interviewDone: boolean;
  interviewNotes: string | null;
  interviewOpinion: string | null;
  classId: string | null;
  decisionReason: string | null;
  decidedAt: string | null;
  enrolledAt: string | null;
  confirmedAt: string | null;
  academicYear: { id: string; name: string };
  student: { id: string; matricule: string; firstName: string; lastName: string } | null;
  class: { id: string; name: string; level: string; capacity: number; enrolled: number } | null;
  pieces: Piece[];
  events: TimelineEvent[];
  transitions: Transition[];
  fileComplete: boolean;
}

export interface ClassOption {
  id: string;
  name: string;
  level: string;
  capacity: number;
  enrolled: number;
  free: number;
  matchesLevel: boolean;
}

export const LEVELS = ["6ème", "5ème", "4ème", "3ème", "2nde", "1ère", "Terminale"];
export const RELATIONS = ["Mère", "Père", "Tuteur", "Tutrice", "Oncle", "Tante", "Grand-parent", "Autre"];

export function fullName(a: { firstName: string; lastName: string }) {
  return `${a.lastName.toUpperCase()} ${a.firstName}`;
}

export function formatDate(value: string | null | undefined, withTime = false) {
  if (!value) return "—";
  const d = new Date(value);
  return withTime ? d.toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" }) : d.toLocaleDateString("fr-FR", { dateStyle: "medium" });
}

/** "il y a 3 jours", "à l'instant"… */
export function relativeTime(value: string) {
  const diff = (Date.now() - new Date(value).getTime()) / 1000;
  const rtf = new Intl.RelativeTimeFormat("fr", { numeric: "auto" });
  if (diff < -60) return formatDate(value, true);
  if (diff < 60) return "à l'instant";
  if (diff < 3600) return rtf.format(-Math.round(diff / 60), "minute");
  if (diff < 86400) return rtf.format(-Math.round(diff / 3600), "hour");
  if (diff < 86400 * 30) return rtf.format(-Math.round(diff / 86400), "day");
  if (diff < 86400 * 365) return rtf.format(-Math.round(diff / (86400 * 30)), "month");
  return rtf.format(-Math.round(diff / (86400 * 365)), "year");
}

/** Days spent in the process so far (or until confirmation / rejection). */
export function daysInProcess(d: { submittedAt: string; confirmedAt?: string | null; decidedAt?: string | null; status: AdmissionStatus }) {
  const end = d.status === "CONFIRME" && d.confirmedAt ? new Date(d.confirmedAt) : d.status === "REJETE" && d.decidedAt ? new Date(d.decidedAt) : new Date();
  return Math.max(0, Math.round((end.getTime() - new Date(d.submittedAt).getTime()) / 86400000));
}

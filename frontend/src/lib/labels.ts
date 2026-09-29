/** French labels and badge styles for status codes shared by several pages. */

export const ATTENDANCE_STATUS: Record<string, { label: string; badge: string }> = {
  PRESENT: { label: "Présent", badge: "badge-green" },
  ABSENT: { label: "Absent", badge: "badge-danger" },
  RETARD: { label: "Retard", badge: "badge-warning" },
  ABSENCE_JUSTIFIEE: { label: "Absence justifiée", badge: "badge-info" },
};

export const INVOICE_STATUS: Record<string, { label: string; badge: string }> = {
  DRAFT: { label: "Brouillon", badge: "badge-neutral" },
  PENDING: { label: "À payer", badge: "badge-orange" },
  PARTIALLY_PAID: { label: "Partiellement payée", badge: "badge-warning" },
  PAID: { label: "Payée", badge: "badge-green" },
  OVERDUE: { label: "En retard", badge: "badge-danger" },
  CANCELLED: { label: "Annulée", badge: "badge-neutral" },
};

export const STUDENT_STATUS: Record<string, { label: string; badge: string }> = {
  INSCRIT: { label: "Inscrit", badge: "badge-green" },
  PRESENT: { label: "Présent", badge: "badge-green" },
  RETIRE: { label: "Retiré", badge: "badge-neutral" },
  DIPLOME: { label: "Diplômé", badge: "badge-info" },
  REDOUBLANT: { label: "Redoublant", badge: "badge-warning" },
};

export function statusBadge(map: Record<string, { label: string; badge: string }>, code: string) {
  return map[code] ?? { label: code, badge: "badge-neutral" };
}

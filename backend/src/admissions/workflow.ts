/**
 * Admission workflow: the steps of an application, which moves are allowed from each step, and the
 * conditions each move requires (complete file, test score, interview held, class assigned…).
 * Pure, so the rules are unit tested and the dossier screen can show why a move is not possible yet.
 */

export const ADMISSION_STATUSES = [
  'CANDIDATURE',
  'DOSSIER_INCOMPLET',
  'DOSSIER_COMPLET',
  'ETUDE',
  'TEST',
  'ENTRETIEN',
  'ADMIS',
  'REJETE',
  'INSCRIPTION',
  'CONFIRME',
] as const;

export type AdmissionStatusName = (typeof ADMISSION_STATUSES)[number];

export const STATUS_LABELS: Record<AdmissionStatusName, string> = {
  CANDIDATURE: 'Candidature reçue',
  DOSSIER_INCOMPLET: 'Dossier incomplet',
  DOSSIER_COMPLET: 'Dossier complet',
  ETUDE: "À l'étude",
  TEST: 'Test d’admission',
  ENTRETIEN: 'Entretien',
  ADMIS: 'Admis',
  REJETE: 'Non retenu',
  INSCRIPTION: 'Inscription',
  CONFIRME: 'Inscription confirmée',
};

/** Pieces asked for every application. */
export const DEFAULT_PIECES = [
  { kind: 'ACTE_NAISSANCE', label: "Extrait d'acte de naissance", required: true },
  { kind: 'BULLETINS', label: "Bulletins de l'année précédente", required: true },
  { kind: 'CERTIFICAT_SCOLARITE', label: 'Certificat de scolarité ou exeat', required: true },
  { kind: 'PHOTO', label: "Photo d'identité", required: true },
  { kind: 'CARNET_VACCINATION', label: 'Carnet de vaccination', required: false },
] as const;

export const PIECE_STATUSES = ['MANQUANT', 'RECU', 'VALIDE', 'REFUSE'] as const;
export type PieceStatus = (typeof PIECE_STATUSES)[number];
export const PIECE_LABELS: Record<PieceStatus, string> = { MANQUANT: 'Manquante', RECU: 'Reçue', VALIDE: 'Validée', REFUSE: 'Refusée' };

export interface DossierState {
  status: AdmissionStatusName;
  pieces: { label: string; required: boolean; status: string }[];
  testScore: number | null;
  interviewDone: boolean;
  classId: string | null;
  studentId: string | null;
}

export interface Transition {
  to: AdmissionStatusName;
  label: string;
  tone: 'primary' | 'secondary' | 'danger';
  allowed: boolean;
  /** Why the move is not possible yet. */
  blockedBy?: string;
  /** The move must be justified (rejection, reopening). */
  needsReason?: boolean;
}

/** Required pieces not yet received (refused pieces count as missing). */
export function missingPieces(state: Pick<DossierState, 'pieces'>) {
  return state.pieces.filter((p) => p.required && p.status !== 'RECU' && p.status !== 'VALIDE');
}

export function isFileComplete(state: Pick<DossierState, 'pieces'>) {
  return missingPieces(state).length === 0;
}

const FINAL: AdmissionStatusName[] = ['CONFIRME'];

/** Every move offered from the current step, with its condition. */
export function transitionsFor(state: DossierState): Transition[] {
  const missing = missingPieces(state);
  const missingText = missing.length ? `${missing.length} pièce${missing.length > 1 ? 's' : ''} obligatoire${missing.length > 1 ? 's' : ''} manquante${missing.length > 1 ? 's' : ''} : ${missing.map((p) => p.label).join(', ')}` : undefined;
  const refused = state.pieces.filter((p) => p.status === 'REFUSE');
  const t = (to: AdmissionStatusName, label: string, tone: Transition['tone'], blockedBy?: string, needsReason = false): Transition => ({
    to,
    label,
    tone,
    allowed: !blockedBy,
    ...(blockedBy ? { blockedBy } : {}),
    ...(needsReason ? { needsReason } : {}),
  });
  const reject = t('REJETE', 'Ne pas retenir', 'danger', undefined, true);

  switch (state.status) {
    case 'CANDIDATURE':
      return [
        t('DOSSIER_COMPLET', 'Valider le dossier', 'primary', missingText),
        t('DOSSIER_INCOMPLET', 'Signaler un dossier incomplet', 'secondary', missing.length ? undefined : 'Toutes les pièces obligatoires sont reçues'),
        reject,
      ];
    case 'DOSSIER_INCOMPLET':
      return [t('DOSSIER_COMPLET', 'Valider le dossier', 'primary', missingText), reject];
    case 'DOSSIER_COMPLET':
      return [t('ETUDE', "Mettre à l'étude", 'primary', missingText), reject];
    case 'ETUDE':
      return [
        t('TEST', 'Convoquer au test', 'secondary'),
        t('ENTRETIEN', "Convoquer à l'entretien", 'secondary'),
        t('ADMIS', 'Admettre', 'primary', refused.length ? `Pièce refusée : ${refused.map((p) => p.label).join(', ')}` : undefined),
        reject,
      ];
    case 'TEST': {
      const noScore = state.testScore == null ? 'Saisissez d’abord le résultat du test' : undefined;
      return [t('ENTRETIEN', "Convoquer à l'entretien", 'secondary', noScore), t('ADMIS', 'Admettre', 'primary', noScore), reject];
    }
    case 'ENTRETIEN':
      return [t('ADMIS', 'Admettre', 'primary', state.interviewDone ? undefined : "Enregistrez d'abord le compte rendu de l'entretien"), reject];
    case 'ADMIS':
      return [
        t('INSCRIPTION', "Inscrire l'élève", 'primary', state.classId ? undefined : 'Affectez d’abord une classe'),
        t('REJETE', 'Enregistrer un désistement', 'danger', undefined, true),
      ];
    case 'INSCRIPTION':
      return [t('CONFIRME', "Confirmer l'inscription", 'primary', state.studentId ? undefined : "L'élève n'a pas encore de fiche"), t('REJETE', 'Enregistrer un désistement', 'danger', undefined, true)];
    case 'REJETE':
      return [t('ETUDE', 'Réexaminer la candidature', 'secondary', undefined, true)];
    default:
      return [];
  }
}

/** Throws a readable error when a move is not allowed; returns the transition otherwise. */
export function assertTransition(state: DossierState, to: string, reason?: string | null): Transition {
  if (FINAL.includes(state.status)) throw new Error("L'inscription est confirmée : le dossier est clos");
  const move = transitionsFor(state).find((m) => m.to === to);
  if (!move) {
    throw new Error(`Passage impossible de « ${STATUS_LABELS[state.status]} » à « ${STATUS_LABELS[to as AdmissionStatusName] ?? to} »`);
  }
  if (!move.allowed) throw new Error(`${move.label} : ${move.blockedBy}`);
  if (move.needsReason && !reason?.trim()) throw new Error(`${move.label} : indiquez le motif`);
  return move;
}

/** Index of a step on the main path (rejection is off the path). */
export const MAIN_PATH: AdmissionStatusName[] = ['CANDIDATURE', 'DOSSIER_COMPLET', 'ETUDE', 'ADMIS', 'INSCRIPTION', 'CONFIRME'];

export function pathProgress(status: AdmissionStatusName): number {
  const map: Partial<Record<AdmissionStatusName, AdmissionStatusName>> = { DOSSIER_INCOMPLET: 'CANDIDATURE', TEST: 'ETUDE', ENTRETIEN: 'ETUDE' };
  const i = MAIN_PATH.indexOf(map[status] ?? status);
  return i < 0 ? 0 : i;
}

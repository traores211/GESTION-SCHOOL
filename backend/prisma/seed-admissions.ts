/**
 * Brings applications created before the admission workflow up to date: reference number, pieces
 * consistent with their step, a reconstructed timeline (creation then each step reached) and, for
 * enrolled students, their class. Idempotent: applications that already have a timeline are skipped.
 * Standalone: `npx ts-node prisma/seed-admissions.ts`; also called at the end of the main seed.
 */
import { PrismaClient } from '@prisma/client';
import { DEFAULT_PIECES, STATUS_LABELS, AdmissionStatusName } from '../src/admissions/workflow';

/** Steps an application went through to reach its current status. */
const PATHS: Record<AdmissionStatusName, AdmissionStatusName[]> = {
  CANDIDATURE: [],
  DOSSIER_INCOMPLET: ['DOSSIER_INCOMPLET'],
  DOSSIER_COMPLET: ['DOSSIER_COMPLET'],
  ETUDE: ['DOSSIER_COMPLET', 'ETUDE'],
  TEST: ['DOSSIER_COMPLET', 'ETUDE', 'TEST'],
  ENTRETIEN: ['DOSSIER_COMPLET', 'ETUDE', 'TEST', 'ENTRETIEN'],
  ADMIS: ['DOSSIER_COMPLET', 'ETUDE', 'TEST', 'ADMIS'],
  REJETE: ['DOSSIER_COMPLET', 'ETUDE', 'REJETE'],
  INSCRIPTION: ['DOSSIER_COMPLET', 'ETUDE', 'TEST', 'ADMIS', 'INSCRIPTION'],
  CONFIRME: ['DOSSIER_COMPLET', 'ETUDE', 'TEST', 'ADMIS', 'INSCRIPTION', 'CONFIRME'],
};

const REJECTION_REASONS = ['Niveau insuffisant au test d’admission', 'Plus de place disponible dans le niveau demandé', 'Dossier scolaire incomplet après relance', 'Désistement de la famille'];
const LEVELS = ['6ème', '5ème', '4ème', '3ème', '2nde', '1ère', 'Terminale'];
const STAFF = ['Secrétariat', 'Direction des études'];

function rng(seed: string) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

export async function seedAdmissions(prisma: PrismaClient) {
  const admissions = await prisma.admission.findMany({
    where: { events: { none: {} } },
    include: { academicYear: { select: { name: true } }, student: { include: { enrollments: { where: { withdrawalDate: null }, include: { class: true } } } } },
    orderBy: [{ schoolId: 'asc' }, { submittedAt: 'asc' }],
  });
  if (!admissions.length) {
    console.log('Admissions already up to date: skipped');
    return;
  }
  const counters = new Map<string, number>();
  for (const a of await prisma.admission.findMany({ where: { reference: { not: null } }, select: { schoolId: true, reference: true } })) {
    const key = `${a.schoolId}|${a.reference!.slice(0, 9)}`;
    counters.set(key, Math.max(counters.get(key) ?? 0, Number(a.reference!.slice(9))));
  }

  for (const a of admissions) {
    const random = rng(a.id);
    const status = a.status as AdmissionStatusName;
    const prefix = `ADM-${a.academicYear.name.slice(0, 4)}-`;
    const key = `${a.schoolId}|${prefix}`;
    const n = (counters.get(key) ?? 0) + 1;
    counters.set(key, n);
    const path = PATHS[status];
    const complete = path.includes('DOSSIER_COMPLET');
    const enrolledClass = a.student?.enrollments[0]?.class ?? null;
    const level = enrolledClass?.level ?? a.requestedLevel ?? LEVELS[Math.floor(random() * LEVELS.length)];
    const tookTest = path.includes('TEST');
    const score = tookTest ? Math.round((status === 'REJETE' ? 6 + random() * 3 : 11 + random() * 8) * 2) / 2 : null;
    const reason = status === 'REJETE' ? REJECTION_REASONS[Math.floor(random() * REJECTION_REASONS.length)] : null;

    // Timeline dates spread between submission and last update (a few days per step), never in the future.
    const start = a.submittedAt.getTime();
    const now = Date.now() - 3600000;
    const wanted = Math.max(a.updatedAt.getTime(), start + (path.length + 1) * 2 * 86400000);
    const end = Math.max(start + 60000, Math.min(now, wanted));
    const at = (i: number) => new Date(start + ((end - start) * (i + 1)) / (path.length + 1));

    await prisma.$transaction(async (tx) => {
      await tx.admission.update({
        where: { id: a.id },
        data: {
          reference: `${prefix}${String(n).padStart(4, '0')}`,
          requestedLevel: level,
          source: random() < 0.35 ? 'EN_LIGNE' : 'GUICHET',
          testScore: score,
          testMaxScore: tookTest ? 20 : null,
          testScheduledAt: tookTest ? at(path.indexOf('TEST')) : null,
          interviewDone: path.includes('ENTRETIEN') ? random() < 0.5 : false,
          classId: enrolledClass?.id ?? null,
          decisionReason: reason,
          decidedAt: path.includes('ADMIS') ? at(path.indexOf('ADMIS')) : status === 'REJETE' ? at(path.length - 1) : null,
          enrolledAt: path.includes('INSCRIPTION') ? at(path.indexOf('INSCRIPTION')) : null,
          confirmedAt: status === 'CONFIRME' ? at(path.length - 1) : null,
        },
      });
      await tx.admissionPiece.createMany({
        data: DEFAULT_PIECES.map((p, i) => ({
          admissionId: a.id,
          kind: p.kind,
          label: p.label,
          required: p.required,
          status: complete ? (path.includes('ETUDE') ? 'VALIDE' : 'RECU') : status === 'DOSSIER_INCOMPLET' && i >= 2 ? 'MANQUANT' : status === 'CANDIDATURE' ? (i === 0 ? 'RECU' : 'MANQUANT') : 'RECU',
        })),
      });
      const events = [
        {
          admissionId: a.id,
          type: 'CREATED',
          title: 'Candidature enregistrée',
          toStatus: 'CANDIDATURE',
          message: `Demande d'admission en ${level}`,
          userName: STAFF[0],
          createdAt: a.submittedAt,
        },
        ...path.map((step, i) => ({
          admissionId: a.id,
          type: 'STATUS',
          title: STATUS_LABELS[step],
          fromStatus: i === 0 ? 'CANDIDATURE' : path[i - 1],
          toStatus: step,
          message:
            step === 'REJETE'
              ? `Motif : ${reason}`
              : step === 'TEST' && score != null
                ? `Résultat du test : ${score}/20`
                : step === 'INSCRIPTION' && enrolledClass
                  ? `Inscription en ${enrolledClass.name}${a.student ? ` (matricule ${a.student.matricule})` : ''}`
                  : step === 'DOSSIER_INCOMPLET'
                    ? 'Pièces manquantes : certificat de scolarité, photo d’identité'
                    : null,
          userName: step === 'DOSSIER_COMPLET' || step === 'DOSSIER_INCOMPLET' ? STAFF[0] : STAFF[1],
          createdAt: at(i),
        })),
      ];
      await tx.admissionEvent.createMany({ data: events });
    });
  }
  console.log(`Admissions: ${admissions.length} dossier(s) complété(s) (référence, pièces, timeline)`);
}

if (require.main === module) {
  const prisma = new PrismaClient();
  seedAdmissions(prisma)
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}

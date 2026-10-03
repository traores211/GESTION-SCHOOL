import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/current-user.decorator';
import { SequenceService } from '../infra/sequence.service';
import { StorageService } from '../infra/storage.service';
import { AddPieceDto, AssignClassDto, CreateAdmissionDto, InterviewDto, NoteDto, PieceUpdateDto, TestDto, UpdateAdmissionDto } from './dto/create-admission.dto';
import {
  ADMISSION_STATUSES,
  AdmissionStatusName,
  DEFAULT_PIECES,
  DossierState,
  PIECE_LABELS,
  PieceStatus,
  STATUS_LABELS,
  assertTransition,
  isFileComplete,
  transitionsFor,
} from './workflow';

/** Kept for callers of the former API (list filters). */
export const ADMISSION_WORKFLOW = ADMISSION_STATUSES;

/** Storage prefix of application files. Locally a dot-folder of the uploads volume: express.static never serves dotfiles. */
const ADMISSION_FILES_PREFIX = '.admissions';
export const MAX_PIECE_BYTES = 5 * 1024 * 1024;

type Tx = Prisma.TransactionClient | PrismaService;

export interface Actor {
  userId: string | null;
  userName: string | null;
}

const EVENT_TITLES = {
  CREATED: 'Candidature enregistrée',
} as const;

const OPINIONS: Record<string, string> = { FAVORABLE: 'favorable', RESERVE: 'réservé', DEFAVORABLE: 'défavorable' };

/** PDF, JPEG or PNG only, recognised by their signature (the extension is not trusted). */
function detectDocument(buffer: Buffer): { ext: string; mime: string } | null {
  if (buffer.length < 8) return null;
  if (buffer.subarray(0, 4).toString('ascii') === '%PDF') return { ext: 'pdf', mime: 'application/pdf' };
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return { ext: 'jpg', mime: 'image/jpeg' };
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { ext: 'png', mime: 'image/png' };
  return null;
}

const FIELD_LABELS: Record<string, string> = {
  firstName: 'prénom',
  lastName: 'nom',
  email: 'e-mail',
  phone: 'téléphone',
  dateOfBirth: 'date de naissance',
  gender: 'sexe',
  requestedLevel: 'niveau demandé',
  previousSchool: "école d'origine",
  address: 'adresse',
  guardianName: 'responsable',
  guardianPhone: 'téléphone du responsable',
  guardianEmail: 'e-mail du responsable',
  guardianRelation: 'lien de parenté',
};

@Injectable()
export class AdmissionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sequences: SequenceService,
    private readonly storage: StorageService,
  ) {}

  // ---------------------------------------------------------------- helpers

  private requireSchool(user: AuthUser) {
    if (!user.schoolId) throw new BadRequestException("L'utilisateur n'est rattaché à aucun établissement");
    return user.schoolId;
  }

  private async actor(user: AuthUser): Promise<Actor> {
    const u = await this.prisma.user.findUnique({ where: { id: user.userId }, select: { firstName: true, lastName: true } });
    return { userId: user.userId, userName: u ? `${u.firstName} ${u.lastName}`.trim() : null };
  }

  private async owned(user: AuthUser, id: string) {
    const admission = await this.prisma.admission.findUnique({ where: { id }, include: { pieces: true } });
    if (!admission) throw new NotFoundException('Candidature introuvable');
    if (admission.schoolId !== user.schoolId) throw new ForbiddenException();
    return admission;
  }

  private log(db: Tx, admissionId: string, actor: Actor, event: { type: string; title: string; message?: string | null; fromStatus?: string | null; toStatus?: string | null; data?: object }) {
    return db.admissionEvent.create({
      data: {
        admissionId,
        type: event.type,
        title: event.title,
        message: event.message ?? null,
        fromStatus: event.fromStatus ?? null,
        toStatus: event.toStatus ?? null,
        data: event.data ? JSON.stringify(event.data) : null,
        userId: actor.userId,
        userName: actor.userName,
      },
    });
  }

  private state(a: { status: string; pieces: { label: string; required: boolean; status: string }[]; testScore: number | null; interviewDone: boolean; classId: string | null; studentId: string | null }): DossierState {
    return { status: a.status as AdmissionStatusName, pieces: a.pieces, testScore: a.testScore, interviewDone: a.interviewDone, classId: a.classId, studentId: a.studentId };
  }

  /** "ADM-2025-0042": year of the academic year, atomic counter within the school. */
  private nextReference(db: Tx, schoolId: string, yearName: string) {
    return this.sequences.admissionReference(schoolId, yearName, db);
  }

  /**
   * Creates an application with its default pieces and the first timeline entry. Shared by the office
   * form and the public online form.
   */
  async createDossier(schoolId: string, dto: CreateAdmissionDto, source: 'GUICHET' | 'EN_LIGNE', actor: Actor) {
    const year = await this.prisma.academicYear.findFirst({ where: { schoolId, isCurrent: true } });
    if (!year) throw new BadRequestException("Aucune année scolaire courante n'est configurée");
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          const reference = await this.nextReference(tx, schoolId, year.name);
          const admission = await tx.admission.create({
            data: {
              schoolId,
              academicYearId: year.id,
              reference,
              source,
              firstName: dto.firstName.trim(),
              lastName: dto.lastName.trim(),
              email: dto.email?.trim() ?? '',
              phone: dto.phone?.trim() || null,
              dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
              gender: dto.gender ?? 'M',
              requestedLevel: dto.requestedLevel?.trim() || null,
              previousSchool: dto.previousSchool?.trim() || null,
              address: dto.address?.trim() || null,
              guardianName: dto.guardianName?.trim() || null,
              guardianPhone: dto.guardianPhone?.trim() || null,
              guardianEmail: dto.guardianEmail?.trim() || null,
              guardianRelation: dto.guardianRelation?.trim() || null,
            },
          });
          await tx.admissionPiece.createMany({ data: DEFAULT_PIECES.map((p) => ({ admissionId: admission.id, kind: p.kind, label: p.label, required: p.required })) });
          await this.log(tx, admission.id, actor, {
            type: 'CREATED',
            title: EVENT_TITLES.CREATED,
            toStatus: 'CANDIDATURE',
            message: source === 'EN_LIGNE' ? 'Déposée en ligne depuis la vitrine de l’établissement' : 'Saisie au guichet du secrétariat',
            data: { reference, requestedLevel: admission.requestedLevel },
          });
          return admission;
        });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002' && attempt < 2) continue; // reference taken concurrently
        throw err;
      }
    }
    throw new ConflictException('Impossible de numéroter la candidature, réessayez');
  }

  // ---------------------------------------------------------------- read

  create(user: AuthUser, dto: CreateAdmissionDto) {
    const schoolId = this.requireSchool(user);
    return this.actor(user).then((actor) => this.createDossier(schoolId, dto, 'GUICHET', actor));
  }

  async findAll(user: AuthUser, status?: string) {
    if (!user.schoolId) return [];
    const rows = await this.prisma.admission.findMany({
      where: { schoolId: user.schoolId, ...(status ? { status: status as never } : {}) },
      include: {
        student: { select: { id: true, matricule: true } },
        pieces: { select: { required: true, status: true } },
        events: { orderBy: { createdAt: 'desc' }, take: 1, select: { title: true, createdAt: true, userName: true } },
      },
      orderBy: { submittedAt: 'desc' },
    });
    return rows.map(({ pieces, events, ...a }) => ({
      ...a,
      piecesRequired: pieces.filter((p) => p.required).length,
      piecesReceived: pieces.filter((p) => p.required && (p.status === 'RECU' || p.status === 'VALIDE')).length,
      lastEvent: events[0] ?? null,
    }));
  }

  /** The full dossier: identity, pieces, test, interview, class, timeline and the moves available. */
  async findOne(user: AuthUser, id: string) {
    const schoolId = this.requireSchool(user);
    const admission = await this.prisma.admission.findUnique({
      where: { id },
      include: {
        student: { select: { id: true, matricule: true, firstName: true, lastName: true } },
        academicYear: { select: { id: true, name: true } },
        pieces: { orderBy: [{ required: 'desc' }, { createdAt: 'asc' }] },
        events: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!admission) throw new NotFoundException('Candidature introuvable');
    if (admission.schoolId !== schoolId) throw new ForbiddenException();
    const klass = admission.classId
      ? await this.prisma.class.findUnique({ where: { id: admission.classId }, select: { id: true, name: true, level: true, capacity: true, _count: { select: { enrollments: { where: { withdrawalDate: null } } } } } })
      : null;
    const { pieces, events, ...rest } = admission;
    return {
      ...rest,
      class: klass ? { id: klass.id, name: klass.name, level: klass.level, capacity: klass.capacity, enrolled: klass._count.enrollments } : null,
      pieces: pieces.map(({ filePath, ...p }) => ({ ...p, hasFile: !!filePath })),
      events: events.map((e) => ({ ...e, data: e.data ? JSON.parse(e.data) : null })),
      transitions: transitionsFor(this.state(admission)),
      fileComplete: isFileComplete(admission),
    };
  }

  /** Classes of the current year with their free seats, for the class assignment. */
  async classOptions(user: AuthUser, id: string) {
    const admission = await this.owned(user, id);
    const classes = await this.prisma.class.findMany({
      where: { schoolId: admission.schoolId, academicYearId: admission.academicYearId },
      select: { id: true, name: true, level: true, capacity: true, _count: { select: { enrollments: { where: { withdrawalDate: null } } } } },
      orderBy: [{ level: 'asc' }, { name: 'asc' }],
    });
    return classes.map((c) => ({
      id: c.id,
      name: c.name,
      level: c.level,
      capacity: c.capacity,
      enrolled: c._count.enrollments,
      free: c.capacity - c._count.enrollments,
      matchesLevel: !admission.requestedLevel || c.level === admission.requestedLevel,
    }));
  }

  // ---------------------------------------------------------------- write

  async update(user: AuthUser, id: string, dto: UpdateAdmissionDto) {
    const admission = await this.owned(user, id);
    if (admission.status === 'CONFIRME') throw new BadRequestException("L'inscription est confirmée : modifiez la fiche de l'élève");
    const data: Record<string, unknown> = {};
    const changed: { field: string; before: unknown; after: unknown }[] = [];
    for (const [key, raw] of Object.entries(dto)) {
      if (raw === undefined) continue;
      const value = key === 'dateOfBirth' ? (raw ? new Date(raw as string) : null) : typeof raw === 'string' ? raw.trim() || (key === 'email' ? '' : null) : raw;
      const before = (admission as Record<string, unknown>)[key];
      const same = before instanceof Date && value instanceof Date ? before.getTime() === value.getTime() : before === value;
      if (same) continue;
      data[key] = value;
      changed.push({ field: FIELD_LABELS[key] ?? key, before: before instanceof Date ? before.toISOString().slice(0, 10) : before, after: value instanceof Date ? value.toISOString().slice(0, 10) : value });
    }
    if (!changed.length) return this.findOne(user, id);
    const actor = await this.actor(user);
    await this.prisma.$transaction(async (tx) => {
      await tx.admission.update({ where: { id }, data });
      await this.log(tx, id, actor, { type: 'UPDATED', title: 'Informations modifiées', message: changed.map((c) => c.field).join(', '), data: { changes: changed } });
    });
    return this.findOne(user, id);
  }

  async addNote(user: AuthUser, id: string, dto: NoteDto) {
    await this.owned(user, id);
    const actor = await this.actor(user);
    await this.log(this.prisma, id, actor, {
      type: dto.kind === 'CONTACT' ? 'CONTACT' : 'NOTE',
      title: dto.kind === 'CONTACT' ? 'Échange avec la famille' : 'Note interne',
      message: dto.message.trim(),
    });
    return this.findOne(user, id);
  }

  /** Moves the application to another step, if the workflow allows it. */
  async transition(user: AuthUser, id: string, to: string, reason?: string, note?: string) {
    const admission = await this.owned(user, id);
    try {
      assertTransition(this.state(admission), to, reason);
    } catch (err) {
      throw new BadRequestException((err as Error).message);
    }
    const actor = await this.actor(user);
    const from = admission.status;
    const target = to as AdmissionStatusName;

    await this.prisma.$transaction(
      async (tx) => {
        const data: Prisma.AdmissionUpdateInput = { status: target as never };
        if (target === 'ADMIS' || target === 'REJETE') {
          data.decidedAt = new Date();
          data.decisionReason = target === 'REJETE' ? reason!.trim() : reason?.trim() || null;
        }
        if (target === 'ETUDE' && from === 'REJETE') data.decisionReason = null;
        if (target === 'INSCRIPTION') {
          const enrolled = await this.enroll(tx, admission, actor);
          data.student = { connect: { id: enrolled.studentId } };
          data.enrolledAt = new Date();
        }
        if (target === 'CONFIRME') data.confirmedAt = new Date();
        await tx.admission.update({ where: { id }, data });
        await this.log(tx, id, actor, {
          type: 'STATUS',
          title: STATUS_LABELS[target],
          fromStatus: from,
          toStatus: target,
          message: [reason?.trim() && (target === 'REJETE' ? `Motif : ${reason.trim()}` : reason.trim()), note?.trim()].filter(Boolean).join(' — ') || null,
        });
      },
      { timeout: 20_000 },
    );
    return this.findOne(user, id);
  }

  /** Creates the student, enrols them in the assigned class and records the guardian. */
  private async enroll(tx: Prisma.TransactionClient, admission: Awaited<ReturnType<AdmissionsService['owned']>>, actor: Actor) {
    const klass = await tx.class.findFirst({
      where: { id: admission.classId!, schoolId: admission.schoolId },
      select: { id: true, name: true, capacity: true, _count: { select: { enrollments: { where: { withdrawalDate: null } } } } },
    });
    if (!klass) throw new BadRequestException("La classe affectée n'existe plus");
    if (klass._count.enrollments >= klass.capacity) throw new BadRequestException(`${klass.name} est complète (${klass.capacity} places) : affectez une autre classe`);

    let studentId = admission.studentId;
    let matricule: string | null = null;
    if (!studentId) {
      matricule = await this.sequences.matricule(tx);
      const student = await tx.student.create({
        data: {
          schoolId: admission.schoolId,
          firstName: admission.firstName,
          lastName: admission.lastName,
          matricule,
          dateOfBirth: admission.dateOfBirth ?? new Date('2010-01-01'),
          gender: admission.gender,
          phone: admission.phone,
          address: admission.address,
        },
      });
      studentId = student.id;
      if (admission.guardianName && (admission.guardianPhone || admission.guardianEmail)) {
        const [firstName, ...rest] = admission.guardianName.trim().split(/\s+/);
        await tx.parent.create({
          data: {
            firstName,
            lastName: rest.join(' ') || admission.lastName,
            email: admission.guardianEmail ?? admission.email ?? '',
            phone: admission.guardianPhone ?? admission.phone ?? '',
            relationship: admission.guardianRelation ?? 'Responsable',
            address: admission.address,
            students: { connect: { id: studentId } },
          },
        });
      }
    }
    await tx.enrollment.upsert({
      where: { classId_studentId: { classId: klass.id, studentId } },
      update: { withdrawalDate: null },
      create: { classId: klass.id, studentId },
    });
    await this.log(tx, admission.id, actor, {
      type: 'ENROLLED',
      title: 'Élève inscrit',
      message: `${matricule ? `Fiche élève créée (matricule ${matricule}), ` : ''}inscription en ${klass.name}${admission.guardianName ? `, responsable : ${admission.guardianName}` : ''}`,
      data: { studentId, matricule, classId: klass.id, className: klass.name },
    });
    return { studentId };
  }

  // ---------------------------------------------------------------- pieces

  /** Marks a piece received, validated or refused; completes the file automatically when possible. */
  async updatePiece(user: AuthUser, id: string, pieceId: string, dto: PieceUpdateDto) {
    const admission = await this.owned(user, id);
    const piece = admission.pieces.find((p) => p.id === pieceId);
    if (!piece) throw new NotFoundException('Pièce introuvable');
    if (dto.status === 'REFUSE' && !dto.note?.trim()) throw new BadRequestException('Indiquez pourquoi la pièce est refusée');
    const actor = await this.actor(user);
    await this.prisma.$transaction(async (tx) => {
      await tx.admissionPiece.update({ where: { id: pieceId }, data: { status: dto.status, note: dto.note?.trim() || null } });
      await this.log(tx, id, actor, {
        type: 'PIECE',
        title: `${piece.label} : ${PIECE_LABELS[dto.status as PieceStatus].toLowerCase()}`,
        message: dto.note?.trim() || null,
        data: { pieceId, before: piece.status, after: dto.status },
      });
      await this.autoComplete(tx, id, actor);
    });
    return this.findOne(user, id);
  }

  async addPiece(user: AuthUser, id: string, dto: AddPieceDto) {
    await this.owned(user, id);
    const actor = await this.actor(user);
    await this.prisma.$transaction(async (tx) => {
      await tx.admissionPiece.create({ data: { admissionId: id, kind: 'AUTRE', label: dto.label.trim(), required: dto.required ?? false } });
      await this.log(tx, id, actor, { type: 'PIECE', title: `Pièce demandée : ${dto.label.trim()}`, message: dto.required ? 'Obligatoire' : 'Facultative' });
    });
    return this.findOne(user, id);
  }

  async uploadPiece(user: AuthUser, id: string, pieceId: string, file: { buffer: Buffer; originalname: string; size: number } | undefined) {
    const admission = await this.owned(user, id);
    const piece = admission.pieces.find((p) => p.id === pieceId);
    if (!piece) throw new NotFoundException('Pièce introuvable');
    if (!file?.buffer?.length) throw new BadRequestException('Aucun fichier reçu');
    if (file.size > MAX_PIECE_BYTES) throw new BadRequestException('Fichier trop lourd (5 Mo maximum)');
    const type = detectDocument(file.buffer);
    if (!type) throw new BadRequestException('Format non accepté : PDF, JPEG ou PNG uniquement');
    const stored = `${randomUUID()}.${type.ext}`;
    await this.storage.put(`${ADMISSION_FILES_PREFIX}/${stored}`, file.buffer, type.mime, { scan: true });
    if (piece.filePath) await this.storage.remove(`${ADMISSION_FILES_PREFIX}/${piece.filePath}`);
    const actor = await this.actor(user);
    const fileName = file.originalname.replace(/[^\w.\- ()À-ÿ]/g, '_').slice(0, 120) || `piece.${type.ext}`;
    await this.prisma.$transaction(async (tx) => {
      await tx.admissionPiece.update({
        where: { id: pieceId },
        data: { filePath: stored, fileName, fileMime: type.mime, status: piece.status === 'MANQUANT' || piece.status === 'REFUSE' ? 'RECU' : piece.status },
      });
      await this.log(tx, id, actor, { type: 'PIECE', title: `${piece.label} : document ajouté`, message: fileName, data: { pieceId, file: fileName } });
      await this.autoComplete(tx, id, actor);
    });
    return this.findOne(user, id);
  }

  async pieceFile(user: AuthUser, id: string, pieceId: string) {
    const admission = await this.owned(user, id);
    const piece = admission.pieces.find((p) => p.id === pieceId);
    if (!piece?.filePath) throw new NotFoundException('Aucun document pour cette pièce');
    const buffer = await this.storage.get(`${ADMISSION_FILES_PREFIX}/${piece.filePath}`).catch(() => {
      throw new NotFoundException('Le fichier est introuvable sur le serveur');
    });
    return { buffer, mime: piece.fileMime ?? 'application/octet-stream', fileName: piece.fileName ?? piece.filePath };
  }

  /** A new application whose required pieces are all in moves to "Dossier complet" by itself. */
  private async autoComplete(tx: Prisma.TransactionClient, id: string, actor: Actor) {
    const a = await tx.admission.findUniqueOrThrow({ where: { id }, include: { pieces: true } });
    if ((a.status === 'CANDIDATURE' || a.status === 'DOSSIER_INCOMPLET') && isFileComplete(a)) {
      await tx.admission.update({ where: { id }, data: { status: 'DOSSIER_COMPLET' } });
      await this.log(tx, id, { userId: null, userName: 'Automatique' }, {
        type: 'STATUS',
        title: STATUS_LABELS.DOSSIER_COMPLET,
        fromStatus: a.status,
        toStatus: 'DOSSIER_COMPLET',
        message: `Toutes les pièces obligatoires sont reçues (dernière pièce enregistrée par ${actor.userName ?? 'un utilisateur'})`,
      });
    }
  }

  // ---------------------------------------------------------------- test, interview, class

  async recordTest(user: AuthUser, id: string, dto: TestDto) {
    const admission = await this.owned(user, id);
    if (dto.score != null && dto.maxScore == null && admission.testMaxScore == null) dto.maxScore = 20;
    const max = dto.maxScore ?? admission.testMaxScore ?? 20;
    if (dto.score != null && dto.score > max) throw new BadRequestException(`La note (${dto.score}) dépasse le barème (${max})`);
    const actor = await this.actor(user);
    const parts: string[] = [];
    if (dto.scheduledAt) parts.push(`convocation le ${new Date(dto.scheduledAt).toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short', timeZone: 'UTC' })}`);
    if (dto.score != null) parts.push(`résultat ${dto.score}/${max}`);
    if (dto.comment?.trim()) parts.push(dto.comment.trim());
    await this.prisma.$transaction(async (tx) => {
      await tx.admission.update({
        where: { id },
        data: {
          ...(dto.scheduledAt ? { testScheduledAt: new Date(dto.scheduledAt) } : {}),
          ...(dto.score != null ? { testScore: dto.score, testMaxScore: max } : dto.maxScore ? { testMaxScore: dto.maxScore } : {}),
        },
      });
      await this.log(tx, id, actor, {
        type: 'TEST',
        title: dto.score != null ? 'Résultat du test enregistré' : 'Test planifié',
        message: parts.join(' · ') || null,
        data: { scheduledAt: dto.scheduledAt ?? null, score: dto.score ?? null, maxScore: max },
      });
    });
    return this.findOne(user, id);
  }

  async recordInterview(user: AuthUser, id: string, dto: InterviewDto) {
    await this.owned(user, id);
    if (dto.done && !dto.notes?.trim()) throw new BadRequestException("Résumez l'entretien avant de l'enregistrer comme réalisé");
    const actor = await this.actor(user);
    await this.prisma.$transaction(async (tx) => {
      await tx.admission.update({
        where: { id },
        data: {
          ...(dto.scheduledAt ? { interviewAt: new Date(dto.scheduledAt) } : {}),
          ...(dto.done !== undefined ? { interviewDone: dto.done } : {}),
          ...(dto.notes !== undefined ? { interviewNotes: dto.notes.trim() || null } : {}),
          ...(dto.opinion ? { interviewOpinion: dto.opinion } : {}),
        },
      });
      await this.log(tx, id, actor, {
        type: 'INTERVIEW',
        title: dto.done ? 'Entretien réalisé' : 'Entretien planifié',
        message:
          [
            dto.scheduledAt && `le ${new Date(dto.scheduledAt).toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short', timeZone: 'UTC' })}`,
            dto.opinion && `avis ${OPINIONS[dto.opinion]}`,
            dto.notes?.trim(),
          ]
            .filter(Boolean)
            .join(' · ') || null,
        data: { scheduledAt: dto.scheduledAt ?? null, opinion: dto.opinion ?? null },
      });
    });
    return this.findOne(user, id);
  }

  async assignClass(user: AuthUser, id: string, dto: AssignClassDto) {
    const admission = await this.owned(user, id);
    if (['INSCRIPTION', 'CONFIRME'].includes(admission.status)) throw new BadRequestException("L'élève est déjà inscrit : changez sa classe depuis le module Classes");
    const klass = await this.prisma.class.findFirst({
      where: { id: dto.classId, schoolId: admission.schoolId, academicYearId: admission.academicYearId },
      select: { id: true, name: true, level: true, capacity: true, _count: { select: { enrollments: { where: { withdrawalDate: null } } } } },
    });
    if (!klass) throw new NotFoundException('Classe introuvable pour cette année scolaire');
    if (klass._count.enrollments >= klass.capacity) throw new BadRequestException(`${klass.name} est complète (${klass.capacity} places)`);
    const actor = await this.actor(user);
    await this.prisma.$transaction(async (tx) => {
      await tx.admission.update({ where: { id }, data: { classId: klass.id } });
      await this.log(tx, id, actor, {
        type: 'CLASS',
        title: `Classe affectée : ${klass.name}`,
        message: `${klass.capacity - klass._count.enrollments - 1} place(s) restante(s) après cette affectation${admission.requestedLevel && admission.requestedLevel !== klass.level ? ` · niveau demandé : ${admission.requestedLevel}` : ''}`,
        data: { classId: klass.id },
      });
    });
    return this.findOne(user, id);
  }

  /** Former endpoint (PATCH :id/status): same rules as a transition. */
  updateStatus(user: AuthUser, id: string, status: string, reason?: string) {
    return this.transition(user, id, status, reason);
  }
}

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/current-user.decorator';
import { StorageService } from '../infra/storage.service';
import { TokenService } from '../auth/token.service';

const ANONYMOUS = 'Anonymisé';

/**
 * Personal data rights (loi ivoirienne n° 2013-450, ARTCI): access (export of everything held on a
 * pupil), erasure (anonymisation: identity removed, marks and accounts kept without a name) and
 * retention (archived files older than the school's retention period are listed for anonymisation).
 */
@Injectable()
export class PrivacyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly tokens: TokenService,
  ) {}

  private school(user: AuthUser) {
    if (!user.schoolId) throw new BadRequestException("L'utilisateur n'est rattaché à aucun établissement");
    return user.schoolId;
  }

  async settings(user: AuthUser) {
    const schoolId = this.school(user);
    const school = await this.prisma.school.findUniqueOrThrow({ where: { id: schoolId }, select: { dataRetentionYears: true, privacyContact: true, email: true } });
    const [archived, anonymized, due] = await Promise.all([
      this.prisma.student.count({ where: { schoolId, archivedAt: { not: null }, anonymizedAt: null } }),
      this.prisma.student.count({ where: { schoolId, anonymizedAt: { not: null } } }),
      this.prisma.student.count({ where: { schoolId, anonymizedAt: null, archivedAt: { lt: this.cutoff(school.dataRetentionYears) } } }),
    ]);
    return { retentionYears: school.dataRetentionYears, privacyContact: school.privacyContact ?? school.email, archived, anonymized, due, encryption: this.prisma.encryptionActive };
  }

  async updateSettings(user: AuthUser, dto: { retentionYears?: number; privacyContact?: string }) {
    await this.prisma.school.update({
      where: { id: this.school(user) },
      data: {
        ...(dto.retentionYears !== undefined ? { dataRetentionYears: dto.retentionYears } : {}),
        ...(dto.privacyContact !== undefined ? { privacyContact: dto.privacyContact.trim() || null } : {}),
      },
    });
    return this.settings(user);
  }

  private cutoff(years: number, now = new Date()) {
    const d = new Date(now);
    d.setFullYear(d.getFullYear() - years);
    return d;
  }

  /** Archived pupils; `dueOnly` keeps those past the retention period. */
  async archivedStudents(user: AuthUser, dueOnly: boolean) {
    const schoolId = this.school(user);
    const school = await this.prisma.school.findUniqueOrThrow({ where: { id: schoolId }, select: { dataRetentionYears: true } });
    const cutoff = this.cutoff(school.dataRetentionYears);
    const rows = await this.prisma.student.findMany({
      where: { schoolId, anonymizedAt: null, archivedAt: dueOnly ? { lt: cutoff } : { not: null } },
      select: { id: true, firstName: true, lastName: true, matricule: true, archivedAt: true, archiveReason: true },
      orderBy: { archivedAt: 'asc' },
      take: 500,
    });
    return rows.map((s) => ({ ...s, due: !!s.archivedAt && s.archivedAt < cutoff }));
  }

  private async owned(user: AuthUser, studentId: string) {
    const student = await this.prisma.student.findUnique({ where: { id: studentId } });
    if (!student || student.schoolId !== this.school(user)) throw new NotFoundException('Élève introuvable');
    return student;
  }

  /** Everything the school holds about a pupil and their guardians, as one document (right of access). */
  async exportStudent(user: AuthUser, studentId: string) {
    await this.owned(user, studentId);
    const student = await this.prisma.student.findUniqueOrThrow({
      where: { id: studentId },
      include: {
        school: { select: { name: true, email: true, privacyContact: true } },
        parents: { select: { firstName: true, lastName: true, email: true, phone: true, relationship: true, profession: true, address: true, smsOptOut: true, createdAt: true } },
        enrollments: { include: { class: { select: { name: true, level: true } } } },
        attendance: { select: { date: true, status: true, reason: true, isJustified: true, justification: true }, orderBy: { date: 'asc' } },
        grades: { select: { score: true, maxScore: true, createdAt: true, subject: { select: { name: true } }, term: { select: { name: true } } }, orderBy: { createdAt: 'asc' } },
        invoices: { select: { reference: true, label: true, totalAmount: true, status: true, dueDate: true, payments: { select: { amount: true, method: true, status: true, paidAt: true, payerPhone: true } } }, orderBy: { createdAt: 'asc' } },
        documents: { select: { name: true, type: true } },
        disciplineRecords: { select: { date: true, kind: true, reason: true, description: true, sanction: true, reportedByName: true }, orderBy: { date: 'asc' } },
        reportCards: { select: { councilAppreciation: true, decision: true, term: { select: { name: true } } } },
        transportSubscriptions: true,
        admissions: {
          select: {
            reference: true, source: true, status: true, submittedAt: true, consentAt: true, requestedLevel: true, previousSchool: true, guardianName: true, guardianPhone: true, guardianEmail: true,
            testScore: true, testMaxScore: true, interviewNotes: true, interviewOpinion: true, decisionReason: true,
            pieces: { select: { label: true, status: true, fileName: true } },
            events: { select: { createdAt: true, title: true, message: true, userName: true }, orderBy: { createdAt: 'asc' } },
          },
        },
      },
    });
    const messages = await this.prisma.messageLog.findMany({ where: { studentId }, select: { createdAt: true, channel: true, to: true, event: true, body: true, status: true }, orderBy: { createdAt: 'asc' } });
    const { school, schoolId: _schoolId, id: _id, ...data } = student;
    void _schoolId;
    void _id;
    return {
      document: 'Export des données personnelles',
      generatedAt: new Date().toISOString(),
      school: school.name,
      contact: school.privacyContact ?? school.email,
      legalBasis: "Loi n° 2013-450 du 19 juin 2013 relative à la protection des données à caractère personnel (Côte d'Ivoire) — droit d'accès",
      student: data,
      messagesSent: messages,
    };
  }

  /**
   * Erases the identity of an archived pupil. Marks, attendance and invoices stay (statistics and
   * accounting obligations) but can no longer be linked to a person. Guardians with no other child
   * are erased too, their account is closed and the admission documents are deleted.
   */
  async anonymizeStudent(user: AuthUser, studentId: string, reason: string) {
    const student = await this.owned(user, studentId);
    if (student.anonymizedAt) throw new BadRequestException('Ce dossier est déjà anonymisé');
    if (!student.archivedAt) throw new BadRequestException("Archivez d'abord l'élève : seul un dossier archivé peut être anonymisé");

    const parents = await this.prisma.parent.findMany({ where: { students: { some: { id: studentId } } }, include: { students: { select: { id: true, anonymizedAt: true } } } });
    const orphanParents = parents.filter((p) => p.students.every((s) => s.id === studentId || s.anonymizedAt));
    const admissions = await this.prisma.admission.findMany({ where: { studentId }, include: { pieces: true } });
    const files = admissions.flatMap((a) => a.pieces.map((p) => p.filePath).filter((f): f is string => !!f));
    const tag = student.id.slice(-8).toUpperCase();

    await this.prisma.$transaction(async (tx) => {
      await tx.student.update({
        where: { id: studentId },
        data: {
          firstName: 'Élève',
          lastName: `${ANONYMOUS} ${tag}`,
          dateOfBirth: new Date(Date.UTC(student.dateOfBirth.getUTCFullYear(), 0, 1)),
          nationality: null,
          placeOfBirth: null,
          address: null,
          phone: null,
          allergies: null,
          specialNeeds: null,
          anonymizedAt: new Date(),
          archiveReason: `Anonymisé : ${reason.trim()}`.slice(0, 300),
          parents: { set: [] },
        },
      });
      for (const parent of orphanParents) {
        await tx.parent.update({
          where: { id: parent.id },
          data: { firstName: 'Responsable', lastName: ANONYMOUS, email: `anonyme-${parent.id}@invalid`, phone: '', profession: null, address: null, smsOptOut: true, archivedAt: parent.archivedAt ?? new Date(), userId: null },
        });
        if (parent.userId) await tx.user.delete({ where: { id: parent.userId } });
      }
      for (const admission of admissions) {
        await tx.admissionPiece.updateMany({ where: { admissionId: admission.id }, data: { filePath: null, fileName: null, fileMime: null } });
        await tx.admissionEvent.updateMany({ where: { admissionId: admission.id }, data: { message: null, data: null } });
        await tx.admission.update({
          where: { id: admission.id },
          data: {
            firstName: 'Élève', lastName: `${ANONYMOUS} ${tag}`, email: `anonyme-${admission.id}@invalid`, phone: null, dateOfBirth: null, address: null, previousSchool: null,
            guardianName: null, guardianPhone: null, guardianEmail: null, guardianRelation: null, interviewNotes: null, decisionReason: null,
          },
        });
      }
      await tx.document.deleteMany({ where: { studentId } });
      // Free text about the pupil's behaviour has no accounting or statistical use once anonymised.
      await tx.disciplineRecord.deleteMany({ where: { studentId } });
      await tx.reportCard.updateMany({ where: { studentId }, data: { councilAppreciation: null, appreciations: {} } });
      await tx.messageLog.updateMany({ where: { studentId }, data: { to: '—', body: '[message supprimé]' } });
      await tx.payment.updateMany({ where: { studentId }, data: { payerPhone: null } });
      await tx.attendance.updateMany({ where: { studentId }, data: { reason: null, justification: null } });
      // The audit journal keeps who did what and when, without the personal details of the erased file.
      await tx.auditLog.updateMany({
        where: { resourceId: { in: [studentId, ...orphanParents.map((p) => p.id), ...admissions.map((a) => a.id)] } },
        data: { oldValues: null, newValues: null },
      });
    });

    for (const parent of orphanParents) if (parent.userId) await this.tokens.forget(parent.userId).catch(() => undefined);
    for (const file of files) await this.storage.remove(`.admissions/${file}`);
    return { success: true, guardiansErased: orphanParents.length, filesDeleted: files.length };
  }
}

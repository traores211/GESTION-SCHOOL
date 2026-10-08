import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/current-user.decorator';
import { BulletinsService } from '../bulletins/bulletins.service';
import { Outcome, canMoveYear, canonicalLevel, classCode, isLastLevel, nextClassName, nextLevel, proposedOutcome, yearIsFrozen } from './promotion-rules';

export interface DecisionInput {
  studentId: string;
  outcome: Outcome;
  /** Class of the next year; required for ORIENTE, optional otherwise (the usual class is used) */
  toClassId?: string;
}

export interface Target {
  /** Existing class of the next year, or null when it has to be created */
  id: string | null;
  name: string;
  level: string;
  code: string;
}

/**
 * School year life cycle and end-of-year promotion. The promotion is always shown first (plan), then
 * executed on confirmation in one transaction. Past enrolments are kept: a pupil's history of classes
 * is the list of his enrolments, each with its outcome.
 */
@Injectable()
export class PromotionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bulletins: BulletinsService,
  ) {}

  private school(user: AuthUser) {
    if (!user.schoolId) throw new BadRequestException("L'utilisateur n'est rattaché à aucun établissement");
    return user.schoolId;
  }

  // ---------------------------------------------------------------- school years

  async setYearStatus(user: AuthUser, id: string, status: string) {
    const schoolId = this.school(user);
    const year = await this.prisma.academicYear.findFirst({ where: { id, schoolId } });
    if (!year) throw new NotFoundException('Année scolaire introuvable');
    if (year.status === status) return year;
    if (!canMoveYear(year.status, status)) throw new BadRequestException(`Une année « ${year.status} » ne peut pas passer à « ${status} »`);
    if (status === 'CLOTUREE' && year.isCurrent) {
      const other = await this.prisma.academicYear.count({ where: { schoolId, id: { not: id }, status: 'OUVERTE' } });
      if (!other) throw new BadRequestException("Ouvrez d'abord l'année suivante : l'établissement doit garder une année en cours");
    }
    return this.prisma.academicYear.update({ where: { id }, data: { status, closedAt: status === 'CLOTUREE' ? new Date() : status === 'OUVERTE' ? null : year.closedAt } });
  }

  // ---------------------------------------------------------------- promotion

  private async context(user: AuthUser, classId: string, toYearId: string) {
    const schoolId = this.school(user);
    const klass = await this.prisma.class.findFirst({
      where: { id: classId, schoolId },
      include: { academicYear: { include: { terms: { orderBy: { order: 'asc' } } } }, enrollments: { where: { withdrawalDate: null, student: { archivedAt: null } }, select: { studentId: true } } },
    });
    if (!klass) throw new NotFoundException('Classe introuvable');
    const toYear = await this.prisma.academicYear.findFirst({ where: { id: toYearId, schoolId } });
    if (!toYear) throw new NotFoundException("Année scolaire d'arrivée introuvable");
    if (toYear.id === klass.academicYearId) throw new BadRequestException("L'année d'arrivée doit être différente de l'année de la classe");
    if (toYear.startDate <= klass.academicYear.startDate) throw new BadRequestException("L'année d'arrivée doit suivre l'année de la classe");
    if (yearIsFrozen(toYear.status)) throw new BadRequestException("L'année d'arrivée est clôturée");
    const classes = await this.prisma.class.findMany({ where: { schoolId, academicYearId: toYear.id, archivedAt: null }, select: { id: true, name: true, level: true, code: true } });
    return { schoolId, klass, toYear, classes };
  }

  /** The class of the next year for a pupil who moves up, and the one for a pupil who repeats. */
  private targets(klass: { name: string; level: string }, classes: { id: string; name: string; level: string; code: string }[]) {
    const find = (name: string): Target['id'] => classes.find((c) => c.name.trim().toLowerCase() === name.trim().toLowerCase())?.id ?? null;
    const upName = nextClassName(klass.name, klass.level);
    const upLevel = nextLevel(klass.level);
    const up: Target | null = upName && upLevel ? { id: find(upName), name: upName, level: upLevel, code: classCode(upName) } : null;
    const same: Target = { id: find(klass.name), name: klass.name, level: canonicalLevel(klass.level) ?? klass.level, code: classCode(klass.name) };
    return { up, same };
  }

  /** What the management sees before deciding: each pupil with his results and the proposed outcome. */
  async preview(user: AuthUser, classId: string, toYearId: string) {
    const { klass, toYear, classes } = await this.context(user, classId, toYearId);
    const terms = klass.academicYear.terms;
    const sheet = terms.length ? await this.bulletins.classSheet(user, classId, terms[terms.length - 1].id) : null;
    const already = await this.prisma.enrollment.findMany({
      where: { studentId: { in: klass.enrollments.map((e) => e.studentId) }, class: { academicYearId: toYear.id } },
      select: { studentId: true, class: { select: { name: true } } },
    });
    const { up, same } = this.targets(klass, classes);
    const students = (sheet?.students ?? []).map((s) => {
      const done = already.find((a) => a.studentId === s.id);
      return {
        id: s.id,
        matricule: s.matricule,
        firstName: s.firstName,
        lastName: s.lastName,
        annualAverage: s.annualAverage,
        councilDecision: s.decision,
        proposed: proposedOutcome({ councilDecision: s.decision, annualAverage: s.annualAverage, level: klass.level }),
        alreadyIn: done?.class.name ?? null,
      };
    });
    return {
      class: { id: klass.id, name: klass.name, level: klass.level, year: klass.academicYear.name },
      toYear: { id: toYear.id, name: toYear.name },
      lastLevel: isLastLevel(klass.level) || !up,
      targets: { up, same },
      classes: classes.map((c) => ({ id: c.id, name: c.name, level: c.level })),
      students,
    };
  }

  /**
   * Checks the decisions and says what will happen (plan); with `confirm` the same plan is executed.
   * Pupils already enrolled in the next year are left untouched, so a second run is harmless.
   */
  async run(user: AuthUser, classId: string, toYearId: string, decisions: DecisionInput[], confirm: boolean) {
    const { schoolId, klass, toYear, classes } = await this.context(user, classId, toYearId);
    const inClass = new Set(klass.enrollments.map((e) => e.studentId));
    const outsiders = decisions.filter((d) => !inClass.has(d.studentId));
    if (outsiders.length) throw new BadRequestException(`${outsiders.length} élève(s) ne font pas partie de ${klass.name}`);
    if (new Set(decisions.map((d) => d.studentId)).size !== decisions.length) throw new BadRequestException('Un élève apparaît deux fois');
    const { up, same } = this.targets(klass, classes);
    const chosen = new Map(classes.map((c) => [c.id, c]));
    const already = new Set(
      (await this.prisma.enrollment.findMany({ where: { studentId: { in: decisions.map((d) => d.studentId) }, class: { academicYearId: toYear.id } }, select: { studentId: true } })).map((e) => e.studentId),
    );

    const moves: { studentId: string; outcome: Outcome; target: Target | null; skipped: boolean }[] = [];
    for (const d of decisions) {
      let target: Target | null = null;
      if (d.outcome !== 'SORTANT') {
        if (d.toClassId) {
          const c = chosen.get(d.toClassId);
          if (!c) throw new BadRequestException(`La classe d'arrivée choisie n'existe pas en ${toYear.name}`);
          target = { id: c.id, name: c.name, level: c.level, code: c.code };
        } else if (d.outcome === 'ADMIS') {
          if (!up) throw new BadRequestException(`${klass.name} est le dernier niveau : les élèves admis sont sortants`);
          target = up;
        } else if (d.outcome === 'REDOUBLE') target = same;
        else throw new BadRequestException("Choisissez la classe d'arrivée des élèves orientés");
      }
      moves.push({ studentId: d.studentId, outcome: d.outcome, target, skipped: already.has(d.studentId) });
    }

    const toCreate = [...new Map(moves.filter((m) => !m.skipped && m.target && !m.target.id).map((m) => [m.target!.name, m.target!])).values()];
    const count = (o: Outcome) => moves.filter((m) => !m.skipped && m.outcome === o).length;
    const summary = {
      from: klass.name,
      toYear: toYear.name,
      admitted: count('ADMIS'),
      repeating: count('REDOUBLE'),
      oriented: count('ORIENTE'),
      leaving: count('SORTANT'),
      skipped: moves.filter((m) => m.skipped).length,
      undecided: inClass.size - decisions.length,
      classesToCreate: toCreate.map((t) => t.name),
      destinations: [...new Set(moves.filter((m) => !m.skipped && m.target).map((m) => m.target!.name))],
    };
    if (!confirm) return { executed: false, summary };

    const author = await this.prisma.user.findUnique({ where: { id: user.userId }, select: { firstName: true, lastName: true } });
    const now = new Date();
    try {
      await this.prisma.$transaction(async (tx) => {
        const created = new Map<string, string>();
        for (const t of toCreate) {
          // The code must be free in the next year; a suffix is added when it is taken
          let code = t.code;
          for (let i = 2; await tx.class.findUnique({ where: { academicYearId_code: { academicYearId: toYear.id, code } } }); i++) code = `${t.code}-${i}`;
          const c = await tx.class.create({ data: { schoolId, academicYearId: toYear.id, name: t.name, level: t.level, code, capacity: klass.capacity, series: klass.series } });
          created.set(t.name, c.id);
        }
        for (const m of moves.filter((x) => !x.skipped)) {
          await tx.enrollment.update({ where: { classId_studentId: { classId: klass.id, studentId: m.studentId } }, data: { outcome: m.outcome, outcomeAt: now } });
          if (m.target) {
            const toClassId = m.target.id ?? created.get(m.target.name)!;
            await tx.enrollment.upsert({ where: { classId_studentId: { classId: toClassId, studentId: m.studentId } }, create: { classId: toClassId, studentId: m.studentId, enrollmentDate: now }, update: { withdrawalDate: null } });
            await tx.student.update({ where: { id: m.studentId }, data: { status: m.outcome === 'REDOUBLE' ? 'REDOUBLANT' : 'INSCRIT' } });
          } else {
            // Leaving pupils keep their whole record; they simply have no class in the next year
            await tx.student.update({ where: { id: m.studentId }, data: { status: isLastLevel(klass.level) ? 'DIPLOME' : 'RETIRE' } });
          }
        }
        await tx.promotionBatch.create({
          data: { schoolId, fromClassId: klass.id, toYearId: toYear.id, decisions: decisions as unknown as Prisma.InputJsonValue, summary: summary as unknown as Prisma.InputJsonValue, executedById: user.userId, executedByName: author ? `${author.firstName} ${author.lastName}` : null },
        });
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') throw new ConflictException('Une classe du même code existe déjà : relancez le passage');
      throw err;
    }
    return { executed: true, summary };
  }

  /**
   * Re-enrolment of a pupil already known to the school, one at a time: a pupil who was undecided at
   * the promotion, or who left and comes back. His record is reused as it is (and restored if archived).
   */
  async reenrol(user: AuthUser, studentId: string, classId: string) {
    const schoolId = this.school(user);
    const [student, klass] = await Promise.all([
      this.prisma.student.findFirst({ where: { id: studentId, schoolId } }),
      this.prisma.class.findFirst({ where: { id: classId, schoolId }, include: { academicYear: true } }),
    ]);
    if (!student) throw new NotFoundException('Élève introuvable');
    if (student.anonymizedAt) throw new BadRequestException("Ce dossier a été anonymisé : créez une nouvelle inscription");
    if (!klass) throw new NotFoundException('Classe introuvable');
    if (klass.archivedAt) throw new BadRequestException('Cette classe est archivée');
    if (yearIsFrozen(klass.academicYear.status)) throw new BadRequestException(`L'année ${klass.academicYear.name} est clôturée`);
    const existing = await this.prisma.enrollment.findFirst({ where: { studentId, withdrawalDate: null, class: { academicYearId: klass.academicYearId } }, include: { class: { select: { name: true } } } });
    if (existing) throw new ConflictException(`Cet élève est déjà inscrit en ${existing.class.name} pour ${klass.academicYear.name}`);
    const size = await this.prisma.enrollment.count({ where: { classId, withdrawalDate: null } });
    if (size >= klass.capacity) throw new BadRequestException(`${klass.name} est complète (${klass.capacity} places)`);
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.enrollment.upsert({ where: { classId_studentId: { classId, studentId } }, create: { classId, studentId, enrollmentDate: now }, update: { withdrawalDate: null, outcome: null, outcomeAt: null, enrollmentDate: now } }),
      this.prisma.student.update({ where: { id: studentId }, data: { status: 'INSCRIT', archivedAt: null, archiveReason: null } }),
    ]);
    return { studentId, class: klass.name, year: klass.academicYear.name, restored: !!student.archivedAt };
  }

  history(user: AuthUser) {
    return this.prisma.promotionBatch.findMany({ where: { schoolId: this.school(user) }, orderBy: { executedAt: 'desc' }, take: 100, select: { id: true, fromClassId: true, toYearId: true, summary: true, executedByName: true, executedAt: true } });
  }

  /** The classes a pupil went through, year by year, with the outcome of each year. */
  async studentHistory(user: AuthUser, studentId: string) {
    const student = await this.prisma.student.findFirst({ where: { id: studentId, schoolId: this.school(user) }, select: { id: true } });
    if (!student) throw new NotFoundException('Élève introuvable');
    const rows = await this.prisma.enrollment.findMany({
      where: { studentId },
      select: { enrollmentDate: true, withdrawalDate: true, outcome: true, class: { select: { id: true, name: true, level: true, academicYear: { select: { name: true, startDate: true } } } } },
    });
    return rows
      .sort((a, b) => a.class.academicYear.startDate.getTime() - b.class.academicYear.startDate.getTime())
      .map((r) => ({ year: r.class.academicYear.name, classId: r.class.id, class: r.class.name, level: r.class.level, enrolledAt: r.enrollmentDate, leftAt: r.withdrawalDate, outcome: r.outcome }));
  }
}

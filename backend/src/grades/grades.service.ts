import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TeacherScopeService } from '../common/teacher-scope.service';
import { AuthUser } from '../common/current-user.decorator';
import { EnterGradesDto } from './dto/enter-grades.dto';
import { classAverages, generalAverage, rankLabel, ranks, subjectAverage } from './grade-math';
import { assertYearOpen } from '../common/year-guard';
import { NotificationsService } from '../notifications/notifications.service';
import { PUBLIC_USER } from '../common/sensitive-fields.interceptor';

@Injectable()
export class GradesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: TeacherScopeService,
    private readonly notifications: NotificationsService,
  ) {}

  async enter(user: AuthUser, dto: EnterGradesDto) {
    const klass = await this.prisma.class.findUnique({ where: { id: dto.classId } });
    if (!klass || klass.schoolId !== user.schoolId) throw new NotFoundException('Classe introuvable');

    await this.scope.assertSubject(user, dto.classId, dto.subjectId);
    await assertYearOpen(this.prisma, klass.academicYearId);

    const maxScore = dto.maxScore ?? 20;
    // Every reference must belong to this class and school: no mark for a pupil of another class,
    // a subject of another school or a term of another year.
    const [term, subject, enrolled] = await Promise.all([
      this.prisma.term.findFirst({ where: { id: dto.termId, academicYearId: klass.academicYearId } }),
      this.prisma.subject.findFirst({ where: { id: dto.subjectId, schoolId: klass.schoolId } }),
      this.prisma.enrollment.findMany({ where: { classId: klass.id, withdrawalDate: null }, select: { studentId: true } }),
    ]);
    if (!term) throw new BadRequestException("Cette période n'appartient pas à l'année scolaire de la classe");
    if (!subject) throw new NotFoundException('Matière introuvable');
    const inClass = new Set(enrolled.map((e) => e.studentId));
    const outsiders = dto.records.filter((r) => !inClass.has(r.studentId));
    if (outsiders.length) throw new BadRequestException(`${outsiders.length} élève(s) ne sont pas inscrits dans ${klass.name}`);
    const overScale = dto.records.find((r) => r.score > maxScore);
    if (overScale) throw new BadRequestException(`Une note (${overScale.score}) dépasse le barème (${maxScore})`);
    if (new Set(dto.records.map((r) => r.studentId)).size !== dto.records.length) throw new BadRequestException('Un élève apparaît deux fois dans la saisie');

    const results = await this.prisma.$transaction(
      dto.records.map((record) =>
        this.prisma.grade.create({
          data: {
            studentId: record.studentId,
            subjectId: dto.subjectId,
            classId: dto.classId,
            termId: dto.termId,
            type: dto.type as any,
            score: record.score,
            maxScore,
            comment: record.comment,
            enteredById: user.userId,
          },
        }),
      ),
    );

    // The guardians who have an account are told of the new mark; a problem here never undoes the entry
    await this.notifyNewMarks(dto.records, subject.name, maxScore).catch(() => undefined);

    return results;
  }

  private async notifyNewMarks(records: { studentId: string; score: number }[], subject: string, maxScore: number) {
    const students = await this.prisma.student.findMany({
      where: { id: { in: records.map((r) => r.studentId) } },
      select: { id: true, firstName: true, parents: { where: { archivedAt: null, userId: { not: null } }, select: { userId: true } } },
    });
    for (const record of records) {
      const student = students.find((s) => s.id === record.studentId);
      for (const parent of student?.parents ?? []) {
        await this.notifications.notify(parent.userId, 'Nouvelle note', `${student!.firstName} a obtenu ${String(record.score).replace('.', ',')}/${maxScore} en ${subject}.`);
      }
    }
  }

  async findByClass(user: AuthUser, classId: string, termId?: string, subjectId?: string) {
    const klass = await this.prisma.class.findUnique({ where: { id: classId } });
    if (!klass || klass.schoolId !== user.schoolId) throw new ForbiddenException();
    await this.scope.assertClass(user, classId);

    return this.prisma.grade.findMany({
      where: { classId, ...(termId ? { termId } : {}), ...(subjectId ? { subjectId } : {}) },
      include: { student: true, subject: true, term: true },
      orderBy: [{ student: { lastName: 'asc' } }, { createdAt: 'desc' }],
    });
  }

  async findByStudent(user: AuthUser, studentId: string, termId?: string) {
    const student = await this.prisma.student.findUnique({ where: { id: studentId } });
    if (!student || student.schoolId !== user.schoolId) throw new ForbiddenException();
    await this.scope.assertStudent(user, studentId);

    return this.prisma.grade.findMany({
      where: { studentId, ...(termId ? { termId } : {}) },
      include: { subject: true, term: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Weighted average per subject, overall weighted average, and class rank for a student in a term. */
  async computeBulletin(user: AuthUser, studentId: string, termId: string) {
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      // The class the pupil was in during the year of that term (he may have moved up since)
      include: { school: true, enrollments: { where: { withdrawalDate: null, class: { academicYear: { terms: { some: { id: termId } } } } }, include: { class: true }, take: 1 } },
    });
    if (!student || student.schoolId !== user.schoolId) throw new NotFoundException('Élève introuvable');
    await this.scope.assertStudent(user, studentId);

    const enrollment = student.enrollments[0];
    if (!enrollment) throw new BadRequestException("L'élève n'est inscrit dans aucune classe pour cette période");

    const term = await this.prisma.term.findFirst({ where: { id: termId, academicYearId: enrollment.class.academicYearId } });
    if (!term) throw new NotFoundException('Période introuvable');

    const classSubjects = await this.prisma.classSubject.findMany({
      where: { classId: enrollment.classId },
      include: { subject: true, teacher: { include: { user: PUBLIC_USER } } },
    });

    const allGrades = await this.prisma.grade.findMany({
      where: { classId: enrollment.classId, termId },
      include: { student: true },
    });

    const subjectRows = classSubjects.map((cs) => {
      const subjectGrades = allGrades.filter((g) => g.subjectId === cs.subjectId && g.studentId === studentId);
      return {
        subject: cs.subject.name,
        coefficient: cs.coefficient,
        teacher: cs.teacher ? `${cs.teacher.user.firstName} ${cs.teacher.user.lastName}` : null,
        average: subjectAverage(subjectGrades),
        gradeCount: subjectGrades.length,
      };
    });
    const overallAverage = generalAverage(subjectRows);

    // Class rank with ties ("2e ex æquo"); pupils without any mark are not ranked.
    const averages = classAverages(allGrades, new Map(classSubjects.map((cs) => [cs.subjectId, cs.coefficient])));
    const classRanks = ranks(averages);
    const mine = classRanks.get(studentId);
    const ranked = [...averages.values()].filter((a): a is number => a !== null);

    return {
      student: { id: student.id, firstName: student.firstName, lastName: student.lastName, matricule: student.matricule },
      school: student.school.name,
      class: enrollment.class.name,
      term: term.name,
      subjects: subjectRows,
      overallAverage,
      rank: mine?.rank ?? null,
      rankLabel: rankLabel(mine),
      classSize: classRanks.size,
      classAverage: ranked.length ? ranked.reduce((s, a) => s + a, 0) / ranked.length : null,
      bestAverage: ranked.length ? Math.max(...ranked) : null,
      lowestAverage: ranked.length ? Math.min(...ranked) : null,
    };
  }
}

import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/current-user.decorator';
import { EnterGradesDto } from './dto/enter-grades.dto';

@Injectable()
export class GradesService {
  constructor(private readonly prisma: PrismaService) {}

  async enter(user: AuthUser, dto: EnterGradesDto) {
    const klass = await this.prisma.class.findUnique({ where: { id: dto.classId } });
    if (!klass || klass.schoolId !== user.schoolId) throw new NotFoundException('Classe introuvable');

    const maxScore = dto.maxScore ?? 20;

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

    return results;
  }

  async findByClass(user: AuthUser, classId: string, termId?: string, subjectId?: string) {
    const klass = await this.prisma.class.findUnique({ where: { id: classId } });
    if (!klass || klass.schoolId !== user.schoolId) throw new ForbiddenException();

    return this.prisma.grade.findMany({
      where: { classId, ...(termId ? { termId } : {}), ...(subjectId ? { subjectId } : {}) },
      include: { student: true, subject: true, term: true },
      orderBy: [{ student: { lastName: 'asc' } }, { createdAt: 'desc' }],
    });
  }

  async findByStudent(user: AuthUser, studentId: string, termId?: string) {
    const student = await this.prisma.student.findUnique({ where: { id: studentId } });
    if (!student || student.schoolId !== user.schoolId) throw new ForbiddenException();

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
      include: { school: true, enrollments: { where: { withdrawalDate: null }, include: { class: true }, take: 1 } },
    });
    if (!student || student.schoolId !== user.schoolId) throw new NotFoundException('Élève introuvable');

    const enrollment = student.enrollments[0];
    if (!enrollment) throw new BadRequestException("L'élève n'est inscrit dans aucune classe");

    const term = await this.prisma.term.findUnique({ where: { id: termId } });
    if (!term) throw new NotFoundException('Période introuvable');

    const classSubjects = await this.prisma.classSubject.findMany({
      where: { classId: enrollment.classId },
      include: { subject: true, teacher: { include: { user: true } } },
    });

    const allGrades = await this.prisma.grade.findMany({
      where: { classId: enrollment.classId, termId },
      include: { student: true },
    });

    const subjectRows = classSubjects.map((cs) => {
      const subjectGrades = allGrades.filter((g) => g.subjectId === cs.subjectId && g.studentId === studentId);
      const weightedSum = subjectGrades.reduce((sum, g) => sum + (g.score / g.maxScore) * 20 * g.coefficient, 0);
      const weightTotal = subjectGrades.reduce((sum, g) => sum + g.coefficient, 0);
      const average = weightTotal > 0 ? weightedSum / weightTotal : null;
      return {
        subject: cs.subject.name,
        coefficient: cs.coefficient,
        teacher: cs.teacher ? `${cs.teacher.user.firstName} ${cs.teacher.user.lastName}` : null,
        average,
        gradeCount: subjectGrades.length,
      };
    });

    const gradedSubjects = subjectRows.filter((r) => r.average !== null);
    const overallWeightedSum = gradedSubjects.reduce((sum, r) => sum + (r.average as number) * r.coefficient, 0);
    const overallCoeffTotal = gradedSubjects.reduce((sum, r) => sum + r.coefficient, 0);
    const overallAverage = overallCoeffTotal > 0 ? overallWeightedSum / overallCoeffTotal : null;

    // Class rank
    const studentIds = [...new Set(allGrades.map((g) => g.studentId))];
    const classAverages = studentIds.map((sid) => {
      const rows = classSubjects.map((cs) => {
        const grades = allGrades.filter((g) => g.subjectId === cs.subjectId && g.studentId === sid);
        const weightedSum = grades.reduce((sum, g) => sum + (g.score / g.maxScore) * 20 * g.coefficient, 0);
        const weightTotal = grades.reduce((sum, g) => sum + g.coefficient, 0);
        return weightTotal > 0 ? { average: weightedSum / weightTotal, coefficient: cs.coefficient } : null;
      }).filter((r): r is { average: number; coefficient: number } => r !== null);
      const sum = rows.reduce((s, r) => s + r.average * r.coefficient, 0);
      const coeff = rows.reduce((s, r) => s + r.coefficient, 0);
      return { studentId: sid, average: coeff > 0 ? sum / coeff : 0 };
    });
    classAverages.sort((a, b) => b.average - a.average);
    const rank = classAverages.findIndex((r) => r.studentId === studentId) + 1;

    return {
      student: { id: student.id, firstName: student.firstName, lastName: student.lastName, matricule: student.matricule },
      school: student.school.name,
      class: enrollment.class.name,
      term: term.name,
      subjects: subjectRows,
      overallAverage,
      rank: rank || null,
      classSize: classAverages.length,
    };
  }
}

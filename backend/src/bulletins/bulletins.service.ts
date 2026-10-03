import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/current-user.decorator';
import { MANAGEMENT } from '../common/roles';
import {
  CouncilDecision,
  DECISION_LABELS,
  GradeLike,
  annualAverage,
  appreciation,
  classAverages,
  distinction,
  generalAverage,
  passRate,
  rankLabel,
  ranks,
  round2,
  subjectAverage,
  suggestedDecision,
} from '../grades/grade-math';

export interface SaveCardInput {
  councilAppreciation?: string;
  decision?: CouncilDecision | null;
  /** { subjectId: text } — merged with what is already saved. */
  appreciations?: Record<string, string>;
}

const mean = (values: number[]) => (values.length ? values.reduce((s, v) => s + v, 0) / values.length : null);

/**
 * Report cards and class council sheet. Everything is computed for the whole class in one pass
 * (averages, ranks, class statistics, absences, annual averages), then a pupil's card is read from it.
 */
@Injectable()
export class BulletinsService {
  constructor(private readonly prisma: PrismaService) {}

  private async context(user: AuthUser, classId: string, termId: string) {
    const klass = await this.prisma.class.findUnique({
      where: { id: classId },
      include: { school: { select: { name: true, city: true, phone: true, logoUrl: true } }, academicYear: { include: { terms: { orderBy: { order: 'asc' } } } }, teacher: { include: { user: { select: { firstName: true, lastName: true } } } } },
    });
    if (!klass || klass.schoolId !== user.schoolId) throw new NotFoundException('Classe introuvable');
    const term = klass.academicYear.terms.find((t) => t.id === termId);
    if (!term) throw new NotFoundException("Cette période n'appartient pas à l'année scolaire de la classe");
    return { klass, term, terms: klass.academicYear.terms, isLastTerm: klass.academicYear.terms[klass.academicYear.terms.length - 1].id === termId };
  }

  /** Results of a whole class for a term: the class council sheet. */
  async classSheet(user: AuthUser, classId: string, termId: string) {
    const { klass, term, terms, isLastTerm } = await this.context(user, classId, termId);
    const [classSubjects, enrollments, grades, cards, attendance] = await Promise.all([
      this.prisma.classSubject.findMany({ where: { classId }, include: { subject: true, teacher: { include: { user: { select: { firstName: true, lastName: true } } } } }, orderBy: { subject: { name: 'asc' } } }),
      this.prisma.enrollment.findMany({ where: { classId, withdrawalDate: null, student: { archivedAt: null } }, include: { student: true }, orderBy: [{ student: { lastName: 'asc' } }, { student: { firstName: 'asc' } }] }),
      // Every term of the year: the last one also needs the previous averages for the annual result.
      this.prisma.grade.findMany({ where: { classId, termId: { in: terms.map((t) => t.id) } }, select: { studentId: true, subjectId: true, termId: true, score: true, maxScore: true, coefficient: true } }),
      this.prisma.reportCard.findMany({ where: { classId, termId } }),
      this.prisma.attendance.groupBy({ by: ['studentId', 'status'], where: { classId, date: { gte: term.startDate, lte: term.endDate }, status: { not: 'PRESENT' } }, _count: true }),
    ]);

    const coefficients = new Map(classSubjects.map((cs) => [cs.subjectId, cs.coefficient]));
    const byTerm = new Map<string, GradeLike[]>();
    for (const g of grades) byTerm.set(g.termId, [...(byTerm.get(g.termId) ?? []), g]);
    const termAverages = new Map(terms.map((t) => [t.id, classAverages(byTerm.get(t.id) ?? [], coefficients)]));
    const current = byTerm.get(termId) ?? [];
    const averages = termAverages.get(termId)!;
    const studentIds = enrollments.map((e) => e.studentId);
    // Pupils who left the class are not ranked.
    const enrolledAverages = new Map(studentIds.map((id) => [id, averages.get(id) ?? null]));
    const classRanks = ranks(enrolledAverages);
    const cardOf = new Map(cards.map((c) => [c.studentId, c]));
    const absences = new Map<string, { unjustified: number; justified: number; late: number }>();
    for (const row of attendance) {
      const entry = absences.get(row.studentId) ?? { unjustified: 0, justified: 0, late: 0 };
      if (row.status === 'ABSENT') entry.unjustified = row._count;
      else if (row.status === 'ABSENCE_JUSTIFIEE') entry.justified = row._count;
      else if (row.status === 'RETARD') entry.late = row._count;
      absences.set(row.studentId, entry);
    }

    // Per subject: each pupil's average, the class average and the rank in the subject.
    const subjects = classSubjects.map((cs) => {
      const perStudent = new Map(studentIds.map((id) => [id, subjectAverage(current.filter((g) => g.subjectId === cs.subjectId && g.studentId === id))]));
      const graded = [...perStudent.values()].filter((a): a is number => a !== null);
      return {
        id: cs.subjectId,
        name: cs.subject.name,
        coefficient: cs.coefficient,
        teacher: cs.teacher ? `${cs.teacher.user.firstName} ${cs.teacher.user.lastName}` : null,
        classAverage: round2(mean(graded)),
        best: graded.length ? round2(Math.max(...graded)) : null,
        lowest: graded.length ? round2(Math.min(...graded)) : null,
        perStudent,
        ranks: ranks(perStudent),
      };
    });

    const students = enrollments.map(({ student }) => {
      const average = enrolledAverages.get(student.id) ?? null;
      const card = cardOf.get(student.id);
      const perTerm = terms.map((t) => ({ termId: t.id, name: t.name, order: t.order, average: round2(termAverages.get(t.id)?.get(student.id) ?? null) }));
      const annual = isLastTerm ? annualAverage(perTerm) : null;
      const earned = distinction(average);
      return {
        id: student.id,
        matricule: student.matricule,
        firstName: student.firstName,
        lastName: student.lastName,
        gender: student.gender,
        dateOfBirth: student.dateOfBirth,
        placeOfBirth: student.placeOfBirth,
        average: round2(average),
        rank: classRanks.get(student.id)?.rank ?? null,
        rankLabel: rankLabel(classRanks.get(student.id)),
        appreciation: appreciation(average),
        distinction: earned,
        absences: absences.get(student.id) ?? { unjustified: 0, justified: 0, late: 0 },
        councilAppreciation: card?.councilAppreciation ?? null,
        subjectAppreciations: (card?.appreciations ?? {}) as Record<string, string>,
        termAverages: perTerm,
        annualAverage: round2(annual),
        suggestedDecision: isLastTerm ? suggestedDecision(annual) : null,
        decision: (card?.decision as CouncilDecision | null) ?? null,
      };
    });

    const ranked = students.map((s) => s.average).filter((a): a is number => a !== null);
    return {
      school: klass.school,
      class: { id: klass.id, name: klass.name, level: klass.level, headTeacher: klass.teacher ? `${klass.teacher.user.firstName} ${klass.teacher.user.lastName}` : null },
      year: klass.academicYear.name,
      term: { id: term.id, name: term.name, order: term.order },
      isLastTerm,
      subjects,
      students,
      stats: {
        size: students.length,
        ranked: ranked.length,
        classAverage: round2(mean(ranked)),
        best: ranked.length ? Math.max(...ranked) : null,
        lowest: ranked.length ? Math.min(...ranked) : null,
        passRate: passRate(ranked),
        honours: students.filter((s) => s.distinction && ['TABLEAU_HONNEUR', 'ENCOURAGEMENTS', 'FELICITATIONS'].includes(s.distinction.code)).length,
        girls: students.filter((s) => s.gender === 'F').length,
        boys: students.filter((s) => s.gender === 'M').length,
      },
    };
  }

  /** The council sheet as sent to the screens (internal maps removed). */
  async classSheetView(user: AuthUser, classId: string, termId: string) {
    const sheet = await this.classSheet(user, classId, termId);
    return { ...sheet, subjects: sheet.subjects.map(({ perStudent: _p, ranks: _r, ...s }) => (void _p, void _r, s)) };
  }

  /** One pupil's card, read from the class sheet. */
  private card(sheet: Awaited<ReturnType<BulletinsService['classSheet']>>, studentId: string) {
    const student = sheet.students.find((s) => s.id === studentId);
    if (!student) throw new NotFoundException("Cet élève n'est pas inscrit dans cette classe");
    const rows = sheet.subjects.map((s) => {
      const average = s.perStudent.get(studentId) ?? null;
      return {
        subjectId: s.id,
        subject: s.name,
        coefficient: s.coefficient,
        teacher: s.teacher,
        average: round2(average),
        weighted: average === null ? null : round2(average * s.coefficient),
        rankLabel: rankLabel(s.ranks.get(studentId)),
        classAverage: s.classAverage,
        appreciation: student.subjectAppreciations[s.id]?.trim() || appreciation(average),
      };
    });
    const graded = rows.filter((r) => r.average !== null);
    return {
      school: sheet.school,
      class: sheet.class,
      year: sheet.year,
      term: sheet.term,
      isLastTerm: sheet.isLastTerm,
      student,
      subjects: rows,
      totals: { coefficients: graded.reduce((s, r) => s + r.coefficient, 0), weighted: round2(graded.reduce((s, r) => s + (r.weighted ?? 0), 0)), average: round2(generalAverage(rows)) },
      stats: sheet.stats,
      decisionLabel: student.decision ? DECISION_LABELS[student.decision] : null,
    };
  }

  private async classOf(user: AuthUser, studentId: string, termId: string) {
    const term = await this.prisma.term.findUnique({ where: { id: termId } });
    if (!term) throw new NotFoundException('Période introuvable');
    const enrollment = await this.prisma.enrollment.findFirst({
      where: { studentId, withdrawalDate: null, class: { academicYearId: term.academicYearId }, student: { schoolId: user.schoolId ?? '-' } },
      select: { classId: true },
    });
    if (!enrollment) throw new NotFoundException("L'élève n'est inscrit dans aucune classe pour cette période");
    return enrollment.classId;
  }

  async bulletin(user: AuthUser, studentId: string, termId: string) {
    const classId = await this.classOf(user, studentId, termId);
    return this.card(await this.classSheet(user, classId, termId), studentId);
  }

  /** Every card of a class, in alphabetical order (batch printing). */
  async classBulletins(user: AuthUser, classId: string, termId: string) {
    const sheet = await this.classSheet(user, classId, termId);
    return sheet.students.map((s) => this.card(sheet, s.id));
  }

  /** Saves what the council or a teacher wrote. Only the management records the end-of-year decision. */
  async saveCard(user: AuthUser, studentId: string, termId: string, input: SaveCardInput) {
    const classId = await this.classOf(user, studentId, termId);
    const { isLastTerm } = await this.context(user, classId, termId);
    const isManagement = (MANAGEMENT as readonly string[]).includes(user.role);
    if (input.decision !== undefined) {
      if (!isManagement) throw new ForbiddenException('Seule la direction enregistre la décision du conseil de classe');
      if (input.decision && !isLastTerm) throw new BadRequestException("La décision de fin d'année se prend à la dernière période");
    }
    if (input.appreciations) {
      const subjects = new Set((await this.prisma.classSubject.findMany({ where: { classId }, select: { subjectId: true } })).map((s) => s.subjectId));
      const unknown = Object.keys(input.appreciations).filter((id) => !subjects.has(id));
      if (unknown.length) throw new BadRequestException("Une appréciation porte sur une matière qui n'est pas enseignée dans cette classe");
    }
    const existing = await this.prisma.reportCard.findUnique({ where: { studentId_termId: { studentId, termId } } });
    const merged = { ...((existing?.appreciations ?? {}) as Record<string, string>) };
    for (const [subjectId, text] of Object.entries(input.appreciations ?? {})) {
      if (text.trim()) merged[subjectId] = text.trim().slice(0, 200);
      else delete merged[subjectId];
    }
    const data = {
      classId,
      appreciations: merged,
      ...(input.councilAppreciation !== undefined ? { councilAppreciation: input.councilAppreciation.trim().slice(0, 500) || null } : {}),
      ...(input.decision !== undefined ? { decision: input.decision } : {}),
      updatedById: user.userId,
    };
    await this.prisma.reportCard.upsert({ where: { studentId_termId: { studentId, termId } }, create: { studentId, termId, ...data }, update: data });
    return this.bulletin(user, studentId, termId);
  }

  /** Class results as a spreadsheet (CSV for Excel) for the school's statistics and reports. */
  async classCsv(user: AuthUser, classId: string, termId: string) {
    const sheet = await this.classSheet(user, classId, termId);
    const cell = (v: unknown) => {
      const text = v === null || v === undefined ? '' : typeof v === 'number' ? String(v).replace('.', ',') : String(v);
      return /[;"\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };
    const header = ['Rang', 'Matricule', 'Nom', 'Prénoms', 'Sexe', 'Date de naissance', ...sheet.subjects.map((s) => `${s.name} (coef ${s.coefficient})`), 'Moyenne', 'Distinction', 'Absences non justifiées', 'Absences justifiées', 'Retards'];
    if (sheet.isLastTerm) header.push(...sheet.students[0]?.termAverages.map((t) => `Moyenne ${t.name}`) ?? [], 'Moyenne annuelle', 'Décision');
    const lines = [...sheet.students]
      .sort((a, b) => (a.rank ?? 9999) - (b.rank ?? 9999) || a.lastName.localeCompare(b.lastName))
      .map((s) => {
        const row: unknown[] = [s.rank, s.matricule, s.lastName, s.firstName, s.gender, s.dateOfBirth.toISOString().slice(0, 10), ...sheet.subjects.map((sub) => round2(sub.perStudent.get(s.id) ?? null)), s.average, s.distinction?.label ?? '', s.absences.unjustified, s.absences.justified, s.absences.late];
        if (sheet.isLastTerm) row.push(...s.termAverages.map((t) => t.average), s.annualAverage, s.decision ? DECISION_LABELS[s.decision] : '');
        return row.map(cell).join(';');
      });
    return { fileName: `resultats-${sheet.class.name}-${sheet.term.name}.csv`.replace(/[^\w.-]+/g, '-'), content: `${String.fromCharCode(0xfeff)}${header.map(cell).join(';')}\r\n${lines.join('\r\n')}\r\n` };
  }
}

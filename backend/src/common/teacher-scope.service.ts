import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from './current-user.decorator';
import { canGradeSubject, teacherClassIds, TeacherAssignments } from './teacher-scope';

/**
 * Limits a teacher to his own classes and subjects. Every method is a no-op for the other staff roles,
 * which keep the whole school; the school check itself stays in each service.
 */
@Injectable()
export class TeacherScopeService {
  constructor(private readonly prisma: PrismaService) {}

  isTeacher(user: AuthUser) {
    return user.role === 'ENSEIGNANT';
  }

  private async assignments(user: AuthUser): Promise<TeacherAssignments & { staffId: string | null }> {
    const staff = await this.prisma.staffMember.findUnique({ where: { userId: user.userId }, select: { id: true } });
    if (!staff) return { staffId: null, mainClassIds: [], subjects: [] };
    const [main, subjects] = await Promise.all([
      this.prisma.class.findMany({ where: { teacherId: staff.id, schoolId: user.schoolId ?? '-' }, select: { id: true } }),
      this.prisma.classSubject.findMany({ where: { teacherId: staff.id, class: { schoolId: user.schoolId ?? '-' } }, select: { classId: true, subjectId: true } }),
    ]);
    return { staffId: staff.id, mainClassIds: main.map((c) => c.id), subjects };
  }

  /** The classes a teacher may reach; null for the other roles (no restriction). */
  async classIds(user: AuthUser): Promise<string[] | null> {
    if (!this.isTeacher(user)) return null;
    return teacherClassIds(await this.assignments(user));
  }

  async assertClass(user: AuthUser, classId: string) {
    const ids = await this.classIds(user);
    if (ids && !ids.includes(classId)) throw new ForbiddenException("Cette classe ne fait pas partie de vos classes");
  }

  /** Entering marks: the subject must be the teacher's in that class. */
  async assertSubject(user: AuthUser, classId: string, subjectId: string) {
    const allowed = await this.gradeChecker(user);
    if (!allowed(classId, subjectId)) throw new ForbiddenException("Cette matière ne vous est pas affectée dans cette classe");
  }

  /** Same rule for many rows at once (file import, voice or image entry): one load, then a plain test. */
  async gradeChecker(user: AuthUser): Promise<(classId: string, subjectId: string) => boolean> {
    if (!this.isTeacher(user)) return () => true;
    const a = await this.assignments(user);
    const staffId = a.staffId;
    if (!staffId) return () => false;
    const links = await this.prisma.classSubject.findMany({ where: { classId: { in: a.mainClassIds } }, select: { classId: true, subjectId: true, teacherId: true } });
    const assigned = new Map(links.map((l) => [`${l.classId}|${l.subjectId}`, l.teacherId]));
    return (classId, subjectId) => canGradeSubject(a, classId, subjectId, assigned.get(`${classId}|${subjectId}`) ?? null, staffId);
  }

  /** A pupil is reachable when he is, or was, enrolled in one of the teacher's classes. */
  async assertStudent(user: AuthUser, studentId: string) {
    const ids = await this.classIds(user);
    if (!ids) return;
    const enrolled = await this.prisma.enrollment.findFirst({ where: { studentId, classId: { in: ids } }, select: { id: true } });
    if (!enrolled) throw new ForbiddenException("Cet élève ne fait pas partie de vos classes");
  }
}

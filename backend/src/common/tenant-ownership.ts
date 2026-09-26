import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Ownership checks for secondary identifiers received in a body or URL (teacherId, termId,
 * studentIds…). The primary resource of a route is already checked by each service; these
 * helpers close the cross-tenant write paths listed as SEC-03..09 in docs/audit/audit-technique.md.
 */

export async function assertTeacherInSchool(prisma: PrismaService, teacherId: string, schoolId: string) {
  const teacher = await prisma.staffMember.findFirst({ where: { id: teacherId, user: { schoolId } } });
  if (!teacher) throw new NotFoundException('Enseignant introuvable');
}

export async function assertAcademicYearInSchool(prisma: PrismaService, academicYearId: string, schoolId: string) {
  const year = await prisma.academicYear.findFirst({ where: { id: academicYearId, schoolId } });
  if (!year) throw new NotFoundException('Année scolaire introuvable');
}

export async function assertTermInSchool(prisma: PrismaService, termId: string, schoolId: string) {
  const term = await prisma.term.findFirst({ where: { id: termId, academicYear: { schoolId } } });
  if (!term) throw new NotFoundException('Période introuvable');
  return term;
}

export async function assertSubjectInSchool(prisma: PrismaService, subjectId: string, schoolId: string) {
  const subject = await prisma.subject.findFirst({ where: { id: subjectId, schoolId } });
  if (!subject) throw new NotFoundException('Matière introuvable');
}

export async function assertVehicleInSchool(prisma: PrismaService, vehicleId: string, schoolId: string) {
  const vehicle = await prisma.vehicle.findFirst({ where: { id: vehicleId, schoolId } });
  if (!vehicle) throw new NotFoundException('Véhicule introuvable');
}

/** Every student must currently be enrolled in the class (the class itself is checked by the caller). */
export async function assertStudentsEnrolledInClass(prisma: PrismaService, classId: string, studentIds: string[]) {
  const unique = [...new Set(studentIds)];
  if (unique.length === 0) return;
  const enrolled = await prisma.enrollment.count({
    where: { classId, studentId: { in: unique }, withdrawalDate: null },
  });
  if (enrolled !== unique.length) {
    throw new BadRequestException("Un ou plusieurs élèves ne sont pas inscrits dans cette classe");
  }
}

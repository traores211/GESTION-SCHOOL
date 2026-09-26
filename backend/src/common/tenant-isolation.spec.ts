import * as fs from 'fs';
import * as path from 'path';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AuthUser } from './current-user.decorator';

const audit = { record: jest.fn() };
import { GradesService } from '../grades/grades.service';
import { AttendanceService } from '../attendance/attendance.service';
import { AcademicYearsService } from '../academic-years/academic-years.service';
import { ClassesService } from '../classes/classes.service';
import { SubjectsService } from '../subjects/subjects.service';
import { TransportService } from '../transport/transport.service';

/**
 * Cross-tenant write attempts (SEC-03..08): an authenticated user of school A passes an
 * identifier that belongs to school B. Each must be refused BEFORE anything is written.
 * Prisma is mocked: "belongs to school A" = the ownership query returns a row.
 */
const directorA: AuthUser = { userId: 'dirA', email: 'dir@a', role: 'DIRECTOR', schoolId: 'school-A' };

function prismaMock() {
  const fn = () => jest.fn();
  return {
    class: { findUnique: fn(), create: fn(), update: fn() },
    subject: { findUnique: fn(), findFirst: fn() },
    term: { findFirst: fn(), findUnique: fn() },
    enrollment: { count: fn() },
    grade: { create: fn() },
    attendance: { upsert: fn() },
    academicYear: { findFirst: fn(), updateMany: fn(), update: fn() },
    staffMember: { findFirst: fn() },
    vehicle: { findFirst: fn() },
    transportRoute: { create: fn() },
    classSubject: { upsert: fn() },
    student: { findMany: fn() },
    $transaction: jest.fn(async (ops: unknown) => (Array.isArray(ops) ? Promise.all(ops) : ops)),
  };
}

const ownClass = { id: 'class-A', schoolId: 'school-A' };

describe('Cross-tenant writes are refused', () => {
  let prisma: ReturnType<typeof prismaMock>;
  beforeEach(() => {
    prisma = prismaMock();
  });

  describe('POST /grades', () => {
    const dto = { classId: 'class-A', subjectId: 'subj', termId: 'term', type: 'DEVOIR', records: [{ studentId: 'stu', score: 12 }] };

    it('refuses a subject of another school', async () => {
      prisma.class.findUnique.mockResolvedValue(ownClass);
      prisma.subject.findFirst.mockResolvedValue(null);
      await expect(new GradesService(prisma as any, audit as any).enter(directorA, dto as any)).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.grade.create).not.toHaveBeenCalled();
    });

    it('refuses a term of another school', async () => {
      prisma.class.findUnique.mockResolvedValue(ownClass);
      prisma.subject.findFirst.mockResolvedValue({ id: 'subj' });
      prisma.term.findFirst.mockResolvedValue(null);
      await expect(new GradesService(prisma as any, audit as any).enter(directorA, dto as any)).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.grade.create).not.toHaveBeenCalled();
    });

    it('refuses a student who is not enrolled in the class (e.g. from another school)', async () => {
      prisma.class.findUnique.mockResolvedValue(ownClass);
      prisma.subject.findFirst.mockResolvedValue({ id: 'subj' });
      prisma.term.findFirst.mockResolvedValue({ id: 'term' });
      prisma.enrollment.count.mockResolvedValue(0);
      await expect(new GradesService(prisma as any, audit as any).enter(directorA, dto as any)).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.grade.create).not.toHaveBeenCalled();
    });

    it('still records grades for enrolled students of the same school', async () => {
      prisma.class.findUnique.mockResolvedValue(ownClass);
      prisma.subject.findFirst.mockResolvedValue({ id: 'subj' });
      prisma.term.findFirst.mockResolvedValue({ id: 'term' });
      prisma.enrollment.count.mockResolvedValue(1);
      prisma.grade.create.mockResolvedValue({ id: 'g1' });
      await expect(new GradesService(prisma as any, audit as any).enter(directorA, dto as any)).resolves.toEqual([{ id: 'g1' }]);
    });
  });

  it('POST /attendance/mark refuses a foreign student and notifies nobody', async () => {
    const notifications = { notify: jest.fn() };
    prisma.class.findUnique.mockResolvedValue(ownClass);
    prisma.enrollment.count.mockResolvedValue(0);
    const dto = { classId: 'class-A', date: '2026-09-26', records: [{ studentId: 'foreign', status: 'ABSENT' }] };
    await expect(new AttendanceService(prisma as any, notifications as any).mark(directorA, dto as any)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.attendance.upsert).not.toHaveBeenCalled();
    expect(notifications.notify).not.toHaveBeenCalled();
  });

  it('PATCH /academic-years/:id/set-current refuses a year of another school without touching its own', async () => {
    prisma.academicYear.findFirst.mockResolvedValue(null);
    await expect(new AcademicYearsService(prisma as any, audit as any).setCurrent(directorA, 'year-B')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.academicYear.updateMany).not.toHaveBeenCalled();
    expect(prisma.academicYear.update).not.toHaveBeenCalled();
  });

  it('POST /classes refuses a teacher of another school', async () => {
    prisma.academicYear.findFirst.mockResolvedValue({ id: 'year-A' });
    prisma.staffMember.findFirst.mockResolvedValue(null);
    await expect(
      new ClassesService(prisma as any).create(directorA, { name: '6e B', code: '6B', level: '6ème', teacherId: 'teacher-B' } as any),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.class.create).not.toHaveBeenCalled();
  });

  it('POST /classes refuses an academic year of another school', async () => {
    prisma.academicYear.findFirst.mockResolvedValue(null);
    await expect(
      new ClassesService(prisma as any).create(directorA, { name: '6e B', code: '6B', level: '6ème', academicYearId: 'year-B' } as any),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.class.create).not.toHaveBeenCalled();
  });

  it('PATCH /classes/:id refuses re-attaching a class to a foreign teacher', async () => {
    prisma.class.findUnique.mockResolvedValue(ownClass);
    prisma.staffMember.findFirst.mockResolvedValue(null);
    await expect(new ClassesService(prisma as any).update(directorA, 'class-A', { teacherId: 'teacher-B' } as any)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.class.update).not.toHaveBeenCalled();
  });

  it('POST /subjects/:id/assign refuses a foreign teacher', async () => {
    prisma.subject.findUnique.mockResolvedValue({ id: 'subj', schoolId: 'school-A', coefficient: 1 });
    prisma.class.findUnique.mockResolvedValue(ownClass);
    prisma.staffMember.findFirst.mockResolvedValue(null);
    await expect(new SubjectsService(prisma as any).assignToClass(directorA, 'subj', 'class-A', 'teacher-B')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.classSubject.upsert).not.toHaveBeenCalled();
  });

  it('POST /transport/routes refuses a vehicle of another school', async () => {
    prisma.vehicle.findFirst.mockResolvedValue(null);
    await expect(new TransportService(prisma as any).createRoute(directorA, { name: 'Circuit', vehicleId: 'veh-B' } as any)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.transportRoute.create).not.toHaveBeenCalled();
  });
});

describe('Password hashes never leave the API', () => {
  it('no service includes a full User record (which carries the bcrypt hash)', () => {
    const src = path.join(__dirname, '..');
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) walk(full);
        else if (e.name.endsWith('.service.ts') && /\buser: true\b/.test(fs.readFileSync(full, 'utf8'))) offenders.push(e.name);
      }
    };
    walk(src);
    expect(offenders).toEqual([]);
  });
});

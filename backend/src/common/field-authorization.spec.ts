import { AuthUser } from './current-user.decorator';
import { StaffService } from '../staff/staff.service';
import { DashboardService } from '../dashboard/dashboard.service';
import { StudentsService } from '../students/students.service';

/** SEC-02: salaries and finance figures must not reach roles without the matching permission. */
const user = (role: string): AuthUser => ({ userId: `u-${role}`, email: `${role}@a`, role, schoolId: 'school-A' });

const staffRow = {
  id: 'u1',
  schoolId: 'school-A',
  firstName: 'Aya',
  lastName: 'Kouassi',
  password: '$2b$10$hash',
  staffMember: { id: 's1', baseSalary: 285000, classes: [] },
};

describe('Staff directory', () => {
  const prisma = { user: { findMany: jest.fn().mockResolvedValue([staffRow]), findUnique: jest.fn().mockResolvedValue(staffRow) } };
  const service = new StaffService(prisma as any);

  it('hides salaries from a teacher', async () => {
    const [row] = await service.findAll(user('ENSEIGNANT'));
    expect(row.staffMember?.baseSalary).toBeNull();
    expect(row).not.toHaveProperty('password');
    expect((await service.findOne(user('ENSEIGNANT'), 'u1')).staffMember?.baseSalary).toBeNull();
  });

  it('hides salaries from a secretary', async () => {
    const [row] = await service.findAll(user('SECRETARY'));
    expect(row.staffMember?.baseSalary).toBeNull();
  });

  it('shows salaries to the accountant and the director (payroll screen)', async () => {
    expect((await service.findAll(user('COMPTABLE')))[0].staffMember?.baseSalary).toBe(285000);
    expect((await service.findAll(user('DIRECTOR')))[0].staffMember?.baseSalary).toBe(285000);
  });
});

describe('Dashboard overview', () => {
  const prisma = {
    student: { count: jest.fn().mockResolvedValue(10) },
    user: { count: jest.fn().mockResolvedValue(3) },
    class: { count: jest.fn().mockResolvedValue(2) },
    admission: { count: jest.fn().mockResolvedValue(1) },
  };
  const attendance = { todayStats: jest.fn().mockResolvedValue({ rate: 90 }) };
  const billing = { financeStats: jest.fn().mockResolvedValue({ totalInvoiced: 1000 }) };
  const service = new DashboardService(prisma as any, attendance as any, billing as any);

  it('omits finance figures for a teacher', async () => {
    billing.financeStats.mockClear();
    expect((await service.overview(user('ENSEIGNANT'))).finance).toBeNull();
    expect(billing.financeStats).not.toHaveBeenCalled();
  });

  it('keeps finance figures for the accountant', async () => {
    expect((await service.overview(user('COMPTABLE'))).finance).toEqual({ totalInvoiced: 1000 });
  });
});

describe('Student 360° record', () => {
  const student = { id: 'st1', schoolId: 'school-A', grades: [{ score: 15 }], invoices: [{ id: 'inv' }] };
  const prisma = {
    student: { findUnique: jest.fn().mockResolvedValue(student) },
    attendance: { groupBy: jest.fn().mockResolvedValue([]) },
    grade: { aggregate: jest.fn().mockResolvedValue({ _avg: { score: 15 } }) },
  };
  const service = new StudentsService(prisma as any);

  it('hides invoices from a teacher but keeps grades', async () => {
    const r = await service.findOne(user('ENSEIGNANT'), 'st1');
    expect(r.invoices).toEqual([]);
    expect(r.grades).toHaveLength(1);
  });

  it('hides grades from the accountant but keeps invoices', async () => {
    const r = await service.findOne(user('COMPTABLE'), 'st1');
    expect(r.grades).toEqual([]);
    expect(r.averageScore).toBeNull();
    expect(r.invoices).toHaveLength(1);
  });
});

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/current-user.decorator';
import { AttendanceService } from '../attendance/attendance.service';
import { BillingService } from '../billing/billing.service';

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly attendanceService: AttendanceService,
    private readonly billingService: BillingService,
  ) {}

  async overview(user: AuthUser) {
    if (!user.schoolId) {
      return {
        studentsCount: 0,
        teachersCount: 0,
        classesCount: 0,
        pendingAdmissions: 0,
        attendance: { present: 0, absent: 0, late: 0, rate: 0 },
        finance: { totalInvoiced: 0, totalCollected: 0, outstanding: 0, recoveryRate: 0, collectedToday: 0 },
      };
    }

    const [studentsCount, teachersCount, classesCount, pendingAdmissions, attendance, finance] = await Promise.all([
      this.prisma.student.count({ where: { schoolId: user.schoolId } }),
      this.prisma.user.count({ where: { schoolId: user.schoolId, role: 'ENSEIGNANT' } }),
      this.prisma.class.count({ where: { schoolId: user.schoolId } }),
      this.prisma.admission.count({
        where: { schoolId: user.schoolId, status: { notIn: ['CONFIRME', 'REJETE'] } },
      }),
      this.attendanceService.todayStats(user),
      this.billingService.financeStats(user),
    ]);

    return { studentsCount, teachersCount, classesCount, pendingAdmissions, attendance, finance };
  }
}

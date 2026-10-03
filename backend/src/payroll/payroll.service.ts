import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/current-user.decorator';
import { UpdatePayslipDto } from './dto/update-payslip.dto';
import { PERIOD_PATTERN, netSalary, payslipProblem } from './payroll-math';

@Injectable()
export class PayrollService {
  constructor(private readonly prisma: PrismaService) {}

  async generate(user: AuthUser, period: string) {
    if (!user.schoolId) throw new BadRequestException("L'utilisateur n'est rattaché à aucun établissement");
    if (!PERIOD_PATTERN.test(period)) throw new BadRequestException('Période attendue au format AAAA-MM (ex. 2026-10)');

    const staff = await this.prisma.staffMember.findMany({
      where: { user: { schoolId: user.schoolId, status: 'ACTIVE' }, baseSalary: { not: null } },
    });

    if (staff.length === 0) {
      throw new BadRequestException(
        "Aucun membre du personnel n'a de salaire de base défini. Renseignez un salaire avant de générer la paie.",
      );
    }

    const results = [];
    for (const member of staff) {
      const payslip = await this.prisma.payslip.upsert({
        where: { staffMemberId_period: { staffMemberId: member.id, period } },
        update: {},
        create: {
          schoolId: user.schoolId,
          staffMemberId: member.id,
          period,
          baseSalary: member.baseSalary!,
          bonuses: 0,
          deductions: 0,
          netSalary: member.baseSalary!,
        },
      });
      results.push(payslip);
    }
    return results;
  }

  findAll(user: AuthUser, period?: string) {
    if (!user.schoolId) return [];
    return this.prisma.payslip.findMany({
      where: { schoolId: user.schoolId, ...(period ? { period } : {}) },
      include: { staffMember: { include: { user: true } } },
      orderBy: [{ period: 'desc' }, { staffMember: { user: { lastName: 'asc' } } }],
    });
  }

  async findOne(user: AuthUser, id: string) {
    const payslip = await this.prisma.payslip.findUnique({
      where: { id },
      include: { staffMember: { include: { user: true } }, school: true },
    });
    if (!payslip) throw new NotFoundException('Bulletin de paie introuvable');
    if (payslip.schoolId !== user.schoolId) throw new ForbiddenException();
    return payslip;
  }

  async update(user: AuthUser, id: string, dto: UpdatePayslipDto) {
    const payslip = await this.findOne(user, id);
    const problem = payslipProblem(payslip.status, 'edit');
    if (problem) throw new BadRequestException(problem);

    const bonuses = dto.bonuses ?? payslip.bonuses;
    const deductions = dto.deductions ?? payslip.deductions;
    const result = netSalary(payslip.baseSalary, bonuses, deductions);
    if ('error' in result) throw new BadRequestException(result.error);

    // A validated slip that changes goes back to draft: it must be validated again before payment.
    return this.prisma.payslip.update({
      where: { id },
      data: { bonuses, deductions, netSalary: result.net, ...(payslip.status === 'VALIDATED' ? { status: 'DRAFT' } : {}) },
    });
  }

  async validate(user: AuthUser, id: string) {
    const payslip = await this.findOne(user, id);
    const problem = payslipProblem(payslip.status, 'validate');
    if (problem) throw new BadRequestException(problem);
    return this.prisma.payslip.update({ where: { id }, data: { status: 'VALIDATED' } });
  }

  async pay(user: AuthUser, id: string) {
    const payslip = await this.findOne(user, id);
    const problem = payslipProblem(payslip.status, 'pay');
    if (problem) throw new BadRequestException(problem);
    return this.prisma.payslip.update({ where: { id }, data: { status: 'PAID', paidAt: new Date() } });
  }

  async stats(user: AuthUser, period: string) {
    if (!user.schoolId) return { totalGross: 0, totalNet: 0, count: 0, paidCount: 0 };
    const payslips = await this.prisma.payslip.findMany({ where: { schoolId: user.schoolId, period } });
    return {
      totalGross: payslips.reduce((s, p) => s + p.baseSalary + p.bonuses, 0),
      totalNet: payslips.reduce((s, p) => s + p.netSalary, 0),
      count: payslips.length,
      paidCount: payslips.filter((p) => p.status === 'PAID').length,
    };
  }
}

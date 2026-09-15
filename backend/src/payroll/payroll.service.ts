import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/current-user.decorator';
import { UpdatePayslipDto } from './dto/update-payslip.dto';

@Injectable()
export class PayrollService {
  constructor(private readonly prisma: PrismaService) {}

  async generate(user: AuthUser, period: string) {
    if (!user.schoolId) throw new BadRequestException("L'utilisateur n'est rattaché à aucun établissement");

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
    if (payslip.status === 'PAID') throw new BadRequestException('Ce bulletin a déjà été payé et ne peut plus être modifié');

    const bonuses = dto.bonuses ?? payslip.bonuses;
    const deductions = dto.deductions ?? payslip.deductions;
    const netSalary = payslip.baseSalary + bonuses - deductions;

    return this.prisma.payslip.update({
      where: { id },
      data: { bonuses, deductions, netSalary },
    });
  }

  async validate(user: AuthUser, id: string) {
    const payslip = await this.findOne(user, id);
    if (payslip.status !== 'DRAFT') throw new BadRequestException('Seul un bulletin en brouillon peut être validé');
    return this.prisma.payslip.update({ where: { id }, data: { status: 'VALIDATED' } });
  }

  async pay(user: AuthUser, id: string) {
    const payslip = await this.findOne(user, id);
    if (payslip.status === 'PAID') throw new BadRequestException('Ce bulletin a déjà été payé');
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

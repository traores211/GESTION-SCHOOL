import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/current-user.decorator';
import { can } from '../authz/permissions';
import { CreateStaffDto } from './dto/create-staff.dto';

function randomPassword() {
  // 12 characters from a CSPRNG (Math.random is predictable).
  return randomBytes(9).toString('base64url');
}

/** Salaries are only visible to holders of payroll:read (the staff directory is shared more widely). */
function redactSalary<T extends { staffMember: { baseSalary: number | null } | null }>(viewer: AuthUser, member: T): T {
  if (!member.staffMember || can(viewer, 'payroll:read')) return member;
  return { ...member, staffMember: { ...member.staffMember, baseSalary: null } };
}

@Injectable()
export class StaffService {
  constructor(private readonly prisma: PrismaService) {}

  async create(user: AuthUser, dto: CreateStaffDto) {
    if (!user.schoolId) throw new BadRequestException("L'utilisateur n'est rattaché à aucun établissement");

    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Un compte existe déjà avec cet email');

    const plainPassword = dto.password || randomPassword();
    const passwordHash = await bcrypt.hash(plainPassword, 10);

    const created = await this.prisma.user.create({
      data: {
        email: dto.email,
        password: passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone,
        role: dto.role as any,
        schoolId: user.schoolId,
        staffMember: {
          create: {
            position: dto.position,
            department: dto.department,
            hireDate: new Date(dto.hireDate),
            baseSalary: dto.baseSalary,
          },
        },
      },
      include: { staffMember: true },
    });

    return { ...created, temporaryPassword: dto.password ? undefined : plainPassword, password: undefined };
  }

  async findAll(user: AuthUser, role?: string) {
    if (!user.schoolId) return [];
    const users = await this.prisma.user.findMany({
      where: {
        schoolId: user.schoolId,
        staffMember: { isNot: null },
        ...(role ? { role: role as any } : {}),
      },
      include: {
        staffMember: { include: { classes: true } },
      },
      orderBy: [{ lastName: 'asc' }],
    });
    return users.map(({ password, ...rest }) => redactSalary(user, rest));
  }

  async findOne(user: AuthUser, id: string) {
    const found = await this.prisma.user.findUnique({
      where: { id },
      include: { staffMember: { include: { classes: true, classSubjects: { include: { subject: true, class: true } } } } },
    });
    if (!found || found.schoolId !== user.schoolId || !found.staffMember) {
      throw new NotFoundException('Membre du personnel introuvable');
    }
    const { password, ...rest } = found;
    return redactSalary(user, rest);
  }

  async updateSalary(user: AuthUser, id: string, baseSalary: number) {
    const found = await this.prisma.user.findUnique({ where: { id }, include: { staffMember: true } });
    if (!found || found.schoolId !== user.schoolId || !found.staffMember) {
      throw new NotFoundException('Membre du personnel introuvable');
    }
    return this.prisma.staffMember.update({ where: { id: found.staffMember.id }, data: { baseSalary } });
  }

  async remove(user: AuthUser, id: string) {
    const found = await this.prisma.user.findUnique({ where: { id } });
    if (!found || found.schoolId !== user.schoolId) throw new NotFoundException('Membre du personnel introuvable');
    await this.prisma.user.delete({ where: { id } });
    return { success: true };
  }
}

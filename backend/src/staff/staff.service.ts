import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { inSchool } from '../platform/group.service';
import { FINANCE } from '../common/roles';
import { StaffProfileDto } from './dto/staff-profile.dto';
import { AuthUser } from '../common/current-user.decorator';
import { CreateStaffDto } from './dto/create-staff.dto';
import { passwordProblem } from '../auth/password-policy';
import { TokenService } from '../auth/token.service';

/** 14-character temporary password that satisfies the password policy (letters and digits). */
function randomPassword() {
  const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
  const bytes = randomBytes(14);
  const chars = [...bytes].map((b, i) => (i % 4 === 3 ? String(b % 10) : alphabet[b % alphabet.length]));
  return chars.join('');
}

@Injectable()
export class StaffService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
  ) {}

  async create(user: AuthUser, dto: CreateStaffDto) {
    if (!user.schoolId) throw new BadRequestException("L'utilisateur n'est rattaché à aucun établissement");

    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Un compte existe déjà avec cet email');

    if (dto.password) {
      const problem = passwordProblem(dto.password, dto);
      if (problem) throw new BadRequestException(problem);
    }
    const plainPassword = dto.password || randomPassword();
    const passwordHash = await bcrypt.hash(plainPassword, 12);

    const created = await this.prisma.user.create({
      data: {
        email: dto.email,
        password: passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone,
        role: dto.role as any,
        schoolId: user.schoolId,
        memberships: { create: { schoolId: user.schoolId, role: dto.role as any } },
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

    return { ...created, temporaryPassword: dto.password ? undefined : plainPassword, password: undefined, totpSecret: undefined };
  }

  /** Bank details are for the management and the accounts only. */
  private visible<T extends { staffMember?: { bankAccount?: string | null; bankName?: string | null } | null }>(user: AuthUser, row: T): T {
    if ((FINANCE as readonly string[]).includes(user.role) || !row.staffMember) return row;
    return { ...row, staffMember: { ...row.staffMember, bankAccount: undefined, bankName: undefined } };
  }

  async findAll(user: AuthUser, role?: string, archived = false) {
    if (!user.schoolId) return [];
    const users = await this.prisma.user.findMany({
      where: {
        // Staff shared with another school of the group stay listed in each of their schools
        ...inSchool(user.schoolId),
        staffMember: { isNot: null },
        status: archived ? 'ARCHIVED' : { not: 'ARCHIVED' },
        ...(role ? { role: role as never } : {}),
      },
      include: {
        staffMember: { include: { classes: true } },
      },
      orderBy: [{ lastName: 'asc' }],
    });
    return users.map(({ password, totpSecret, ...rest }) => this.visible(user, rest));
  }

  async findOne(user: AuthUser, id: string) {
    const found = await this.prisma.user.findFirst({
      where: { id, ...inSchool(user.schoolId ?? '-') },
      include: { staffMember: { include: { classes: true, classSubjects: { include: { subject: true, class: true } } } } },
    });
    if (!found || !found.staffMember) {
      throw new NotFoundException('Membre du personnel introuvable');
    }
    const { password, totpSecret, ...rest } = found;
    return this.visible(user, rest);
  }

  /** Personnel file: identity, contract, qualifications, emergency contact, bank details. */
  async updateProfile(user: AuthUser, id: string, dto: StaffProfileDto) {
    const found = await this.prisma.user.findFirst({ where: { id, ...inSchool(user.schoolId ?? '-') }, include: { staffMember: true } });
    if (!found || !found.staffMember) throw new NotFoundException('Membre du personnel introuvable');
    const { firstName, lastName, phone, dateOfBirth, hireDate, ...file } = dto;
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id }, data: { ...(firstName ? { firstName } : {}), ...(lastName ? { lastName } : {}), ...(phone !== undefined ? { phone: phone || null } : {}) } }),
      this.prisma.staffMember.update({
        where: { id: found.staffMember.id },
        data: { ...file, ...(dateOfBirth ? { dateOfBirth: new Date(dateOfBirth) } : {}), ...(hireDate ? { hireDate: new Date(hireDate) } : {}) },
      }),
    ]);
    return this.findOne(user, id);
  }

  async updateSalary(user: AuthUser, id: string, baseSalary: number) {
    const found = await this.prisma.user.findFirst({ where: { id, ...inSchool(user.schoolId ?? '-') }, include: { staffMember: true } });
    if (!found || !found.staffMember) {
      throw new NotFoundException('Membre du personnel introuvable');
    }
    return this.prisma.staffMember.update({ where: { id: found.staffMember.id }, data: { baseSalary } });
  }

  /**
   * "Delete" archives the account (status ARCHIVED): it can no longer sign in, its sessions are cut
   * at once, and its history (marks entered, payslips, timetable) stays.
   */
  async remove(user: AuthUser, id: string) {
    return this.setStatus(user, id, 'ARCHIVED');
  }

  /** Activate, deactivate or archive a staff account; leaving ACTIVE cuts every session. */
  async setStatus(user: AuthUser, id: string, status: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED') {
    const found = await this.prisma.user.findFirst({ where: { id, ...inSchool(user.schoolId ?? '-') } });
    if (!found) throw new NotFoundException('Membre du personnel introuvable');
    if (found.id === user.userId && status !== 'ACTIVE') throw new BadRequestException('Vous ne pouvez pas désactiver votre propre compte');
    await this.prisma.user.update({ where: { id }, data: { status } });
    if (status !== 'ACTIVE') await this.tokens.revokeAll(id);
    else await this.tokens.forget(id);
    return { success: true, status };
  }
}

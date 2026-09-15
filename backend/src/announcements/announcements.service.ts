import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/current-user.decorator';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';

@Injectable()
export class AnnouncementsService {
  constructor(private readonly prisma: PrismaService) {}

  create(user: AuthUser, dto: CreateAnnouncementDto) {
    if (!user.schoolId) throw new BadRequestException("L'utilisateur n'est rattaché à aucun établissement");
    return this.prisma.announcement.create({ data: { ...dto, schoolId: user.schoolId } });
  }

  findAll(user: AuthUser) {
    if (!user.schoolId) return [];
    return this.prisma.announcement.findMany({
      where: { schoolId: user.schoolId },
      orderBy: { publishedAt: 'desc' },
    });
  }

  async update(user: AuthUser, id: string, dto: Partial<CreateAnnouncementDto>) {
    const existing = await this.prisma.announcement.findUnique({ where: { id } });
    if (!existing || existing.schoolId !== user.schoolId) throw new NotFoundException('Annonce introuvable');
    return this.prisma.announcement.update({ where: { id }, data: dto });
  }

  async remove(user: AuthUser, id: string) {
    const existing = await this.prisma.announcement.findUnique({ where: { id } });
    if (!existing || existing.schoolId !== user.schoolId) throw new ForbiddenException();
    await this.prisma.announcement.delete({ where: { id } });
    return { success: true };
  }
}

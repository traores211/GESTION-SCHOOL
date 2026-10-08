import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/current-user.decorator';
import { PageQueryDto, pageArgs, pageResult } from '../common/pagination';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';

@Injectable()
export class AnnouncementsService {
  constructor(private readonly prisma: PrismaService) {}

  create(user: AuthUser, dto: CreateAnnouncementDto) {
    if (!user.schoolId) throw new BadRequestException("L'utilisateur n'est rattaché à aucun établissement");
    return this.prisma.announcement.create({ data: { ...dto, schoolId: user.schoolId } });
  }

  /** Published announcements of the school. Paged when `page` is given; bare array otherwise. */
  async findAll(user: AuthUser, page?: PageQueryDto) {
    if (!user.schoolId) return [];
    const where = {
      schoolId: user.schoolId,
      ...(page?.q
        ? {
            OR: [
              { title: { contains: page.q, mode: 'insensitive' as const } },
              { content: { contains: page.q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.announcement.findMany({ where, orderBy: { publishedAt: 'desc' }, ...pageArgs(page) }),
      page?.page ? this.prisma.announcement.count({ where }) : Promise.resolve(0),
    ]);
    return pageResult(page, items, total);
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

import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/** Marks, roll calls and enrolments of a closed or archived school year can no longer change. */
export async function assertYearOpen(prisma: PrismaService, academicYearId: string) {
  const year = await prisma.academicYear.findUnique({ where: { id: academicYearId }, select: { status: true, name: true } });
  if (year && (year.status === 'CLOTUREE' || year.status === 'ARCHIVEE')) {
    throw new BadRequestException(`L'année scolaire ${year.name} est clôturée : ses données ne peuvent plus être modifiées`);
  }
}

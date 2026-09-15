import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/current-user.decorator';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { CreateRouteDto } from './dto/create-route.dto';

// Abidjan bounding box, used only to generate a plausible simulated GPS position for the demo.
const ABIDJAN_BOUNDS = { latMin: 5.28, latMax: 5.42, lngMin: -4.1, lngMax: -3.92 };

@Injectable()
export class TransportService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------- Vehicles ----------

  createVehicle(user: AuthUser, dto: CreateVehicleDto) {
    if (!user.schoolId) throw new BadRequestException("L'utilisateur n'est rattaché à aucun établissement");
    return this.prisma.vehicle.create({ data: { ...dto, schoolId: user.schoolId } });
  }

  findVehicles(user: AuthUser) {
    if (!user.schoolId) return [];
    return this.prisma.vehicle.findMany({
      where: { schoolId: user.schoolId },
      include: { routes: true },
      orderBy: { plateNumber: 'asc' },
    });
  }

  async removeVehicle(user: AuthUser, id: string) {
    const vehicle = await this.prisma.vehicle.findUnique({ where: { id } });
    if (!vehicle || vehicle.schoolId !== user.schoolId) throw new ForbiddenException();
    await this.prisma.vehicle.delete({ where: { id } });
    return { success: true };
  }

  /**
   * Structural placeholder for a real GPS/telemetry integration (vehicle tracker or driver
   * mobile app). No hardware is connected here — this simulates one ping so the "last known
   * position" UI has something real to display, matching PROMPT.MD's "prévoir intégration GPS".
   */
  async pingVehicle(user: AuthUser, id: string) {
    const vehicle = await this.prisma.vehicle.findUnique({ where: { id } });
    if (!vehicle || vehicle.schoolId !== user.schoolId) throw new NotFoundException('Véhicule introuvable');

    const lastLat = ABIDJAN_BOUNDS.latMin + Math.random() * (ABIDJAN_BOUNDS.latMax - ABIDJAN_BOUNDS.latMin);
    const lastLng = ABIDJAN_BOUNDS.lngMin + Math.random() * (ABIDJAN_BOUNDS.lngMax - ABIDJAN_BOUNDS.lngMin);

    return this.prisma.vehicle.update({
      where: { id },
      data: { lastLat, lastLng, lastPingAt: new Date() },
    });
  }

  // ---------- Routes ----------

  createRoute(user: AuthUser, dto: CreateRouteDto) {
    if (!user.schoolId) throw new BadRequestException("L'utilisateur n'est rattaché à aucun établissement");
    return this.prisma.transportRoute.create({ data: { ...dto, schoolId: user.schoolId } });
  }

  findRoutes(user: AuthUser) {
    if (!user.schoolId) return [];
    return this.prisma.transportRoute.findMany({
      where: { schoolId: user.schoolId },
      include: { vehicle: true, subscriptions: { where: { isActive: true }, include: { student: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async findRoute(user: AuthUser, id: string) {
    const route = await this.prisma.transportRoute.findUnique({
      where: { id },
      include: { vehicle: true, subscriptions: { include: { student: true } } },
    });
    if (!route || route.schoolId !== user.schoolId) throw new NotFoundException('Circuit introuvable');
    return route;
  }

  async removeRoute(user: AuthUser, id: string) {
    const route = await this.prisma.transportRoute.findUnique({ where: { id } });
    if (!route || route.schoolId !== user.schoolId) throw new ForbiddenException();
    await this.prisma.transportRoute.delete({ where: { id } });
    return { success: true };
  }

  async subscribe(user: AuthUser, routeId: string, studentId: string) {
    const route = await this.prisma.transportRoute.findUnique({ where: { id: routeId } });
    if (!route || route.schoolId !== user.schoolId) throw new NotFoundException('Circuit introuvable');
    const student = await this.prisma.student.findUnique({ where: { id: studentId } });
    if (!student || student.schoolId !== user.schoolId) throw new NotFoundException('Élève introuvable');

    return this.prisma.transportSubscription.upsert({
      where: { routeId_studentId: { routeId, studentId } },
      update: { isActive: true },
      create: { routeId, studentId },
    });
  }

  async unsubscribe(user: AuthUser, routeId: string, studentId: string) {
    const route = await this.prisma.transportRoute.findUnique({ where: { id: routeId } });
    if (!route || route.schoolId !== user.schoolId) throw new NotFoundException('Circuit introuvable');

    return this.prisma.transportSubscription.update({
      where: { routeId_studentId: { routeId, studentId } },
      data: { isActive: false },
    });
  }
}

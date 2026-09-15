import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/current-user.decorator';
import { TransportService } from './transport.service';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { CreateRouteDto } from './dto/create-route.dto';

@Controller('transport')
@ApiTags('Transport')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class TransportController {
  constructor(private readonly transportService: TransportService) {}

  @Post('vehicles')
  createVehicle(@CurrentUser() user: AuthUser, @Body() dto: CreateVehicleDto) {
    return this.transportService.createVehicle(user, dto);
  }

  @Get('vehicles')
  findVehicles(@CurrentUser() user: AuthUser) {
    return this.transportService.findVehicles(user);
  }

  @Post('vehicles/:id/ping')
  pingVehicle(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.transportService.pingVehicle(user, id);
  }

  @Delete('vehicles/:id')
  removeVehicle(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.transportService.removeVehicle(user, id);
  }

  @Post('routes')
  createRoute(@CurrentUser() user: AuthUser, @Body() dto: CreateRouteDto) {
    return this.transportService.createRoute(user, dto);
  }

  @Get('routes')
  findRoutes(@CurrentUser() user: AuthUser) {
    return this.transportService.findRoutes(user);
  }

  @Get('routes/:id')
  findRoute(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.transportService.findRoute(user, id);
  }

  @Delete('routes/:id')
  removeRoute(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.transportService.removeRoute(user, id);
  }

  @Post('routes/:id/subscribe/:studentId')
  subscribe(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('studentId') studentId: string) {
    return this.transportService.subscribe(user, id, studentId);
  }

  @Post('routes/:id/unsubscribe/:studentId')
  unsubscribe(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('studentId') studentId: string) {
    return this.transportService.unsubscribe(user, id, studentId);
  }
}

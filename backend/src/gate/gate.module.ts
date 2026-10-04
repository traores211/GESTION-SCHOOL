import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { GateController } from './gate.controller';
import { GateService } from './gate.service';

@Module({
  imports: [NotificationsModule],
  controllers: [GateController],
  providers: [GateService],
})
export class GateModule {}

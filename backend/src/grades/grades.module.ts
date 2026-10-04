import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { GradesController } from './grades.controller';
import { GradesService } from './grades.service';

@Module({
  imports: [NotificationsModule],
  controllers: [GradesController],
  providers: [GradesService],
  exports: [GradesService],
})
export class GradesModule {}

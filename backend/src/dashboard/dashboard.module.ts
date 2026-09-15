import { Module } from '@nestjs/common';
import { AttendanceModule } from '../attendance/attendance.module';
import { BillingModule } from '../billing/billing.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [AttendanceModule, BillingModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}

import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { BulletinsModule } from '../bulletins/bulletins.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ParentPortalController } from './parent-portal.controller';
import { ParentPortalService } from './parent-portal.service';

@Module({
  imports: [BillingModule, BulletinsModule, NotificationsModule],
  controllers: [ParentPortalController],
  providers: [ParentPortalService],
})
export class ParentPortalModule {}

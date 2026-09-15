import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { PaymentProvidersRegistry } from './providers/payment-providers.registry';

@Module({
  imports: [NotificationsModule],
  controllers: [BillingController],
  providers: [BillingService, PaymentProvidersRegistry],
  exports: [BillingService],
})
export class BillingModule {}

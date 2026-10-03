import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { OnlinePaymentService } from './online/online-payment.service';
import { PaymentsController } from './online/payments.controller';
import { PaymentProvidersRegistry } from './providers/payment-providers.registry';

@Module({
  imports: [NotificationsModule, AuthModule],
  controllers: [BillingController, PaymentsController],
  providers: [BillingService, PaymentProvidersRegistry, OnlinePaymentService],
  exports: [BillingService, OnlinePaymentService],
})
export class BillingModule {}

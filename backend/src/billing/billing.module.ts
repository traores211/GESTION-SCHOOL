import { Module } from '@nestjs/common';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { PaymentProvidersRegistry } from './providers/payment-providers.registry';

@Module({
  controllers: [BillingController],
  providers: [BillingService, PaymentProvidersRegistry],
  exports: [BillingService],
})
export class BillingModule {}

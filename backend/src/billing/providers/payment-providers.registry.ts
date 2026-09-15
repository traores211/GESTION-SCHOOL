import { Injectable } from '@nestjs/common';
import { PaymentChargeResult, PaymentProvider } from './payment-provider.interface';

class ManualPaymentProvider implements PaymentProvider {
  async charge(): Promise<PaymentChargeResult> {
    return { status: 'SUCCESS' };
  }
}

/**
 * Structural placeholder for a real Mobile Money operator (Orange Money, MTN MoMo,
 * Moov Money, Wave). A production integration would call the operator's SDK/API here
 * and rely on their webhook to confirm the transaction asynchronously — nothing in
 * billing.service.ts needs to change to plug that in, only this class.
 */
class SimulatedMobileMoneyProvider implements PaymentProvider {
  constructor(private readonly label: string) {}

  async charge(_amount: number, reference: string): Promise<PaymentChargeResult> {
    return { status: 'SUCCESS', providerReference: `${this.label}-SIM-${reference}` };
  }
}

@Injectable()
export class PaymentProvidersRegistry {
  private readonly providers: Record<string, PaymentProvider> = {
    CASH: new ManualPaymentProvider(),
    CHEQUE: new ManualPaymentProvider(),
    BANK_TRANSFER: new ManualPaymentProvider(),
    CARD: new ManualPaymentProvider(),
    MOBILE_MONEY_ORANGE: new SimulatedMobileMoneyProvider('ORANGE'),
    MOBILE_MONEY_MTN: new SimulatedMobileMoneyProvider('MTN'),
    MOBILE_MONEY_MOOV: new SimulatedMobileMoneyProvider('MOOV'),
    WAVE: new SimulatedMobileMoneyProvider('WAVE'),
  };

  get(method: string): PaymentProvider {
    return this.providers[method] ?? this.providers.CASH;
  }
}

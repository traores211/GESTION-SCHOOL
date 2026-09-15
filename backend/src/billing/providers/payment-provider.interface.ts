export interface PaymentChargeResult {
  status: 'SUCCESS' | 'PENDING' | 'FAILED';
  providerReference?: string;
}

export interface PaymentProvider {
  charge(amount: number, reference: string): Promise<PaymentChargeResult>;
}

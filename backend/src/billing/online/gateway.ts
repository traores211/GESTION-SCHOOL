import { createHmac, timingSafeEqual } from 'crypto';

/** Online payment gateways (payment links): CinetPay in production, a simulator for development. */

export interface CheckoutRequest {
  transactionId: string;
  /** Whole francs CFA. */
  amount: number;
  description: string;
  customer: { name?: string; phone?: string; email?: string };
  notifyUrl: string;
  returnUrl: string;
}

export interface GatewayVerdict {
  status: 'SUCCESS' | 'FAILED' | 'PENDING';
  amount?: number;
  /** One of the PaymentMethod values when the gateway tells which wallet paid. */
  method?: string;
  phone?: string;
  message?: string;
}

export interface OnlineGateway {
  readonly name: string;
  createCheckout(request: CheckoutRequest): Promise<{ checkoutUrl: string }>;
  /** Asks the gateway for the real state of a transaction (never trust the browser or a bare webhook). */
  verify(transactionId: string): Promise<GatewayVerdict>;
}

// ---------------------------------------------------------------- CinetPay

/** Fields of a CinetPay notification, in the order used to compute the x-token signature. */
export const CINETPAY_TOKEN_FIELDS = [
  'cpm_site_id',
  'cpm_trans_id',
  'cpm_trans_date',
  'cpm_amount',
  'cpm_currency',
  'signature',
  'payment_method',
  'cel_phone_num',
  'cpm_phone_prefixe',
  'cpm_language',
  'cpm_version',
  'cpm_payment_config',
  'cpm_page_action',
  'cpm_custom',
  'cpm_designation',
  'cpm_error_message',
] as const;

/** HMAC-SHA256 expected in the x-token header of a CinetPay notification. */
export function cinetpayToken(body: Record<string, unknown>, secretKey: string): string {
  const data = CINETPAY_TOKEN_FIELDS.map((field) => String(body[field] ?? '')).join('');
  return createHmac('sha256', secretKey).update(data).digest('hex');
}

export function cinetpayTokenValid(body: Record<string, unknown>, token: string | undefined, secretKey: string): boolean {
  if (!token) return false;
  const expected = Buffer.from(cinetpayToken(body, secretKey));
  const received = Buffer.from(token.trim().toLowerCase());
  return expected.length === received.length && timingSafeEqual(expected, received);
}

/** CinetPay wallet codes → our payment methods. */
export function cinetpayMethod(code: string | undefined): string | undefined {
  const c = (code ?? '').toUpperCase();
  if (c.startsWith('OM')) return 'MOBILE_MONEY_ORANGE';
  if (c.startsWith('MOMO') || c.startsWith('MTN')) return 'MOBILE_MONEY_MTN';
  if (c.startsWith('FLOOZ') || c.startsWith('MOOV')) return 'MOBILE_MONEY_MOOV';
  if (c.startsWith('WAVE')) return 'WAVE';
  if (c.includes('VISA') || c.includes('MASTER') || c.includes('CARD')) return 'CARD';
  return undefined;
}

export interface CinetPayConfig {
  apiKey: string;
  siteId: string;
  secretKey: string;
  baseUrl?: string;
}

export class CinetPayGateway implements OnlineGateway {
  readonly name = 'cinetpay';
  private readonly baseUrl: string;

  constructor(
    private readonly config: CinetPayConfig,
    private readonly http: typeof fetch = fetch,
  ) {
    this.baseUrl = (config.baseUrl || 'https://api-checkout.cinetpay.com/v2').replace(/\/$/, '');
  }

  private async post(path: string, payload: Record<string, unknown>) {
    const res = await this.http(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apikey: this.config.apiKey, site_id: this.config.siteId, ...payload }),
      signal: AbortSignal.timeout(20000),
    });
    return (await res.json().catch(() => ({}))) as { code?: string; message?: string; description?: string; data?: Record<string, unknown> };
  }

  async createCheckout(request: CheckoutRequest) {
    const [firstName, ...rest] = (request.customer.name ?? '').split(' ');
    const body = await this.post('/payment', {
      transaction_id: request.transactionId,
      amount: request.amount,
      currency: 'XOF',
      description: request.description.replace(/[^\w À-ÿ.-]/g, ' ').slice(0, 120),
      notify_url: request.notifyUrl,
      return_url: request.returnUrl,
      channels: 'ALL',
      lang: 'fr',
      customer_name: rest.join(' ') || firstName || undefined,
      customer_surname: firstName || undefined,
      customer_phone_number: request.customer.phone || undefined,
      customer_email: request.customer.email || undefined,
    });
    const url = body.data?.payment_url;
    if (body.code !== '201' || typeof url !== 'string') {
      throw new Error(`CinetPay a refusé la création du paiement : ${body.description || body.message || body.code || 'réponse invalide'}`);
    }
    return { checkoutUrl: url };
  }

  async verify(transactionId: string): Promise<GatewayVerdict> {
    const body = await this.post('/payment/check', { transaction_id: transactionId });
    const data = body.data ?? {};
    const state = String(data.status ?? '');
    const verdict: GatewayVerdict = {
      status: body.code === '00' && state === 'ACCEPTED' ? 'SUCCESS' : state === 'REFUSED' || state === 'CANCELED' || state === 'CANCELLED' ? 'FAILED' : 'PENDING',
      amount: data.amount !== undefined ? Number(data.amount) : undefined,
      method: cinetpayMethod(data.payment_method as string | undefined),
      phone: [data.phone_prefix, data.phone_number].filter(Boolean).join('') || undefined,
      message: body.message,
    };
    return verdict;
  }
}

// ---------------------------------------------------------------- simulator (development and tests)

export interface SimulationStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
}

/**
 * Stands in for the gateway when no CinetPay keys are set: the "checkout page" is the payment page
 * of the web app, where the outcome is chosen by hand. Never available in production.
 */
export class SimulatedGateway implements OnlineGateway {
  readonly name = 'simulation';

  constructor(
    private readonly store: SimulationStore,
    private readonly frontendUrl: string,
  ) {}

  async createCheckout(request: CheckoutRequest) {
    await this.store.set(`paysim:${request.transactionId}`, JSON.stringify({ status: 'PENDING', amount: request.amount }), 86400);
    return { checkoutUrl: `${this.frontendUrl.replace(/\/$/, '')}/pay/${request.transactionId}` };
  }

  async decide(transactionId: string, outcome: 'SUCCESS' | 'FAILED', method: string, phone?: string) {
    const current = await this.verify(transactionId);
    await this.store.set(`paysim:${transactionId}`, JSON.stringify({ ...current, status: outcome, method, phone }), 86400);
  }

  async verify(transactionId: string): Promise<GatewayVerdict> {
    const raw = await this.store.get(`paysim:${transactionId}`);
    return raw ? (JSON.parse(raw) as GatewayVerdict) : { status: 'PENDING' };
  }
}

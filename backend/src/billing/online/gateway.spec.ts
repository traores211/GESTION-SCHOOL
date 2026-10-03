import { createHmac } from 'crypto';
import { CINETPAY_TOKEN_FIELDS, CinetPayGateway, SimulatedGateway, cinetpayMethod, cinetpayToken, cinetpayTokenValid } from './gateway';

const SECRET = 'test-secret-key';

function notification(overrides: Record<string, string> = {}) {
  return {
    cpm_site_id: '123456',
    cpm_trans_id: 'PAYABC',
    cpm_trans_date: '2026-10-03 10:00:00',
    cpm_amount: '25000',
    cpm_currency: 'XOF',
    signature: 'sig',
    payment_method: 'OM',
    cel_phone_num: '0700000000',
    cpm_phone_prefixe: '225',
    cpm_language: 'fr',
    cpm_version: 'V4',
    cpm_payment_config: 'SINGLE',
    cpm_page_action: 'PAYMENT',
    cpm_custom: '',
    cpm_designation: 'INV-2026-00001',
    cpm_error_message: '',
    ...overrides,
  };
}

function jsonFetch(replies: unknown[]) {
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  const http = (async (url: string, init: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init.body)) });
    return new Response(JSON.stringify(replies.shift()), { status: 200 });
  }) as unknown as typeof fetch;
  return { http, calls };
}

describe('CinetPay notification signature', () => {
  it('is the HMAC-SHA256 of the fields joined in the documented order', () => {
    const body = notification();
    const expected = createHmac('sha256', SECRET).update(CINETPAY_TOKEN_FIELDS.map((f) => body[f]).join('')).digest('hex');
    expect(cinetpayToken(body, SECRET)).toBe(expected);
    expect(cinetpayTokenValid(body, expected, SECRET)).toBe(true);
    expect(cinetpayTokenValid(body, expected.toUpperCase(), SECRET)).toBe(true);
  });

  it('rejects a missing, wrong or replayed-with-another-amount token', () => {
    const token = cinetpayToken(notification(), SECRET);
    expect(cinetpayTokenValid(notification(), undefined, SECRET)).toBe(false);
    expect(cinetpayTokenValid(notification(), 'abc', SECRET)).toBe(false);
    expect(cinetpayTokenValid(notification({ cpm_amount: '5' }), token, SECRET)).toBe(false);
    expect(cinetpayTokenValid(notification(), token, 'another-secret')).toBe(false);
  });
});

describe('cinetpayMethod', () => {
  it('maps wallet codes to payment methods', () => {
    expect(cinetpayMethod('OM')).toBe('MOBILE_MONEY_ORANGE');
    expect(cinetpayMethod('OMCI')).toBe('MOBILE_MONEY_ORANGE');
    expect(cinetpayMethod('MOMO')).toBe('MOBILE_MONEY_MTN');
    expect(cinetpayMethod('FLOOZ')).toBe('MOBILE_MONEY_MOOV');
    expect(cinetpayMethod('WAVECI')).toBe('WAVE');
    expect(cinetpayMethod('VISAM')).toBe('CARD');
    expect(cinetpayMethod(undefined)).toBeUndefined();
  });
});

describe('CinetPayGateway', () => {
  const config = { apiKey: 'key', siteId: '123456', secretKey: SECRET, baseUrl: 'https://cinetpay.test/v2' };

  it('creates a checkout in XOF with the callback addresses', async () => {
    const { http, calls } = jsonFetch([{ code: '201', message: 'CREATED', data: { payment_url: 'https://checkout.test/abc' } }]);
    const gateway = new CinetPayGateway(config, http);
    const result = await gateway.createCheckout({
      transactionId: 'PAYABC',
      amount: 25000,
      description: 'INV-2026-00001 Scolarité — 1er trimestre',
      customer: { name: 'Awa Koné', phone: '+2250700000000' },
      notifyUrl: 'https://api.test/payments/cinetpay/notify',
      returnUrl: 'https://api.test/payments/PAYABC/return',
    });
    expect(result.checkoutUrl).toBe('https://checkout.test/abc');
    expect(calls[0].url).toBe('https://cinetpay.test/v2/payment');
    expect(calls[0].body).toMatchObject({ apikey: 'key', site_id: '123456', transaction_id: 'PAYABC', amount: 25000, currency: 'XOF', notify_url: 'https://api.test/payments/cinetpay/notify' });
  });

  it('fails clearly when CinetPay refuses the payment', async () => {
    const { http } = jsonFetch([{ code: '608', message: 'MINIMUM_REQUIRED_FIELDS', description: 'amount invalide' }]);
    await expect(new CinetPayGateway(config, http).createCheckout({ transactionId: 'T', amount: 1, description: 'x', customer: {}, notifyUrl: 'n', returnUrl: 'r' })).rejects.toThrow('amount invalide');
  });

  it('reads the real state of a transaction', async () => {
    const { http, calls } = jsonFetch([
      { code: '00', message: 'SUCCES', data: { status: 'ACCEPTED', amount: '25000', payment_method: 'OM', phone_prefix: '225', phone_number: '0700000000' } },
      { code: '627', message: 'TRANSACTION_CANCEL', data: { status: 'REFUSED' } },
      { code: '662', message: 'WAITING_CUSTOMER_PAYMENT', data: { status: 'PENDING' } },
    ]);
    const gateway = new CinetPayGateway(config, http);
    await expect(gateway.verify('PAYABC')).resolves.toMatchObject({ status: 'SUCCESS', amount: 25000, method: 'MOBILE_MONEY_ORANGE', phone: '2250700000000' });
    await expect(gateway.verify('PAYABC')).resolves.toMatchObject({ status: 'FAILED' });
    await expect(gateway.verify('PAYABC')).resolves.toMatchObject({ status: 'PENDING' });
    expect(calls[0].url).toBe('https://cinetpay.test/v2/payment/check');
  });
});

describe('SimulatedGateway', () => {
  it('stays pending until an outcome is chosen', async () => {
    const memory = new Map<string, string>();
    const gateway = new SimulatedGateway({ get: async (k) => memory.get(k) ?? null, set: async (k, v) => void memory.set(k, v) }, 'http://localhost:1300/');
    const { checkoutUrl } = await gateway.createCheckout({ transactionId: 'PAY1', amount: 5000, description: 'x', customer: {}, notifyUrl: 'n', returnUrl: 'r' });
    expect(checkoutUrl).toBe('http://localhost:1300/pay/PAY1');
    await expect(gateway.verify('PAY1')).resolves.toMatchObject({ status: 'PENDING', amount: 5000 });
    await gateway.decide('PAY1', 'SUCCESS', 'WAVE');
    await expect(gateway.verify('PAY1')).resolves.toMatchObject({ status: 'SUCCESS', amount: 5000, method: 'WAVE' });
  });
});

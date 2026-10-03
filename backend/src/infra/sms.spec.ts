import { LogProvider, OrangeProvider, TwilioProvider, normalizePhone, providerFromEnv, smsSegments, toGsm } from './sms';
import { weekKey } from '../messaging/messaging.service';

function fakeHttp(replies: { status: number; body: unknown }[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  const http = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const reply = replies.shift()!;
    return new Response(JSON.stringify(reply.body), { status: reply.status });
  }) as unknown as typeof fetch;
  return { http, calls };
}

describe('normalizePhone', () => {
  it('adds the country code to local numbers', () => {
    expect(normalizePhone('07 01 02 03 04', '225')).toBe('+2250701020304');
    expect(normalizePhone('0701020304', '225')).toBe('+2250701020304');
  });

  it('keeps international numbers', () => {
    expect(normalizePhone('+225 07 01 02 03 04', '225')).toBe('+2250701020304');
    expect(normalizePhone('00225 0701020304', '225')).toBe('+2250701020304');
    expect(normalizePhone('2250701020304', '225')).toBe('+2250701020304');
    expect(normalizePhone('+33 6 12 34 56 78', '225')).toBe('+33612345678');
  });

  it('rejects what cannot be a phone number', () => {
    expect(normalizePhone('', '225')).toBeNull();
    expect(normalizePhone(null, '225')).toBeNull();
    expect(normalizePhone('12', '225')).toBeNull();
    expect(normalizePhone('pas de numéro', '225')).toBeNull();
  });
});

describe('message length', () => {
  it('keeps messages in the GSM alphabet', () => {
    expect(toGsm('Élève convoqué à l’entretien — reçu «ok»…')).toBe('Élève convoqué à l\'entretien - recu "ok"...');
    expect(toGsm('être, hôtel, île, ça, œuvre')).toBe('etre, hotel, ile, ca, oeuvre');
    expect(smsSegments(toGsm('Votre enfant a été noté absent, merci de prévenir l’établissement.'))).toBe(1);
  });

  it('counts the SMS billed', () => {
    expect(smsSegments('a'.repeat(160))).toBe(1);
    expect(smsSegments('a'.repeat(161))).toBe(2);
    expect(smsSegments('a'.repeat(307))).toBe(3);
    // One character outside GSM-7 switches the whole message to 70 characters per SMS.
    expect(smsSegments('ê'.repeat(70))).toBe(1);
    expect(smsSegments('ê'.repeat(71))).toBe(2);
    expect(smsSegments('€'.repeat(80))).toBe(1);
    expect(smsSegments('€'.repeat(81))).toBe(2);
  });
});

describe('providers', () => {
  it('uses the journal when no provider is configured', () => {
    expect(providerFromEnv({}).name).toBe('log');
    expect(providerFromEnv({ SMS_PROVIDER: 'orange' }).name).toBe('log');
    expect(providerFromEnv({ SMS_PROVIDER: 'orange', ORANGE_SMS_CLIENT_ID: 'a', ORANGE_SMS_CLIENT_SECRET: 'b', ORANGE_SMS_SENDER: 'tel:+2250000000000' }).name).toBe('orange');
    expect(providerFromEnv({ SMS_PROVIDER: 'twilio', TWILIO_ACCOUNT_SID: 'AC1', TWILIO_AUTH_TOKEN: 't', TWILIO_FROM: '+15550000000' }).name).toBe('twilio');
  });

  it('log provider accepts everything', async () => {
    await expect(new LogProvider().send()).resolves.toEqual({ ok: true, provider: 'log' });
  });

  it('Orange: gets a token once, then posts the message', async () => {
    const { http, calls } = fakeHttp([
      { status: 200, body: { access_token: 'tok', expires_in: 3600 } },
      { status: 201, body: { outboundSMSMessageRequest: { resourceURL: 'https://api.orange.com/smsmessaging/v1/outbound/tel:+225/requests/abc-123' } } },
      { status: 201, body: { outboundSMSMessageRequest: {} } },
    ]);
    const orange = new OrangeProvider({ clientId: 'id', clientSecret: 'secret', sender: 'tel:+2250000000000' }, http);
    await expect(orange.send('+2250701020304', 'Bonjour')).resolves.toEqual({ ok: true, provider: 'orange', providerId: 'abc-123' });
    await orange.send('+2250701020304', 'Encore');
    expect(calls).toHaveLength(3);
    expect(calls[0].url).toBe('https://api.orange.com/oauth/v3/token');
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe(`Basic ${Buffer.from('id:secret').toString('base64')}`);
    expect(calls[1].url).toBe('https://api.orange.com/smsmessaging/v1/outbound/tel%3A%2B2250000000000/requests');
    expect(JSON.parse(String(calls[1].init.body)).outboundSMSMessageRequest).toMatchObject({ address: 'tel:+2250701020304', senderAddress: 'tel:+2250000000000', outboundSMSTextMessage: { message: 'Bonjour' } });
  });

  it('Orange: reports the reason of a refusal', async () => {
    const { http } = fakeHttp([
      { status: 200, body: { access_token: 'tok' } },
      { status: 403, body: { requestError: { policyException: { text: 'Expired contract' } } } },
    ]);
    const orange = new OrangeProvider({ clientId: 'id', clientSecret: 'secret', sender: '+2250000000000' }, http);
    await expect(orange.send('+2250701020304', 'Bonjour')).resolves.toEqual({ ok: false, provider: 'orange', error: 'Expired contract' });
  });

  it('Twilio: SMS and WhatsApp use their own sender', async () => {
    const { http, calls } = fakeHttp([
      { status: 201, body: { sid: 'SM1' } },
      { status: 201, body: { sid: 'SM2' } },
      { status: 400, body: { message: 'Invalid number' } },
    ]);
    const twilio = new TwilioProvider({ accountSid: 'AC1', authToken: 'tok', from: '+15550000000', whatsappFrom: '+14150000000' }, http);
    await expect(twilio.send('+2250701020304', 'Bonjour', 'sms')).resolves.toMatchObject({ ok: true, providerId: 'SM1' });
    await twilio.send('+2250701020304', 'Bonjour', 'whatsapp');
    await expect(twilio.send('+225', 'x', 'sms')).resolves.toMatchObject({ ok: false, error: 'Invalid number' });
    expect(calls[0].url).toBe('https://api.twilio.com/2010-04-01/Accounts/AC1/Messages.json');
    expect(String(calls[0].init.body)).toBe('To=%2B2250701020304&From=%2B15550000000&Body=Bonjour');
    expect(String(calls[1].init.body)).toBe('To=whatsapp%3A%2B2250701020304&From=whatsapp%3A%2B14150000000&Body=Bonjour');
    expect(new TwilioProvider({ accountSid: 'AC1', authToken: 'tok', from: '+1555' }).channels).toEqual(['sms']);
  });
});

describe('weekKey', () => {
  it('gives the ISO week of a date', () => {
    expect(weekKey(new Date(2026, 9, 3))).toBe('2026-W40');
    expect(weekKey(new Date(2026, 0, 1))).toBe('2026-W01');
    expect(weekKey(new Date(2027, 0, 1))).toBe('2026-W53');
  });
});

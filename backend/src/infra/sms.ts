/** SMS / WhatsApp sending: phone numbers, message length and the providers (log, Orange, Twilio). */

export type Channel = 'sms' | 'whatsapp';

export interface SendResult {
  ok: boolean;
  provider: string;
  providerId?: string;
  error?: string;
}

export interface SmsProvider {
  readonly name: string;
  readonly channels: Channel[];
  send(to: string, text: string, channel: Channel): Promise<SendResult>;
}

/**
 * International number ("+2250701020304") from what the office typed. Local numbers get the default
 * country code (Côte d'Ivoire: 225, ten-digit numbers). Null when it cannot be a mobile number.
 */
export function normalizePhone(raw: string | null | undefined, countryCode = process.env.SMS_DEFAULT_COUNTRY_CODE || '225'): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  let digits = trimmed.replace(/\D/g, '');
  if (!digits) return null;
  if (trimmed.startsWith('+')) {
    // already international
  } else if (digits.startsWith('00')) {
    digits = digits.slice(2);
  } else if (digits.startsWith(countryCode) && digits.length > 10) {
    // country code typed without "+"
  } else {
    digits = countryCode + digits;
  }
  return digits.length >= 10 && digits.length <= 15 ? `+${digits}` : null;
}

const GSM7 = "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const GSM7_EXTENDED = '^{}\\[~]|€';

/**
 * Keeps a message in the GSM-7 alphabet (160 characters per SMS instead of 70): accents that GSM-7
 * does not have (ê, ô, î, ç…) lose their accent, typographic quotes and dashes become plain ones.
 */
export function toGsm(text: string): string {
  return Array.from(text.replace(/[’‘]/g, "'").replace(/[“”«»]/g, '"').replace(/[–—]/g, '-').replace(/…/g, '...').replace(/œ/g, 'oe').replace(/Œ/g, 'OE').replace(new RegExp('[\u00a0\u202f]', 'g'), ' '))
    .map((ch) => {
      if (GSM7.includes(ch) || GSM7_EXTENDED.includes(ch)) return ch;
      const plain = ch.normalize('NFD').replace(/[̀-ͯ]/g, '');
      return plain && Array.from(plain).every((c) => GSM7.includes(c)) ? plain : '?';
    })
    .join('');
}

/** Number of SMS billed for a text (GSM-7: 160 then 153 per part; other alphabets: 70 then 67). */
export function smsSegments(text: string): number {
  const chars = Array.from(text);
  const gsm = chars.every((c) => GSM7.includes(c) || GSM7_EXTENDED.includes(c));
  if (gsm) {
    const length = chars.reduce((n, c) => n + (GSM7_EXTENDED.includes(c) ? 2 : 1), 0);
    return length <= 160 ? 1 : Math.ceil(length / 153);
  }
  const units = text.length;
  return units <= 70 ? 1 : Math.ceil(units / 67);
}

// ---------------------------------------------------------------- providers

/** Development and demos: nothing leaves the server, the message is only kept in the journal. */
export class LogProvider implements SmsProvider {
  readonly name = 'log';
  readonly channels: Channel[] = ['sms', 'whatsapp'];

  async send(): Promise<SendResult> {
    return { ok: true, provider: this.name };
  }
}

export interface OrangeConfig {
  clientId: string;
  clientSecret: string;
  /** "tel:+2250000000000" (the number of the SMS offer). */
  sender: string;
  /** Sender name shown on the phone, when the offer allows it. */
  senderName?: string;
}

/** Orange SMS API (Côte d'Ivoire and other Orange countries). */
export class OrangeProvider implements SmsProvider {
  readonly name = 'orange';
  readonly channels: Channel[] = ['sms'];
  private token: { value: string; expiresAt: number } | null = null;

  constructor(
    private readonly config: OrangeConfig,
    private readonly http: typeof fetch = fetch,
  ) {}

  private async accessToken() {
    if (this.token && this.token.expiresAt > Date.now() + 60000) return this.token.value;
    const res = await this.http('https://api.orange.com/oauth/v3/token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: 'grant_type=client_credentials',
      signal: AbortSignal.timeout(15000),
    });
    const body = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error_description?: string };
    if (!res.ok || !body.access_token) throw new Error(`Orange : authentification refusée (${body.error_description || res.status})`);
    this.token = { value: body.access_token, expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000 };
    return this.token.value;
  }

  async send(to: string, text: string): Promise<SendResult> {
    try {
      const sender = this.config.sender.startsWith('tel:') ? this.config.sender : `tel:${this.config.sender}`;
      const res = await this.http(`https://api.orange.com/smsmessaging/v1/outbound/${encodeURIComponent(sender)}/requests`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${await this.accessToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          outboundSMSMessageRequest: {
            address: `tel:${to}`,
            senderAddress: sender,
            ...(this.config.senderName ? { senderName: this.config.senderName } : {}),
            outboundSMSTextMessage: { message: text },
          },
        }),
        signal: AbortSignal.timeout(15000),
      });
      const body = (await res.json().catch(() => ({}))) as { outboundSMSMessageRequest?: { resourceURL?: string }; requestError?: { serviceException?: { text?: string }; policyException?: { text?: string } } };
      if (!res.ok) {
        if (res.status === 401) this.token = null;
        return { ok: false, provider: this.name, error: body.requestError?.serviceException?.text || body.requestError?.policyException?.text || `HTTP ${res.status}` };
      }
      return { ok: true, provider: this.name, providerId: body.outboundSMSMessageRequest?.resourceURL?.split('/').pop() };
    } catch (err) {
      return { ok: false, provider: this.name, error: (err as Error).message };
    }
  }
}

export interface TwilioConfig {
  accountSid: string;
  authToken: string;
  from?: string;
  whatsappFrom?: string;
}

/** Twilio: SMS and WhatsApp (an approved WhatsApp sender is needed for the latter). */
export class TwilioProvider implements SmsProvider {
  readonly name = 'twilio';
  readonly channels: Channel[];

  constructor(
    private readonly config: TwilioConfig,
    private readonly http: typeof fetch = fetch,
  ) {
    this.channels = [...(config.from ? (['sms'] as Channel[]) : []), ...(config.whatsappFrom ? (['whatsapp'] as Channel[]) : [])];
  }

  async send(to: string, text: string, channel: Channel): Promise<SendResult> {
    const from = channel === 'whatsapp' ? this.config.whatsappFrom : this.config.from;
    if (!from) return { ok: false, provider: this.name, error: `Canal ${channel} non configuré` };
    const prefix = channel === 'whatsapp' ? 'whatsapp:' : '';
    try {
      const res = await this.http(`https://api.twilio.com/2010-04-01/Accounts/${this.config.accountSid}/Messages.json`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${this.config.accountSid}:${this.config.authToken}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ To: `${prefix}${to}`, From: `${prefix}${from.replace(/^whatsapp:/, '')}`, Body: text }).toString(),
        signal: AbortSignal.timeout(15000),
      });
      const body = (await res.json().catch(() => ({}))) as { sid?: string; message?: string };
      if (!res.ok) return { ok: false, provider: this.name, error: body.message || `HTTP ${res.status}` };
      return { ok: true, provider: this.name, providerId: body.sid };
    } catch (err) {
      return { ok: false, provider: this.name, error: (err as Error).message };
    }
  }
}

/** Provider chosen by SMS_PROVIDER (log, orange, twilio); falls back to the journal when keys are missing. */
export function providerFromEnv(env: NodeJS.ProcessEnv = process.env): SmsProvider {
  const wanted = (env.SMS_PROVIDER || 'log').toLowerCase();
  if (wanted === 'orange' && env.ORANGE_SMS_CLIENT_ID && env.ORANGE_SMS_CLIENT_SECRET && env.ORANGE_SMS_SENDER) {
    return new OrangeProvider({ clientId: env.ORANGE_SMS_CLIENT_ID, clientSecret: env.ORANGE_SMS_CLIENT_SECRET, sender: env.ORANGE_SMS_SENDER, senderName: env.ORANGE_SMS_SENDER_NAME });
  }
  if (wanted === 'twilio' && env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && (env.TWILIO_FROM || env.TWILIO_WHATSAPP_FROM)) {
    return new TwilioProvider({ accountSid: env.TWILIO_ACCOUNT_SID, authToken: env.TWILIO_AUTH_TOKEN, from: env.TWILIO_FROM, whatsappFrom: env.TWILIO_WHATSAPP_FROM });
  }
  return new LogProvider();
}

import { randomBytes } from 'crypto';
import { decryptResult, decryptValue, encryptData, encryptValue, isEncrypted, loadKey } from './field-crypto';

const key = randomBytes(32);

describe('field encryption', () => {
  it('round-trips text, with a different cipher text every time', () => {
    const a = encryptValue('Allergie aux arachides — EpiPen', key);
    const b = encryptValue('Allergie aux arachides — EpiPen', key);
    expect(isEncrypted(a)).toBe(true);
    expect(a).not.toBe(b);
    expect(a).not.toContain('arachides');
    expect(decryptValue(a, key)).toBe('Allergie aux arachides — EpiPen');
  });

  it('reads older plain values and never encrypts twice', () => {
    expect(decryptValue('Asthme', key)).toBe('Asthme');
    const once = encryptValue('Asthme', key);
    expect(encryptValue(once, key)).toBe(once);
  });

  it('refuses a tampered value or another key', () => {
    const value = encryptValue('Diabète', key);
    const [, , iv, tag, data] = value.split(':');
    const flipped = `enc:v1:${iv}:${tag}:${Buffer.from('autre chose').toString('base64')}`;
    expect(() => decryptValue(flipped, key)).toThrow();
    expect(() => decryptValue(value, randomBytes(32))).toThrow();
    expect(data).toBeTruthy();
  });

  it('accepts only a 32-byte base64 key', () => {
    expect(loadKey(key.toString('base64'))?.length).toBe(32);
    expect(loadKey('trop-court')).toBeNull();
    expect(loadKey('')).toBeNull();
  });

  it('encrypts only the sensitive columns of a model', () => {
    const data = { firstName: 'Awa', allergies: 'Arachides', specialNeeds: null, phone: '0701' };
    encryptData('Student', data, key);
    expect(data.firstName).toBe('Awa');
    expect(data.phone).toBe('0701');
    expect(isEncrypted(data.allergies)).toBe(true);
    expect(data.specialNeeds).toBeNull();

    const update = { totpSecret: { set: 'JBSWY3DPEHPK3PXP' } };
    encryptData('User', update, key);
    expect(isEncrypted(update.totpSecret.set)).toBe(true);

    const many = [{ allergies: 'A' }, { allergies: 'B' }];
    encryptData('Student', many, key);
    expect(many.every((r) => isEncrypted(r.allergies))).toBe(true);

    const other = { label: 'Scolarité' };
    encryptData('Invoice', other, key);
    expect(other.label).toBe('Scolarité');
  });

  it('decrypts results at any depth and keeps dates', () => {
    const when = new Date('2026-10-03T00:00:00Z');
    const result = {
      reference: 'INV-1',
      dueDate: when,
      student: { firstName: 'Awa', allergies: encryptValue('Arachides', key), parents: [{ phone: '0701' }] },
      list: [{ specialNeeds: encryptValue('Tiers-temps', key) }, null],
    };
    const out = decryptResult(result, key);
    expect(out.student.allergies).toBe('Arachides');
    expect(out.list[0]?.specialNeeds).toBe('Tiers-temps');
    expect(out.dueDate).toBe(when);
    expect(decryptResult(null, key)).toBeNull();
    expect(decryptResult(42, key)).toBe(42);
  });

  it('hides a value it cannot decrypt instead of showing the cipher text', () => {
    const out = decryptResult({ allergies: encryptValue('Arachides', randomBytes(32)) }, key);
    expect(out.allergies).toBeNull();
  });
});

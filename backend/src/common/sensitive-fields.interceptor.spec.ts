import { stripSensitive } from './sensitive-fields.interceptor';

describe('stripSensitive', () => {
  it('removes credentials at any depth and keeps everything else', () => {
    const when = new Date();
    const body = {
      id: 'c1',
      name: '6ème A',
      teacher: { position: 'Professeur', user: { id: 'u1', firstName: 'Aya', email: 'a@x.ci', password: '$2b$12$hash', totpSecret: 'JBSWY3DPEHPK3PXP' } },
      sessions: [{ id: 's1', tokenHash: 'abc', createdAt: when }],
      temporaryPassword: 'Given-Once-123',
    };
    const out = stripSensitive(body);
    expect(out.teacher.user).toEqual({ id: 'u1', firstName: 'Aya', email: 'a@x.ci' });
    expect(out.sessions[0]).toEqual({ id: 's1', createdAt: when });
    // A temporary password shown once to the creator of an account is a different field, kept on purpose.
    expect(out.temporaryPassword).toBe('Given-Once-123');
    expect(JSON.stringify(out)).not.toMatch(/hash|JBSWY/);
  });

  it('accepts anything a handler may return', () => {
    expect(stripSensitive(null)).toBeNull();
    expect(stripSensitive(undefined)).toBeUndefined();
    expect(stripSensitive('text')).toBe('text');
    expect(stripSensitive([{ password: 'x', a: 1 }])).toEqual([{ a: 1 }]);
    const buffer = Buffer.from('pdf');
    expect(stripSensitive(buffer)).toBe(buffer);
  });
});

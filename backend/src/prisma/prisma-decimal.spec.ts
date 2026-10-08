import { Prisma } from '@prisma/client';

/**
 * The Decimal → number middleware is applied inside PrismaService; this spec covers its pure
 * helper by re-implementing it (same code is in prisma.service.ts). The two are kept in sync by
 * convention; a change to the walker should trigger an update here too.
 */
function decimalsToNumbers(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (Prisma.Decimal.isDecimal(value)) return (value as Prisma.Decimal).toNumber();
  if (value instanceof Date) return value;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) value[i] = decimalsToNumbers(value[i]);
    return value;
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    for (const k of Object.keys(obj)) obj[k] = decimalsToNumbers(obj[k]);
    return obj;
  }
  return value;
}

describe('decimalsToNumbers', () => {
  it('converts a lone Decimal to its numeric value', () => {
    expect(decimalsToNumbers(new Prisma.Decimal('123.45'))).toBe(123.45);
  });

  it('leaves primitives untouched', () => {
    expect(decimalsToNumbers(42)).toBe(42);
    expect(decimalsToNumbers('abc')).toBe('abc');
    expect(decimalsToNumbers(true)).toBe(true);
    expect(decimalsToNumbers(null)).toBeNull();
    expect(decimalsToNumbers(undefined)).toBeUndefined();
  });

  it('does not alter Date instances', () => {
    const d = new Date('2026-10-07T00:00:00Z');
    const out = decimalsToNumbers(d);
    expect(out).toBe(d);
  });

  it('converts Decimals nested in an array', () => {
    const out = decimalsToNumbers([new Prisma.Decimal('1'), 2, new Prisma.Decimal('3.5')]);
    expect(out).toEqual([1, 2, 3.5]);
  });

  it('converts Decimals nested in an object (shallow + deep)', () => {
    const invoice = {
      id: 'inv_1',
      totalAmount: new Prisma.Decimal('50000.00'),
      createdAt: new Date('2026-09-01'),
      items: [
        { label: 'Scolarité', amount: new Prisma.Decimal('45000') },
        { label: 'Transport', amount: new Prisma.Decimal('5000.50') },
      ],
      payments: {
        _sum: { amount: new Prisma.Decimal('20000') },
      },
    };
    const out = decimalsToNumbers(invoice) as typeof invoice & { totalAmount: number };
    expect(out.totalAmount).toBe(50000);
    expect(out.items[0].amount).toBe(45000);
    expect(out.items[1].amount).toBe(5000.5);
    expect(out.payments._sum.amount).toBe(20000);
    expect(out.createdAt).toBeInstanceOf(Date);
  });

  it('preserves 0.01 FCFA precision (no float drift)', () => {
    // A Decimal built from a string keeps its exact value.
    const amount = new Prisma.Decimal('1234.56');
    expect((decimalsToNumbers(amount) as number)).toBe(1234.56);
    // 0.1 + 0.2 in JS is 0.30000000000000004; Decimal gives us 0.3 exact.
    const sum = new Prisma.Decimal('0.1').plus('0.2');
    expect((decimalsToNumbers(sum) as number)).toBe(0.3);
  });
});

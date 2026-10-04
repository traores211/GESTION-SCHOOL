import { ServiceUnavailableException } from '@nestjs/common';
import { SmartEntryService } from './smart-entry.service';

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);
const pupils = [
  { id: 'alice', firstName: 'Alice', lastName: 'Kouassi', matricule: 'M1' },
  { id: 'paul', firstName: 'Paul', lastName: 'Yao', matricule: 'M2' },
];
const user = { userId: 'u1', email: 't@x', role: 'ENSEIGNANT', schoolId: 's1' };

function service() {
  const prisma = { class: { findUnique: jest.fn().mockResolvedValue({ id: 'c1', name: '6ème A', schoolId: 's1', enrollments: pupils.map((student) => ({ student })) }) } };
  const scope = { assertClass: jest.fn().mockResolvedValue(undefined) };
  return { svc: new SmartEntryService(prisma as never, scope as never), prisma, scope };
}

describe('marks read on a photographed sheet', () => {
  it('turns the lines of the reader into a proposal and keeps its doubts', async () => {
    const { svc, scope } = service();
    svc.useReader({ isAvailable: () => true, read: async () => [{ name: 'KOUASSI Alice', score: '15', doubt: null }, { name: 'YAO Paul', score: null, doubt: '1 ou 7 ?' }, { name: 'DIALLO Fatou', score: '9', doubt: null }] });
    const result = await svc.sheetMarks(user, 'c1', { buffer: PNG, size: PNG.length });
    expect(scope.assertClass).toHaveBeenCalledWith(user, 'c1');
    expect(result.saved).toBe(false);
    expect(result.source).toBe('IMAGE');
    expect(result.rows[0]).toMatchObject({ studentId: 'alice', score: 15, confidence: 'SURE', name: 'Alice Kouassi' });
    expect(result.rows[1]).toMatchObject({ studentId: 'paul', score: null, confidence: 'A_VERIFIER' });
    expect(result.rows[1].issue).toContain('1 ou 7');
    expect(result.rows[2]).toMatchObject({ studentId: null, confidence: 'INCONNU' });
    expect(result.recognised).toBe(1);
    expect(result.toCheck).toBe(2);
  });

  it('says so plainly when image reading is not configured', async () => {
    const { svc } = service();
    svc.useReader({ isAvailable: () => false, read: async () => [] });
    await expect(svc.sheetMarks(user, 'c1', { buffer: PNG, size: PNG.length })).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('refuses a file that is not an image or a PDF before calling the reader', async () => {
    const { svc } = service();
    const read = jest.fn();
    svc.useReader({ isAvailable: () => true, read });
    await expect(svc.sheetMarks(user, 'c1', { buffer: Buffer.from('MZ not an image'), size: 15 })).rejects.toThrow('Format non accepté');
    expect(read).not.toHaveBeenCalled();
  });

  it('reports a failure of the reader instead of an empty proposal', async () => {
    const { svc } = service();
    svc.useReader({ isAvailable: () => true, read: async () => { throw new Error('quota dépassé'); } });
    await expect(svc.sheetMarks(user, 'c1', { buffer: PNG, size: PNG.length })).rejects.toThrow('quota dépassé');
  });

  it("does not show another school's class", async () => {
    const { svc } = service();
    await expect(svc.rollCall({ ...user, schoolId: 'other' }, 'c1', 'Alice présente')).rejects.toThrow('Classe introuvable');
  });
});

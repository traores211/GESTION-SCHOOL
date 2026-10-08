import { mkdtempSync, rmSync } from 'fs';
import { createServer, Server } from 'net';
import { tmpdir } from 'os';
import { join } from 'path';
import { StorageService, signV4 } from './storage.service';

describe('signV4', () => {
  it('matches the "GET Object" example of the AWS Signature Version 4 documentation', () => {
    const payloadHash = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
    const authorization = signV4({
      method: 'GET',
      path: '/test.txt',
      headers: { host: 'examplebucket.s3.amazonaws.com', range: 'bytes=0-9', 'x-amz-content-sha256': payloadHash, 'x-amz-date': '20130524T000000Z' },
      payloadHash,
      amzDate: '20130524T000000Z',
      region: 'us-east-1',
      accessKey: 'AKIAIOSFODNN7EXAMPLE',
      secretKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
    });
    expect(authorization).toBe(
      'AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request, ' +
        'SignedHeaders=host;range;x-amz-content-sha256;x-amz-date, ' +
        'Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41',
    );
  });
});

/** A fake clamd: answers INSTREAM with the given verdict once the zero-length terminator arrives. */
function fakeClamd(verdict: string): Promise<{ server: Server; port: number }> {
  return new Promise((resolve) => {
    const server = createServer((socket) => {
      let data = Buffer.alloc(0);
      socket.on('data', (chunk) => {
        data = Buffer.concat([data, chunk]);
        if (data.subarray(-4).equals(Buffer.alloc(4))) socket.end(`stream: ${verdict}\0`);
      });
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, port: (server.address() as { port: number }).port }));
  });
}

describe('StorageService (local driver)', () => {
  let dir: string;
  let storage: StorageService;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'storage-'));
    process.env.UPLOAD_DIR = dir;
    delete process.env.STORAGE_DRIVER;
    delete process.env.CLAMAV_HOST;
    storage = new StorageService();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    delete process.env.UPLOAD_DIR;
    delete process.env.CLAMAV_HOST;
    delete process.env.CLAMAV_PORT;
  });

  it('stores, reads back and removes a file', async () => {
    await storage.put('.admissions/a.pdf', Buffer.from('%PDF-1.4'), 'application/pdf');
    expect((await storage.get('.admissions/a.pdf')).toString()).toBe('%PDF-1.4');
    await storage.remove('.admissions/a.pdf');
    await expect(storage.get('.admissions/a.pdf')).rejects.toThrow();
    await expect(storage.remove('.admissions/a.pdf')).resolves.toBeUndefined();
  });

  it('refuses keys that escape the upload directory', async () => {
    await expect(storage.put('../evil.txt', Buffer.from('x'), 'text/plain')).rejects.toThrow('Chemin de fichier invalide');
  });

  it('gives /uploads paths for public files', () => {
    expect(storage.publicUrl('logo.png')).toBe('/uploads/logo.png');
  });

  it('accepts clean files and refuses infected ones when ClamAV is configured', async () => {
    const clean = await fakeClamd('OK');
    process.env.CLAMAV_HOST = '127.0.0.1';
    process.env.CLAMAV_PORT = String(clean.port);
    await expect(storage.put('ok.pdf', Buffer.from('%PDF clean'), 'application/pdf', { scan: true })).resolves.toBeUndefined();
    clean.server.close();

    const infected = await fakeClamd('Eicar-Test-Signature FOUND');
    process.env.CLAMAV_PORT = String(infected.port);
    await expect(storage.put('bad.pdf', Buffer.from('X5O!P%@AP'), 'application/pdf', { scan: true })).rejects.toThrow('Eicar-Test-Signature');
    infected.server.close();
    await expect(storage.get('bad.pdf')).rejects.toThrow();
  });
});

import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { createHash, createHmac } from 'crypto';
import { promises as fs } from 'fs';
import { connect } from 'net';
import { dirname, join, normalize } from 'path';

/**
 * File storage for uploaded documents. Two drivers:
 *  - local (default): files under UPLOAD_DIR, as before;
 *  - s3: any S3-compatible object store (AWS S3, MinIO, Backblaze B2, Scaleway…) set with
 *    S3_ENDPOINT, S3_BUCKET, S3_REGION, S3_ACCESS_KEY, S3_SECRET_KEY (requests signed with SigV4).
 * Optional antivirus: when CLAMAV_HOST is set, every stored document is scanned by clamd first.
 */
export interface SignInput {
  method: string;
  /** Already URI-encoded path, without query string. */
  path: string;
  /** Lower-case header names; all of them are signed. */
  headers: Record<string, string>;
  payloadHash: string;
  amzDate: string;
  region: string;
  accessKey: string;
  secretKey: string;
}

/** AWS Signature Version 4 "Authorization" header for an S3 request without query string. */
export function signV4({ method, path, headers, payloadHash, amzDate, region, accessKey, secretKey }: SignInput) {
  const date = amzDate.slice(0, 8);
  const signed = Object.keys(headers).sort();
  const canonical = [method, path, '', ...signed.map((h) => `${h}:${headers[h].trim()}`), '', signed.join(';'), payloadHash].join('\n');
  const scope = `${date}/${region}/s3/aws4_request`;
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, createHash('sha256').update(canonical).digest('hex')].join('\n');
  const hmac = (k: Buffer | string, v: string) => createHmac('sha256', k).update(v).digest();
  const signingKey = hmac(hmac(hmac(hmac(`AWS4${secretKey}`, date), region), 's3'), 'aws4_request');
  const signature = createHmac('sha256', signingKey).update(toSign).digest('hex');
  return `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, SignedHeaders=${signed.join(';')}, Signature=${signature}`;
}

@Injectable()
export class StorageService {
  private readonly logger = new Logger('Storage');
  readonly driver: 'local' | 's3' = process.env.STORAGE_DRIVER === 's3' ? 's3' : 'local';
  private readonly root = process.env.UPLOAD_DIR || join(process.cwd(), 'uploads');

  private localPath(key: string) {
    const path = normalize(join(this.root, key));
    if (!path.startsWith(normalize(this.root))) throw new BadRequestException('Chemin de fichier invalide');
    return path;
  }

  async put(key: string, body: Buffer, contentType: string, { scan = false } = {}) {
    if (scan) await this.assertClean(body);
    if (this.driver === 's3') {
      await this.s3('PUT', key, body, contentType);
      return;
    }
    const path = this.localPath(key);
    await fs.mkdir(dirname(path), { recursive: true });
    await fs.writeFile(path, body);
  }

  /** Public address of a file meant to be shown on the website (showcase images). */
  publicUrl(key: string) {
    if (this.driver === 'local') return `/uploads/${key}`;
    const base = process.env.S3_PUBLIC_URL || `${(process.env.S3_ENDPOINT || '').replace(/\/$/, '')}/${process.env.S3_BUCKET}`;
    return `${base.replace(/\/$/, '')}/${key}`;
  }

  async get(key: string): Promise<Buffer> {
    if (this.driver === 's3') return this.s3('GET', key);
    return fs.readFile(this.localPath(key));
  }

  async remove(key: string) {
    try {
      if (this.driver === 's3') await this.s3('DELETE', key);
      else await fs.unlink(this.localPath(key));
    } catch {
      // already gone
    }
  }

  // ---------------------------------------------------------------- S3 (SigV4)

  private async s3(method: 'PUT' | 'GET' | 'DELETE', key: string, body?: Buffer, contentType?: string): Promise<Buffer> {
    const endpoint = new URL(process.env.S3_ENDPOINT || `https://s3.${process.env.S3_REGION || 'us-east-1'}.amazonaws.com`);
    const bucket = process.env.S3_BUCKET!;
    const region = process.env.S3_REGION || 'us-east-1';
    const path = `/${bucket}/${key.split('/').map(encodeURIComponent).join('/')}`;
    const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
    const payloadHash = createHash('sha256').update(body ?? '').digest('hex');
    const headers: Record<string, string> = { host: endpoint.host, 'x-amz-content-sha256': payloadHash, 'x-amz-date': amzDate, ...(contentType ? { 'content-type': contentType } : {}) };
    const authorization = signV4({ method, path, headers, payloadHash, amzDate, region, accessKey: process.env.S3_ACCESS_KEY!, secretKey: process.env.S3_SECRET_KEY! });
    const res = await fetch(`${endpoint.origin}${path}`, {
      method,
      headers: { ...headers, Authorization: authorization },
      body: body ? new Uint8Array(body) : undefined,
    });
    if (!res.ok && !(method === 'DELETE' && res.status === 404)) {
      this.logger.error(`S3 ${method} ${key} → ${res.status}`);
      throw new Error(`Stockage indisponible (${res.status})`);
    }
    return Buffer.from(await res.arrayBuffer());
  }

  // ---------------------------------------------------------------- antivirus (clamd INSTREAM)

  /** Refuses infected files when CLAMAV_HOST is set; does nothing otherwise. */
  async assertClean(body: Buffer) {
    const host = process.env.CLAMAV_HOST;
    if (!host) return;
    const verdict = await this.clamScan(host, Number(process.env.CLAMAV_PORT || 3310), body).catch((err: Error) => {
      this.logger.error(`ClamAV injoignable : ${err.message}`);
      return process.env.CLAMAV_REQUIRED === 'true' ? 'ERROR' : 'OK';
    });
    if (verdict === 'ERROR') throw new BadRequestException("L'analyse antivirus est indisponible : réessayez plus tard");
    if (verdict !== 'OK') throw new BadRequestException(`Fichier refusé par l'antivirus (${verdict})`);
  }

  private clamScan(host: string, port: number, body: Buffer): Promise<string> {
    return new Promise((resolve, reject) => {
      const socket = connect({ host, port });
      let reply = '';
      socket.setTimeout(15000, () => socket.destroy(new Error('timeout')));
      socket.on('error', reject);
      socket.on('data', (d) => (reply += d.toString()));
      socket.on('end', () => {
        const text = reply.replace(/\0/g, '').trim();
        resolve(/: OK$/.test(text) ? 'OK' : text.replace(/^stream: /, '').replace(/ FOUND$/, '') || 'ERROR');
      });
      socket.on('connect', () => {
        socket.write('zINSTREAM\0');
        for (let i = 0; i < body.length; i += 64 * 1024) {
          const chunk = body.subarray(i, i + 64 * 1024);
          const size = Buffer.alloc(4);
          size.writeUInt32BE(chunk.length);
          socket.write(size);
          socket.write(chunk);
        }
        socket.end(Buffer.alloc(4));
      });
    });
  }
}

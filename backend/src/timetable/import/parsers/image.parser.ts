import { Logger } from '@nestjs/common';
import { mkdir } from 'fs/promises';
import { join } from 'path';
import { PSM, createWorker } from 'tesseract.js';
import { DetectedFile, DocumentParser, FileKind, ParsedDocument } from '../types';
import { PositionedText, tableFromPositions } from './layout';

const OCR_TIMEOUT_MS = 120_000;

/**
 * Local OCR (Tesseract, French model). The language model is downloaded once and cached in the
 * uploads volume. OCR output is always flagged for review: it misreads characters.
 */
export class ImageParser implements DocumentParser {
  readonly kinds: FileKind[] = ['image'];
  private readonly logger = new Logger('OCR');

  async parse(buffer: Buffer, file: DetectedFile): Promise<ParsedDocument> {
    const warnings = ['Texte obtenu par reconnaissance optique (OCR) : vérifiez chaque ligne avant validation.'];
    if (file.mime === 'image/webp') {
      return { kind: file.kind, tables: [], text: '', warnings: [...warnings, "L'OCR local ne lit pas le WebP : utilisez PNG/JPEG ou l'analyse IA."], binary: { buffer, mime: file.mime } };
    }
    try {
      const { words, text } = await withTimeout(this.recognize(buffer), OCR_TIMEOUT_MS);
      const rows = tableFromPositions(words);
      return { kind: file.kind, tables: rows.length ? [{ name: 'Image', rows }] : [], text, warnings, binary: { buffer, mime: file.mime } };
    } catch (err) {
      this.logger.warn(`OCR failed: ${(err as Error).message}`);
      return {
        kind: file.kind,
        tables: [],
        text: '',
        warnings: [...warnings, "La reconnaissance de texte a échoué sur cette image. Essayez une image plus nette ou l'analyse IA."],
        binary: { buffer, mime: file.mime },
      };
    }
  }

  private async recognize(buffer: Buffer): Promise<{ words: PositionedText[]; text: string }> {
    const cachePath = join(process.env.UPLOAD_DIR || join(process.cwd(), 'uploads'), '.ocr-cache');
    await mkdir(cachePath, { recursive: true });
    const worker = await createWorker('fra', 1, { cachePath });
    try {
      // Sparse-text segmentation: the default page layout analysis drops the cells of bordered tables.
      await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT, preserve_interword_spaces: '1' });
      // Word boxes are only returned when the block tree is asked for.
      const { data } = await worker.recognize(buffer, {}, { text: true, blocks: true });
      const words = (data.blocks ?? [])
        .flatMap((block) => block.paragraphs.flatMap((paragraph) => paragraph.lines.flatMap((line) => line.words)))
        .filter((w) => w.confidence > 30 && w.text.trim())
        .map((w) => ({
          text: w.text,
          x0: w.bbox.x0,
          x1: w.bbox.x1,
          y: (w.bbox.y0 + w.bbox.y1) / 2,
          height: w.bbox.y1 - w.bbox.y0,
        }));
      return { words, text: data.text ?? '' };
    } finally {
      await worker.terminate();
    }
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('OCR timeout')), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { Logger } from '@nestjs/common';
import { z } from 'zod';

const SheetSchema = z.object({
  lines: z.array(
    z.object({
      name: z.string().describe("Nom de l'élève tel qu'écrit sur la feuille"),
      score: z.string().nullable().describe('Note telle qu’écrite ("15", "12,5", "15/20"), null si absente ou illisible'),
      doubt: z.string().nullable().describe('Ce qui est incertain dans cette ligne (chiffre peu lisible, rature…), null si tout est net'),
    }),
  ),
});

const SYSTEM = `Tu lis une feuille de notes scolaire photographiée ou scannée (liste d'élèves avec une note par élève).
Règles strictes :
- Recopie uniquement ce qui est écrit. N'invente jamais un élève ni une note.
- Une note illisible, raturée ou ambiguë vaut null, et tu expliques le doute dans "doubt".
- Si deux chiffres sont possibles ("1" ou "7", "3" ou "8"), mets null et indique les deux lectures dans "doubt".
- Recopie les noms tels qu'écrits ; si un nom ressemble à un nom de la classe, utilise l'orthographe de la classe et signale-le dans "doubt".
- Ignore les en-têtes, totaux, moyennes de classe et signatures.`;

export interface SheetLine {
  name: string;
  score: string | null;
  doubt: string | null;
}

/**
 * Reads a photographed marks sheet with Claude, when ANTHROPIC_API_KEY is set. It only reads: the
 * lines go to the review screen, and the teacher validates before anything is recorded.
 */
export class SheetReader {
  private readonly logger = new Logger('SheetReader');
  private readonly model = process.env.SHEET_AI_MODEL || process.env.TIMETABLE_AI_MODEL || 'claude-opus-5';
  private client: Anthropic | null = null;

  isAvailable() {
    return !!process.env.ANTHROPIC_API_KEY;
  }

  async read(file: { buffer: Buffer; mime: string }, classNames: string[]): Promise<SheetLine[]> {
    this.client ??= new Anthropic();
    const content: Anthropic.ContentBlockParam[] = [
      file.mime === 'application/pdf'
        ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: file.buffer.toString('base64') } }
        : { type: 'image', source: { type: 'base64', media_type: file.mime as 'image/png' | 'image/jpeg', data: file.buffer.toString('base64') } },
      { type: 'text', text: `Élèves de la classe : ${classNames.join(', ') || 'liste inconnue'}\n\nRelève chaque ligne élève / note de cette feuille.` },
    ];
    const response = await this.client.messages.parse({
      model: this.model,
      max_tokens: 8000,
      system: SYSTEM,
      messages: [{ role: 'user', content }],
      output_config: { format: zodOutputFormat(SheetSchema) },
    });
    if (response.stop_reason === 'refusal') throw new Error("La lecture de l'image a été refusée");
    const parsed = response.parsed_output;
    if (!parsed) throw new Error("Lecture de l'image illisible");
    this.logger.log(`${parsed.lines.length} lignes lues (${response.usage.input_tokens} tokens en entrée)`);
    return parsed.lines;
  }
}

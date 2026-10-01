import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { Logger } from '@nestjs/common';
import { z } from 'zod';
import { Vocabulary } from '../extractors';
import { parseTime } from '../normalize';
import { DraftRow, ParsedDocument } from '../types';
import { DocumentAiProvider } from './document-ai';

const LessonSchema = z.object({
  day: z.number().int().nullable().describe('1 = lundi … 7 = dimanche, null si absent du document'),
  start: z.string().nullable().describe('Heure de début HH:MM, null si absente'),
  end: z.string().nullable().describe('Heure de fin HH:MM, null si absente'),
  className: z.string().nullable(),
  subject: z.string().nullable(),
  teacher: z.string().nullable(),
  room: z.string().nullable(),
  hoursPerWeek: z.number().nullable().describe('Volume hebdomadaire si le document donne des volumes et non des créneaux'),
  sourceText: z.string().describe('Extrait exact du document justifiant cette ligne'),
  doubt: z.string().nullable().describe("Ce qui est incertain dans cette ligne, null si tout est lisible"),
});

const ResultSchema = z.object({
  lessons: z.array(LessonSchema),
  notes: z.array(z.string()).describe('Contraintes ou remarques générales trouvées dans le document'),
});

const SYSTEM = `Tu extrais des emplois du temps scolaires à partir de documents (grilles, listes, photos).
Règles strictes :
- Ne renvoie que ce qui figure dans le document. N'invente jamais un enseignant, une salle, une classe ou un horaire.
- Une valeur illisible ou absente vaut null, et tu expliques le doute dans "doubt".
- Une cellule qui couvre plusieurs créneaux consécutifs est une seule séance (début du premier, fin du dernier).
- Ignore récréations, pauses et cases vides.
- Recopie les noms tels qu'écrits ; si un nom ressemble à un nom connu de l'établissement, utilise l'orthographe connue et signale-le dans "doubt".`;

const MAX_TEXT_CHARS = 120_000;

/** Claude-based analysis, enabled when ANTHROPIC_API_KEY is set. Model: TIMETABLE_AI_MODEL (default claude-opus-5). */
export class ClaudeDocumentAi implements DocumentAiProvider {
  readonly name = 'Claude';
  private readonly logger = new Logger('DocumentAI');
  private readonly model = process.env.TIMETABLE_AI_MODEL || 'claude-opus-5';
  private client: Anthropic | null = null;

  isAvailable() {
    return !!process.env.ANTHROPIC_API_KEY;
  }

  async extract(doc: ParsedDocument, vocab: Vocabulary, fileName: string): Promise<DraftRow[]> {
    this.client ??= new Anthropic();
    const known = [
      `Classes connues : ${vocab.classes.map((c) => c.name).join(', ') || 'aucune'}`,
      `Matières connues : ${vocab.subjects.map((c) => c.name).join(', ') || 'aucune'}`,
      `Enseignants connus : ${vocab.teachers.map((c) => c.name).join(', ') || 'aucun'}`,
      `Salles connues : ${vocab.rooms.map((c) => c.name).join(', ') || 'aucune'}`,
    ].join('\n');

    const content: Anthropic.ContentBlockParam[] = [];
    if (doc.binary && doc.binary.mime.startsWith('image/')) {
      content.push({
        type: 'image',
        source: { type: 'base64', media_type: doc.binary.mime as 'image/png' | 'image/jpeg' | 'image/webp', data: doc.binary.buffer.toString('base64') },
      });
    } else if (doc.binary && doc.binary.mime === 'application/pdf') {
      content.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: doc.binary.buffer.toString('base64') } });
    } else {
      const tables = doc.tables
        .map((t) => `## ${t.name ?? 'Tableau'}\n${t.rows.map((r) => r.join(' | ')).join('\n')}`)
        .join('\n\n');
      const body = tables || doc.text;
      if (body.length > MAX_TEXT_CHARS) {
        throw new Error(`Document trop long pour l'analyse IA (${body.length} caractères, maximum ${MAX_TEXT_CHARS})`);
      }
      content.push({ type: 'text', text: `Contenu du fichier « ${fileName} » :\n\n${body}` });
    }
    content.push({ type: 'text', text: `${known}\n\nExtrais toutes les séances de cet emploi du temps.` });

    const response = await this.client.messages.parse({
      model: this.model,
      max_tokens: 16000,
      system: SYSTEM,
      messages: [{ role: 'user', content }],
      output_config: { format: zodOutputFormat(ResultSchema) },
    });
    if (response.stop_reason === 'refusal') throw new Error("L'analyse IA a été refusée pour ce document");
    if (response.stop_reason === 'max_tokens') throw new Error("Document trop volumineux : l'analyse IA a été interrompue");
    const parsed = response.parsed_output;
    if (!parsed) throw new Error("Réponse de l'IA illisible");
    this.logger.log(`${parsed.lessons.length} séances extraites de ${fileName} (${response.usage.input_tokens} tokens en entrée)`);

    return parsed.lessons.map((l, i) => {
      const start = l.start ? parseTime(l.start) : null;
      const end = l.end ? parseTime(l.end) : null;
      const issues = ["Interprété par l'IA : à vérifier"];
      if (l.doubt) issues.push(l.doubt);
      if (l.start && !start) issues.push(`Horaire illisible : « ${l.start} »`);
      return {
        id: `ai${i + 1}`,
        dayOfWeek: l.day && l.day >= 1 && l.day <= 7 ? l.day : null,
        startTime: start,
        endTime: end,
        className: l.className,
        subjectName: l.subject,
        teacherName: l.teacher,
        roomName: l.room,
        hoursPerWeek: l.hoursPerWeek && !l.day ? l.hoursPerWeek : null,
        source: 'Analyse IA',
        raw: l.sourceText,
        method: 'ai' as const,
        issues,
      };
    });
  }
}

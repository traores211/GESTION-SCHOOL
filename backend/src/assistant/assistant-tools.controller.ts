import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Request } from 'express';
import { AssistantToolsService } from './assistant-tools.service';
import { ToolClaims, ToolTokenGuard } from './tool-token';

type ToolRequest = Request & { toolClaims: ToolClaims };

/**
 * Tool endpoints called by the Dify agent (custom tool imported from /assistant/tools/openapi.json).
 * Authentication is the per-message `context_token`, never a login session.
 */
@Controller('assistant/tools')
@ApiExcludeController()
export class AssistantToolsController {
  constructor(private readonly tools: AssistantToolsService) {}

  /** OpenAPI 3 schema to import in Dify (Outils > Outil personnalisé > Importer depuis une URL). */
  @Get('openapi.json')
  openapi(@Req() req: Request) {
    const base = process.env.ASSISTANT_TOOLS_PUBLIC_URL || `${process.env.API_URL || `${req.protocol}://${req.get('host')}`}/api`;
    return toolsOpenApi(base);
  }

  @Get('overview')
  @UseGuards(ToolTokenGuard)
  overview(@Req() req: ToolRequest) {
    return this.tools.overview(req.toolClaims);
  }

  @Get('students')
  @UseGuards(ToolTokenGuard)
  students(@Req() req: ToolRequest, @Query('q') q: string) {
    return this.tools.searchStudents(req.toolClaims, q);
  }

  @Get('student')
  @UseGuards(ToolTokenGuard)
  student(@Req() req: ToolRequest, @Query('matricule') matricule: string) {
    return this.tools.studentSummary(req.toolClaims, matricule);
  }

  @Get('overdue')
  @UseGuards(ToolTokenGuard)
  overdue(@Req() req: ToolRequest, @Query('limit') limit?: string) {
    return this.tools.overdue(req.toolClaims, Number(limit) || 10);
  }

  @Get('attendance')
  @UseGuards(ToolTokenGuard)
  attendance(@Req() req: ToolRequest, @Query('class_name') className?: string, @Query('days') days?: string) {
    return this.tools.attendance(req.toolClaims, className || undefined, Number(days) || 30);
  }

  @Get('timetable')
  @UseGuards(ToolTokenGuard)
  timetable(@Req() req: ToolRequest, @Query('class_name') className?: string, @Query('day') day?: string) {
    return this.tools.timetable(req.toolClaims, className || undefined, Number(day) || undefined);
  }
}

const token = {
  name: 'context_token',
  in: 'query',
  required: true,
  description: "Jeton de contexte fourni dans la variable {{context_token}} de la conversation. Toujours le recopier tel quel.",
  schema: { type: 'string' },
};

function op(operationId: string, summary: string, description: string, params: object[] = []) {
  return {
    get: {
      operationId,
      summary,
      description,
      parameters: [token, ...params],
      responses: { '200': { description: 'Résultat JSON', content: { 'application/json': { schema: { type: 'object' } } } } },
    },
  };
}

export function toolsOpenApi(serverUrl: string) {
  return {
    openapi: '3.0.1',
    info: { title: 'School ERP — outils de l’agent', version: '1.0.0', description: "Lecture des données de l'établissement de l'utilisateur connecté." },
    servers: [{ url: serverUrl }],
    paths: {
      '/assistant/tools/overview': op('school_overview', "Chiffres clés de l'établissement", 'Effectifs, classes, présence des 30 derniers jours, admissions en cours et, selon le profil, facturation et impayés.'),
      '/assistant/tools/students': op('search_students', 'Rechercher des élèves', 'Recherche par nom, prénom ou matricule. Renvoie au plus 10 élèves avec leur classe.', [
        { name: 'q', in: 'query', required: true, description: 'Nom, prénom ou matricule (au moins 2 caractères)', schema: { type: 'string' } },
      ]),
      '/assistant/tools/student': op('student_summary', "Fiche d'un élève", "Classe, présence depuis la rentrée, moyennes du dernier trimestre et, selon le profil, factures et reste dû.", [
        { name: 'matricule', in: 'query', required: true, description: "Matricule exact de l'élève (obtenu avec search_students)", schema: { type: 'string' } },
      ]),
      '/assistant/tools/overdue': op('overdue_invoices', 'Factures échues impayées', 'Liste des plus gros impayés avec le téléphone du parent. Réservé à la direction, au secrétariat et à la comptabilité.', [
        { name: 'limit', in: 'query', required: false, description: 'Nombre de factures à renvoyer (1 à 25, 10 par défaut)', schema: { type: 'integer' } },
      ]),
      '/assistant/tools/attendance': op('attendance_report', 'Présence par classe', 'Taux de présence par classe sur une période et élèves les plus absents.', [
        { name: 'class_name', in: 'query', required: false, description: 'Nom de la classe, par exemple « 6ème A » (toutes les classes si vide)', schema: { type: 'string' } },
        { name: 'days', in: 'query', required: false, description: 'Période en jours (30 par défaut)', schema: { type: 'integer' } },
      ]),
      '/assistant/tools/timetable': op('timetable_day', "Emploi du temps d'un jour", 'Séances d’un jour de la semaine, pour une classe ou tout l’établissement.', [
        { name: 'class_name', in: 'query', required: false, description: 'Nom de la classe (toutes si vide)', schema: { type: 'string' } },
        { name: 'day', in: 'query', required: false, description: "Jour de la semaine : 1 = lundi … 7 = dimanche (aujourd'hui par défaut)", schema: { type: 'integer' } },
      ]),
    },
  };
}

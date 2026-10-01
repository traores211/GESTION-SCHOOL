import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';

/**
 * Turns the Prisma errors a user can trigger (duplicate, missing record, record still referenced)
 * into explicit 4xx responses instead of opaque 500s. Anything else stays a logged 500.
 */
@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('Prisma');

  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const [status, message] = this.map(exception);
    if (status === HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(`${exception.code}: ${exception.message}`);
    }
    response.status(status).json({ statusCode: status, message, code: exception.code });
  }

  private map(e: Prisma.PrismaClientKnownRequestError): [number, string] {
    switch (e.code) {
      case 'P2002': {
        const target = (e.meta?.target as string[] | string | undefined) ?? '';
        const fields = Array.isArray(target) ? target.join(', ') : target;
        return [HttpStatus.CONFLICT, `Un enregistrement existe déjà avec cette valeur${fields ? ` (${fields})` : ''}`];
      }
      case 'P2025':
        return [HttpStatus.NOT_FOUND, 'Enregistrement introuvable'];
      case 'P2003':
      case 'P2014':
        return [HttpStatus.CONFLICT, "Opération impossible : l'enregistrement est lié à d'autres données"];
      case 'P2000':
        return [HttpStatus.BAD_REQUEST, 'Une valeur saisie est trop longue'];
      default:
        return [HttpStatus.INTERNAL_SERVER_ERROR, 'Erreur interne de base de données'];
    }
  }
}

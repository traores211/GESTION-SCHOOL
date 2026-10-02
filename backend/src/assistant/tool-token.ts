import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { jwtSecret } from '../auth/jwt-secret';
import { FINANCE, OFFICE } from '../common/roles';

/**
 * Short-lived token that lets the Dify agent call our tools on behalf of one user.
 * It is created when the user sends a message, passed to Dify as the `context_token` input, and the agent
 * hands it back on every tool call. It carries the user's school and role, so the agent can never read
 * another school's data nor more than the user may see. Signed with a key distinct from login tokens.
 */
export interface ToolClaims {
  sub: string;
  schoolId: string;
  role: string;
  scope: 'assistant-tools';
}

export const TOOL_TOKEN_TTL = '20m';
export const toolSecret = () => `${jwtSecret()}:assistant-tools`;

export function canSeeFinance(role: string) {
  return (FINANCE as readonly string[]).includes(role) || (OFFICE as readonly string[]).includes(role);
}

@Injectable()
export class ToolTokenGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    const raw =
      (req.headers['x-context-token'] as string | undefined) ||
      (typeof req.query?.context_token === 'string' ? req.query.context_token : undefined) ||
      (typeof req.body?.context_token === 'string' ? req.body.context_token : undefined);
    if (!raw) throw new UnauthorizedException('context_token manquant');
    let claims: ToolClaims;
    try {
      claims = this.jwt.verify<ToolClaims>(raw.trim(), { secret: toolSecret() });
    } catch {
      throw new UnauthorizedException('context_token invalide ou expiré');
    }
    if (claims.scope !== 'assistant-tools' || !claims.schoolId) throw new ForbiddenException('Jeton non autorisé pour les outils');
    req.toolClaims = claims;
    return true;
  }
}

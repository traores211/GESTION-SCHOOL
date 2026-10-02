import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/current-user.decorator';
import { ROLE_LABELS } from './role-labels';
import { AssistantEvent, AssistantMode, difyConfig, streamChat } from './dify.client';
import { TOOL_TOKEN_TTL, ToolClaims, toolSecret } from './tool-token';

@Injectable()
export class AssistantService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  status() {
    const cfg = difyConfig();
    return {
      provider: 'Dify',
      apiUrl: cfg.apiUrl,
      chatbot: !!cfg.keys.chatbot,
      agent: !!cfg.keys.agent,
    };
  }

  /**
   * One chat turn, relayed to the Dify app of the requested mode. The app receives, as inputs, who is asking
   * (name, role, school) and, for the agent, a short-lived token it must pass back to our tools.
   */
  async *chat(user: AuthUser, mode: AssistantMode, message: string, conversationId: string | undefined, signal: AbortSignal): AsyncGenerator<AssistantEvent> {
    const cfg = difyConfig();
    const apiKey = cfg.keys[mode];
    if (!apiKey) {
      yield {
        type: 'error',
        message:
          mode === 'agent'
            ? "L'agent n'est pas configuré : renseignez DIFY_AGENT_API_KEY (voir dify/README.md)."
            : "Le chatbot n'est pas configuré : renseignez DIFY_CHATBOT_API_KEY (voir dify/README.md).",
      };
      return;
    }

    const [profile, school] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: user.userId }, select: { firstName: true, lastName: true } }),
      user.schoolId ? this.prisma.school.findUnique({ where: { id: user.schoolId }, select: { name: true, city: true } }) : null,
    ]);

    const inputs: Record<string, string> = {
      user_name: profile ? `${profile.firstName} ${profile.lastName}` : user.email,
      user_role: ROLE_LABELS[user.role] || user.role,
      school_name: school?.name || 'School ERP',
      school_city: school?.city || '',
      today: new Date().toISOString().slice(0, 10),
    };
    if (mode === 'agent' && user.schoolId) {
      const claims: ToolClaims = { sub: user.userId, schoolId: user.schoolId, role: user.role, scope: 'assistant-tools' };
      inputs.context_token = this.jwt.sign(claims, { secret: toolSecret(), expiresIn: TOOL_TOKEN_TTL });
    }

    // Dify scopes conversations by "user"; one stable id per account keeps histories apart.
    yield* streamChat(cfg, { apiKey, query: message, user: `school-erp:${user.userId}`, conversationId, inputs, signal });
  }
}

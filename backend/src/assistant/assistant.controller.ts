import { Body, Controller, Get, HttpException, HttpStatus, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { ALL_STAFF } from '../common/roles';
import { CurrentUser, AuthUser } from '../common/current-user.decorator';
import { AssistantService } from './assistant.service';
import { AssistantChatDto } from './dto/chat.dto';

const WINDOW_MS = 60_000;
const MAX_MESSAGES_PER_WINDOW = 20;

@Controller('assistant')
@ApiTags('Assistant (Dify)')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...ALL_STAFF)
@ApiBearerAuth()
export class AssistantController {
  private readonly recent = new Map<string, number[]>();

  constructor(private readonly assistant: AssistantService) {}

  @Get('status')
  status() {
    return this.assistant.status();
  }

  /**
   * Streams one assistant turn as Server-Sent Events: `token`, `thought` (agent tool calls), `end`, `error`.
   * The browser reads it with fetch() so the JWT stays in the Authorization header.
   */
  @Post('chat')
  async chat(@CurrentUser() user: AuthUser, @Body() dto: AssistantChatDto, @Req() req: Request, @Res() res: Response) {
    this.throttle(user.userId);

    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const abort = new AbortController();
    req.on('close', () => abort.abort());

    try {
      for await (const event of this.assistant.chat(user, dto.mode, dto.message.trim(), dto.conversationId, abort.signal)) {
        if (abort.signal.aborted) break;
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      }
    } finally {
      res.end();
    }
  }

  /** Simple per-user limit: the assistant costs model tokens on every message. */
  private throttle(userId: string) {
    const now = Date.now();
    const list = (this.recent.get(userId) || []).filter((t) => now - t < WINDOW_MS);
    if (list.length >= MAX_MESSAGES_PER_WINDOW) {
      throw new HttpException("Trop de messages à l'assistant en peu de temps. Patientez une minute.", HttpStatus.TOO_MANY_REQUESTS);
    }
    list.push(now);
    this.recent.set(userId, list);
  }
}

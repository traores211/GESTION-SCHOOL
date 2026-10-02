import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AssistantEvent, streamChat } from './dify.client';
import { canSeeFinance, ToolTokenGuard, toolSecret } from './tool-token';

const config = { apiUrl: 'http://dify.test/v1', keys: { chatbot: 'k', agent: 'k' }, timeoutMs: 5000 };

function sseResponse(events: object[], status = 200) {
  const body = events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('');
  // Split mid-event to check the parser reassembles chunks.
  const chunks = [body.slice(0, 37), body.slice(37)];
  const stream = new ReadableStream({
    start(controller) {
      chunks.forEach((c) => controller.enqueue(new TextEncoder().encode(c)));
      controller.close();
    },
  });
  return new Response(stream, { status, headers: { 'Content-Type': 'text/event-stream' } });
}

async function collect(gen: AsyncGenerator<AssistantEvent>) {
  const out: AssistantEvent[] = [];
  for await (const e of gen) out.push(e);
  return out;
}

describe('Dify client', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  it('maps Dify stream events (agent thoughts, tokens, end) and ignores pings', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      sseResponse([
        { event: 'ping' },
        { event: 'agent_thought', id: 't1', tool: 'school_overview', tool_input: { context_token: 'x' }, observation: '' },
        { event: 'agent_thought', id: 't1', tool: 'school_overview', tool_input: '{}', observation: '{"eleves":10}' },
        { event: 'agent_message', answer: 'Dix ' },
        { event: 'agent_message', answer: 'élèves.' },
        { event: 'message_end', conversation_id: 'c1', message_id: 'm1', metadata: { usage: { total_tokens: 42 } } },
      ]),
    ) as any;
    const events = await collect(streamChat(config, { apiKey: 'k', query: 'q', user: 'u', inputs: {} }));
    expect(events.map((e) => e.type)).toEqual(['thought', 'thought', 'token', 'token', 'end']);
    expect(events.filter((e) => e.type === 'token').map((e: any) => e.text).join('')).toBe('Dix élèves.');
    expect(events[4]).toMatchObject({ conversationId: 'c1', messageId: 'm1', usage: { tokens: 42 } });
    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    expect(body).toMatchObject({ query: 'q', user: 'u', response_mode: 'streaming' });
  });

  it('turns HTTP errors and network failures into a readable error event', async () => {
    global.fetch = jest.fn().mockResolvedValue(new Response('{"code":"unauthorized"}', { status: 401 })) as any;
    const [unauthorized] = await collect(streamChat(config, { apiKey: 'bad', query: 'q', user: 'u', inputs: {} }));
    expect(unauthorized).toMatchObject({ type: 'error' });
    expect((unauthorized as any).message).toMatch(/clé d'API Dify/);

    global.fetch = jest.fn().mockRejectedValue(new TypeError('fetch failed')) as any;
    const [down] = await collect(streamChat(config, { apiKey: 'k', query: 'q', user: 'u', inputs: {} }));
    expect((down as any).message).toMatch(/injoignable/);
  });
});

describe('Tool token guard', () => {
  const jwt = new JwtService({});
  const guard = new ToolTokenGuard(jwt);
  const ctx = (req: object) => ({ switchToHttp: () => ({ getRequest: () => req }) }) as any;

  it('accepts a tool token and exposes its claims', () => {
    const token = jwt.sign({ sub: 'u1', schoolId: 's1', role: 'DIRECTOR', scope: 'assistant-tools' }, { secret: toolSecret(), expiresIn: '5m' });
    const req: any = { headers: {}, query: { context_token: token } };
    expect(guard.canActivate(ctx(req))).toBe(true);
    expect(req.toolClaims).toMatchObject({ schoolId: 's1', role: 'DIRECTOR' });
  });

  it('rejects a missing token, a forged token and a login token signed with another key', () => {
    expect(() => guard.canActivate(ctx({ headers: {}, query: {} }))).toThrow(UnauthorizedException);
    expect(() => guard.canActivate(ctx({ headers: {}, query: { context_token: 'abc' } }))).toThrow(UnauthorizedException);
    const loginToken = jwt.sign({ sub: 'u1', schoolId: 's1', role: 'DIRECTOR' }, { secret: 'dev-secret' });
    expect(() => guard.canActivate(ctx({ headers: { 'x-context-token': loginToken }, query: {} }))).toThrow(UnauthorizedException);
  });

  it('keeps finance data to management, office and accounting roles', () => {
    expect(canSeeFinance('COMPTABLE')).toBe(true);
    expect(canSeeFinance('SECRETARY')).toBe(true);
    expect(canSeeFinance('ENSEIGNANT')).toBe(false);
    expect(canSeeFinance('PARENT')).toBe(false);
  });
});

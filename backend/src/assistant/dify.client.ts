import { Logger } from '@nestjs/common';

/**
 * Minimal client for the Dify application API (cloud.dify.ai or self-hosted).
 * Docs: POST {DIFY_API_URL}/chat-messages with an app API key, streaming responses as Server-Sent Events.
 * One app key per assistant mode: a chat app for the chatbot, an agent app (with our tools) for the agent.
 */

export type AssistantMode = 'chatbot' | 'agent';

export interface DifyConfig {
  apiUrl: string;
  keys: Record<AssistantMode, string | undefined>;
  timeoutMs: number;
}

export function difyConfig(): DifyConfig {
  return {
    apiUrl: (process.env.DIFY_API_URL || 'https://api.dify.ai/v1').replace(/\/+$/, ''),
    keys: {
      chatbot: process.env.DIFY_CHATBOT_API_KEY || undefined,
      agent: process.env.DIFY_AGENT_API_KEY || undefined,
    },
    timeoutMs: Number(process.env.DIFY_TIMEOUT_MS) || 120_000,
  };
}

/** Normalised events sent to the browser, independent of Dify's wire format. */
export type AssistantEvent =
  | { type: 'token'; text: string }
  | { type: 'thought'; id: string; tool: string; input: string; observation: string; thought: string }
  | { type: 'end'; conversationId: string; messageId: string; usage?: { tokens?: number; latency?: number } }
  | { type: 'error'; message: string };

interface ChatRequest {
  apiKey: string;
  query: string;
  user: string;
  conversationId?: string;
  inputs: Record<string, string>;
  signal?: AbortSignal;
}

const logger = new Logger('Dify');

/** Streams a chat turn from Dify and yields normalised events. Never throws: failures become an 'error' event. */
export async function* streamChat(config: DifyConfig, req: ChatRequest): AsyncGenerator<AssistantEvent> {
  const timeout = AbortSignal.timeout(config.timeoutMs);
  const signal = req.signal ? AbortSignal.any([req.signal, timeout]) : timeout;
  let res: Response;
  try {
    res = await fetch(`${config.apiUrl}/chat-messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${req.apiKey}`, 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify({
        inputs: req.inputs,
        query: req.query,
        response_mode: 'streaming',
        conversation_id: req.conversationId || '',
        user: req.user,
        files: [],
      }),
      signal,
    });
  } catch (err) {
    logger.warn(`Dify unreachable at ${config.apiUrl}: ${(err as Error).message}`);
    yield { type: 'error', message: "Le service d'assistant (Dify) est injoignable pour le moment." };
    return;
  }

  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => '');
    logger.warn(`Dify HTTP ${res.status}: ${detail.slice(0, 300)}`);
    yield { type: 'error', message: difyErrorMessage(res.status, detail) };
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let sep: number;
      // SSE events are separated by a blank line; each carries one "data: {json}" line.
      while ((sep = buffer.indexOf('\n\n')) !== -1) {
        const raw = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        const data = raw
          .split('\n')
          .filter((l) => l.startsWith('data:'))
          .map((l) => l.slice(5).trim())
          .join('');
        if (!data) continue;
        const event = mapEvent(data);
        if (event) yield event;
      }
    }
  } catch (err) {
    if ((err as Error).name !== 'AbortError') logger.warn(`Dify stream interrupted: ${(err as Error).message}`);
    yield { type: 'error', message: "La réponse de l'assistant a été interrompue." };
  }
}

function mapEvent(data: string): AssistantEvent | null {
  let e: any;
  try {
    e = JSON.parse(data);
  } catch {
    return null;
  }
  switch (e.event) {
    case 'message':
    case 'agent_message':
      return e.answer ? { type: 'token', text: e.answer } : null;
    case 'agent_thought':
      // Dify sends the same thought several times as it progresses; the client keeps the latest by id.
      if (!e.tool && !e.observation) return null;
      return {
        type: 'thought',
        id: e.id || `${e.position}`,
        tool: e.tool || '',
        input: typeof e.tool_input === 'string' ? e.tool_input : JSON.stringify(e.tool_input ?? ''),
        observation: e.observation || '',
        thought: e.thought || '',
      };
    case 'message_end':
      return {
        type: 'end',
        conversationId: e.conversation_id,
        messageId: e.message_id || e.id,
        usage: { tokens: e.metadata?.usage?.total_tokens, latency: e.metadata?.usage?.latency },
      };
    case 'error':
      return { type: 'error', message: e.message || "L'assistant a rencontré une erreur." };
    default:
      return null; // ping, workflow_*, node_*, message_replace, tts…
  }
}

function difyErrorMessage(status: number, detail: string) {
  if (status === 401) return "La clé d'API Dify est refusée : vérifiez DIFY_CHATBOT_API_KEY / DIFY_AGENT_API_KEY.";
  if (status === 404) return "Conversation introuvable côté Dify : recommencez une nouvelle conversation.";
  if (status === 429) return "Le quota de l'assistant est atteint, réessayez dans un instant.";
  if (/app_unavailable|not_chat_app/.test(detail)) return "L'application Dify configurée n'est pas une application de conversation.";
  return `Le service d'assistant a répondu par une erreur (${status}).`;
}

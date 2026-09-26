import Anthropic from '@anthropic-ai/sdk';

/**
 * Minimal seam over the Messages API so the agent loop can be tested with a scripted fake,
 * and the provider swapped without touching the loop.
 */
export interface LlmClient {
  readonly model: string;
  create(params: {
    system: string;
    messages: Anthropic.Beta.BetaMessageParam[];
    tools: Anthropic.Beta.BetaTool[];
  }): Promise<Anthropic.Beta.BetaMessage>;
}

export const LLM_CLIENT = Symbol('LLM_CLIENT');

/** Claude via the official SDK. Enabled only when AI is configured (see isAiConfigured). */
export class AnthropicLlmClient implements LlmClient {
  private readonly client = new Anthropic(); // resolves ANTHROPIC_API_KEY / auth profile from the environment
  readonly model = process.env.AI_MODEL || 'claude-opus-5';

  async create(params: { system: string; messages: Anthropic.Beta.BetaMessageParam[]; tools: Anthropic.Beta.BetaTool[] }) {
    return this.client.beta.messages.create({
      model: this.model,
      max_tokens: 16000,
      thinking: { type: 'adaptive' },
      // Chat about school data is routine work: medium effort keeps latency and cost low. Tunable.
      output_config: { effort: (process.env.AI_EFFORT as 'low' | 'medium' | 'high') || 'medium' },
      // On a safety decline the API retries on a fallback model inside the same call.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: [{ type: 'text', text: params.system, cache_control: { type: 'ephemeral' } }],
      tools: params.tools,
      messages: params.messages,
    });
  }
}

export function isAiConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.AI_ENABLED === 'false') return false;
  return Boolean(env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN || env.AI_ENABLED === 'true');
}

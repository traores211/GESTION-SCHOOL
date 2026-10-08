import { ConsoleLogger, LogLevel } from '@nestjs/common';

const LEVELS: LogLevel[] = ['fatal', 'error', 'warn', 'log', 'debug', 'verbose'];

/** Log levels enabled by LOG_LEVEL (error | warn | info | debug), "info" by default. */
export function enabledLevels(level = process.env.LOG_LEVEL || 'info'): LogLevel[] {
  const map: Record<string, LogLevel> = { error: 'error', warn: 'warn', info: 'log', log: 'log', debug: 'debug', verbose: 'verbose' };
  const max = LEVELS.indexOf(map[level] ?? 'log');
  return LEVELS.slice(0, max + 1);
}

/**
 * One JSON object per line in production (LOG_FORMAT=json), readable by log collectors
 * (Loki, CloudWatch, Datadog…). Development keeps Nest's coloured output.
 */
export class JsonLogger extends ConsoleLogger {
  protected printMessages(messages: unknown[], context = '', level: LogLevel = 'log') {
    for (const message of messages) {
      const entry: Record<string, unknown> = { time: new Date().toISOString(), level: level === 'log' ? 'info' : level, context };
      if (message && typeof message === 'object' && !(message instanceof Error)) Object.assign(entry, message);
      else entry.msg = message instanceof Error ? message.message : String(message);
      process[level === 'error' || level === 'fatal' ? 'stderr' : 'stdout'].write(`${JSON.stringify(entry)}\n`);
    }
  }
}

export function createLogger() {
  const levels = enabledLevels();
  const json = process.env.LOG_FORMAT ? process.env.LOG_FORMAT === 'json' : process.env.NODE_ENV === 'production';
  return json ? new JsonLogger('App', { logLevels: levels }) : new ConsoleLogger('App', { logLevels: levels });
}

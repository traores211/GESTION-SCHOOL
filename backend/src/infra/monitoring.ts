import * as Sentry from '@sentry/node';

let enabled = false;

/** Error tracking with Sentry when SENTRY_DSN is set (nothing is sent otherwise). */
export function initMonitoring() {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || 'development',
    release: process.env.APP_VERSION,
    tracesSampleRate: Number(process.env.SENTRY_TRACES_RATE || 0),
    // Personal data stays out of the reports: no request bodies, no cookies, no IP addresses.
    sendDefaultPii: false,
    beforeSend(event) {
      if (event.request) {
        delete event.request.data;
        delete event.request.cookies;
        if (event.request.headers) {
          delete event.request.headers.authorization;
          delete event.request.headers.cookie;
        }
      }
      return event;
    },
  });
  enabled = true;
}

export function captureError(error: unknown, context: { requestId?: string; userId?: string; path?: string; schoolId?: string | null } = {}) {
  if (!enabled) return;
  Sentry.withScope((scope) => {
    if (context.requestId) scope.setTag('request_id', context.requestId);
    if (context.path) scope.setTag('path', context.path);
    if (context.schoolId) scope.setTag('school', context.schoolId);
    if (context.userId) scope.setUser({ id: context.userId });
    Sentry.captureException(error);
  });
}

export function captureClientError(message: string, extra: Record<string, unknown>) {
  if (!enabled) return;
  Sentry.withScope((scope) => {
    scope.setTag('source', 'browser');
    scope.setExtras(extra);
    Sentry.captureMessage(message, 'error');
  });
}

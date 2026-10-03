import { api } from "./api";

const sent = new Set<string>();

/** Sends a browser error to the API (logged and forwarded to Sentry), once per distinct message. */
export function reportError(error: unknown, extra: { digest?: string } = {}) {
  if (typeof window === "undefined") return;
  const err = error instanceof Error ? error : new Error(String(error));
  const key = `${err.message}|${extra.digest ?? ""}`;
  if (sent.has(key) || sent.size > 20) return;
  sent.add(key);
  const body = JSON.stringify({ message: err.message.slice(0, 500), stack: err.stack?.slice(0, 4000), url: window.location.pathname, digest: extra.digest });
  try {
    // keepalive lets the report leave even if the page is being closed.
    void fetch(`${api.apiUrl}/client-errors`, { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => undefined);
  } catch {
    // reporting must never break the page
  }
}

import { AuthUser, clearSession, getToken, setSession } from "./auth";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

export class ApiError extends Error {
  status: number;
  /** Parsed JSON error body (e.g. the conflict list of a 409). */
  body: unknown;
  constructor(message: string, status: number, body?: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

/** User-facing message for any error thrown by `api`. */
export function errorMessage(err: unknown, fallback = "Une erreur est survenue"): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof TypeError) return "Impossible de joindre le serveur. Vérifiez votre connexion.";
  return fallback;
}

let refreshing: Promise<string | null> | null = null;

/**
 * Exchanges the HttpOnly refresh cookie for a new short-lived access token. Concurrent callers share
 * the same request, so a burst of 401s triggers a single refresh.
 */
export function refreshAccessToken(): Promise<string | null> {
  if (!refreshing) {
    refreshing = fetch(`${API_URL}/auth/refresh`, { method: "POST", credentials: "include" })
      .then(async (res) => {
        if (!res.ok) return null;
        const body = (await res.json()) as { accessToken: string; user: AuthUser };
        setSession(body.accessToken, body.user);
        return body.accessToken;
      })
      .catch(() => null)
      .finally(() => {
        setTimeout(() => (refreshing = null), 0);
      });
  }
  return refreshing;
}

function sessionExpired(): never {
  clearSession();
  if (typeof window !== "undefined") {
    const next = encodeURIComponent(window.location.pathname);
    window.location.href = `/login?expired=1&next=${next}`;
  }
  throw new ApiError("Session expirée", 401);
}

/**
 * fetch() with the access token, the refresh cookie and one transparent retry after a refresh.
 * Used by `api` and by downloads and streams that need the raw Response.
 */
export async function authorizedFetch(url: string, init: RequestInit = {}, { redirectOn401 = true } = {}): Promise<Response> {
  const send = (token: string | null) =>
    fetch(url, {
      ...init,
      credentials: "include",
      headers: { ...((init.headers as Record<string, string>) || {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });
  let response = await send(getToken());
  if (response.status === 401) {
    const token = await refreshAccessToken();
    if (token) response = await send(token);
    if (response.status === 401 && redirectOn401) sessionExpired();
  }
  return response;
}

/** Signs out on the server (refresh token revoked) and locally. */
export async function logout() {
  try {
    await fetch(`${API_URL}/auth/logout`, { method: "POST", credentials: "include" });
  } catch {
    // offline: the local session is cleared anyway
  }
  clearSession();
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    ...(options.body && !(options.body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
    ...((options.headers as Record<string, string>) || {}),
  };

  // Public auth routes keep their own 401 (wrong password, code required…): no token, no refresh, no
  // redirect. Signed-in routes (/auth/me, 2FA, password change) go through the normal path.
  const isPublicAuth = /^\/auth\/(login|refresh|logout|forgot-password|reset-password)\b/.test(path);
  const response = isPublicAuth
    ? await fetch(`${API_URL}${path}`, { ...options, headers, credentials: "include" })
    : await authorizedFetch(`${API_URL}${path}`, { ...options, headers });

  if (!response.ok) {
    let message: unknown = `Erreur ${response.status}`;
    let body: unknown;
    try {
      body = await response.json();
      message = (body as { message?: unknown })?.message || message;
    } catch {
      // non-JSON error body
    }
    if (response.status === 403 && message === "Forbidden resource") message = "Accès refusé";
    throw new ApiError(Array.isArray(message) ? message.join(", ") : String(message), response.status, body);
  }

  if (response.status === 204) return undefined as T;
  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export const api = {
  get: <T>(path: string, init?: RequestInit) => request<T>(path, init),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body !== undefined ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body: body !== undefined ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PUT", body: body !== undefined ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
  upload: <T>(path: string, file: File, field = "file") => {
    const body = new FormData();
    body.append(field, file);
    return request<T>(path, { method: "POST", body });
  },
  fileUrl: (path: string) => `${API_URL}${path}`,
  apiUrl: API_URL,
  /** Resolves an image reference: absolute URLs as-is, uploaded files (/uploads/...) via the API. */
  mediaUrl: (url: string | null | undefined) => (!url ? null : /^https?:\/\//.test(url) ? url : `${API_URL}${url}`),
};

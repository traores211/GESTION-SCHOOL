import { clearSession, getToken } from "./auth";

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

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    ...(options.body && !(options.body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...((options.headers as Record<string, string>) || {}),
  };

  const response = await fetch(`${API_URL}${path}`, { ...options, headers });

  // An expired session sends the user back to the login page, except for the login call itself
  // (a wrong password must stay on the page with its error message).
  if (response.status === 401 && !path.startsWith("/auth/")) {
    clearSession();
    if (typeof window !== "undefined") {
      const next = encodeURIComponent(window.location.pathname);
      window.location.href = `/login?expired=1&next=${next}`;
    }
    throw new ApiError("Session expirée", 401);
  }

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

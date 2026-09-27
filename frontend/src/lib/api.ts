import { clearSession, getToken } from "./auth";

/** Browser-side API base URL (public). Server components use INTERNAL_API_URL (see lib/server-api.ts). */
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

export class ApiError extends Error {
  status: number;
  details?: unknown;
  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    ...(options.body ? { "Content-Type": "application/json" } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...((options.headers as Record<string, string>) || {}),
  };

  const response = await fetch(`${API_URL}${path}`, { ...options, headers });

  if (response.status === 401 && token) {
    clearSession();
    if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
      window.location.href = "/login?expired=1";
    }
    throw new ApiError("Session expirée, veuillez vous reconnecter", 401);
  }

  if (!response.ok) {
    let message = `Erreur ${response.status}`;
    let details: unknown;
    try {
      const body = await response.json();
      details = body;
      message = body?.message || message;
    } catch {
      // non-JSON error body
    }
    if (response.status === 403) message = "Vous n'avez pas les droits pour cette action.";
    if (response.status === 429) message = "Trop de requêtes. Patientez une minute puis réessayez.";
    throw new ApiError(Array.isArray(message) ? message.join(", ") : String(message), response.status, details);
  }

  if (response.status === 204) return undefined as T;
  const type = response.headers.get("content-type") || "";
  return (type.includes("application/json") ? response.json() : response.text()) as Promise<T>;
}

/** Authenticated file download (the token is not in the URL, so a plain link cannot be used). */
async function download(path: string, filename: string) {
  const token = getToken();
  const response = await fetch(`${API_URL}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!response.ok) throw new ApiError(`Téléchargement impossible (${response.status})`, response.status);
  const url = URL.createObjectURL(await response.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Paginated list: items + total from the X-Total-Count header. */
async function getPage<T>(path: string): Promise<{ items: T[]; total: number }> {
  const token = getToken();
  const response = await fetch(`${API_URL}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!response.ok) throw new ApiError(`Erreur ${response.status}`, response.status);
  const items = (await response.json()) as T[];
  return { items, total: Number(response.headers.get("X-Total-Count") ?? items.length) };
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  getPage,
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body !== undefined ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body: body !== undefined ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PUT", body: body !== undefined ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
  download,
  fileUrl: (path: string) => `${API_URL}${path}`,
  apiUrl: API_URL,
};

export const errorMessage = (err: unknown, fallback = "Une erreur est survenue") =>
  err instanceof ApiError ? err.message : fallback;

export const formatFCFA = (amount: number) => new Intl.NumberFormat("fr-FR").format(Math.round(amount)) + " FCFA";

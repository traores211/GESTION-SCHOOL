/**
 * API base URL for server-side rendering (Next.js server components, middleware).
 * Inside Docker the browser URL (localhost:4000) is not reachable from the frontend container,
 * so INTERNAL_API_URL (e.g. http://backend:4000/api) is used when set.
 */
export const SERVER_API_URL = process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

export async function serverGet<T>(path: string, revalidate = 60): Promise<T | null> {
  try {
    const res = await fetch(`${SERVER_API_URL}${path}`, { next: { revalidate } });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

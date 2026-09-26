import { NextRequest, NextResponse } from "next/server";

/**
 * Tenant resolution by host name:
 *   <code>.PLATFORM_DOMAIN (e.g. ecole-demo.plateforme.com)  -> showcase of that school at "/"
 *   custom domain declared in the platform console           -> same
 * The main domain (and localhost) keep the normal application routes.
 */
const PLATFORM_DOMAIN = process.env.PLATFORM_DOMAIN?.toLowerCase();
const API = process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
const cache = new Map<string, { code: string | null; at: number }>();

async function resolve(host: string): Promise<string | null> {
  const hit = cache.get(host);
  if (hit && Date.now() - hit.at < 60_000) return hit.code;
  let code: string | null = null;
  try {
    const res = await fetch(`${API}/public/resolve?host=${encodeURIComponent(host)}`);
    if (res.ok) code = ((await res.json()) as { code: string }).code;
  } catch {
    code = null;
  }
  cache.set(host, { code, at: Date.now() });
  return code;
}

export async function middleware(req: NextRequest) {
  const host = (req.headers.get("host") ?? "").toLowerCase().split(":")[0];
  if (!host || host === "localhost" || host === "127.0.0.1" || host === PLATFORM_DOMAIN || host === `www.${PLATFORM_DOMAIN}` || /^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    return NextResponse.next();
  }
  const isSubdomain = PLATFORM_DOMAIN ? host.endsWith(`.${PLATFORM_DOMAIN}`) : false;
  if (!isSubdomain && !PLATFORM_DOMAIN) return NextResponse.next();
  const code = await resolve(host);
  if (!code) return NextResponse.next();
  const url = req.nextUrl.clone();
  if (url.pathname === "/") url.pathname = `/ecole/${code}`;
  else if (url.pathname === "/inscription") url.pathname = `/ecole/${code}/inscription`;
  else return NextResponse.next();
  return NextResponse.rewrite(url);
}

export const config = {
  matcher: ["/", "/inscription"],
};

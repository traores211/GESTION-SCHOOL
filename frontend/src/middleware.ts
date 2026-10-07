import { NextResponse, type NextRequest } from "next/server";

/**
 * Routes that must stay public (no authentication required). Includes the sign-in, the
 * password-reset flow, the self-service sign-up, the public showcase of each school and the
 * public page of an online payment.
 *
 * Everything else that lives under `/` is treated as protected: the middleware does a soft
 * check for the refresh cookie `erp_refresh`. The cookie is HttpOnly and set at sign-in by the
 * API; its presence is not a proof of authentication (the client still validates by calling
 * `/auth/me`), it is only a hint that lets us redirect anonymous visitors to `/login` without
 * showing an empty shell for a split second.
 */
const PUBLIC_ROUTES = [
  /^\/$/,
  /^\/login(?:\/|$)/,
  /^\/forgot-password(?:\/|$)/,
  /^\/reset-password(?:\/|$)/,
  /^\/signup(?:\/|$)/,
  /^\/confidentialite(?:\/|$)/,
  /^\/ecole\/[^/]+(?:\/|$)/, // showcase, admissions, suivi
  /^\/pay\/[^/]+(?:\/|$)/,   // public payment page
];

const REFRESH_COOKIE = "erp_refresh";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Static assets, Next's own routes and the API proxy pass through untouched.
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname === "/favicon.ico" ||
    pathname === "/manifest.webmanifest" ||
    pathname === "/sw.js" ||
    pathname.startsWith("/icons/") ||
    pathname.startsWith("/images/")
  ) {
    return NextResponse.next();
  }

  if (PUBLIC_ROUTES.some((re) => re.test(pathname))) {
    return NextResponse.next();
  }

  // Protected path: look for the refresh cookie. Absent → bounce to /login with `next=`.
  if (!req.cookies.has(REFRESH_COOKIE)) {
    const login = req.nextUrl.clone();
    login.pathname = "/login";
    login.searchParams.set("next", pathname + (req.nextUrl.search || ""));
    return NextResponse.redirect(login);
  }

  return NextResponse.next();
}

/**
 * Run the middleware on every page except Next's internal ones and files with an extension
 * (static assets Next cannot route). Keeps `/api/*` untouched too (Next's own API route folder
 * is `src/app/api/*` but we proxy everything through the backend, so it stays empty).
 */
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|icons/|images/|.*\\..*).*)"],
};

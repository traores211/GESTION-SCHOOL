import { NextResponse, type NextRequest } from "next/server";

/**
 * Private pages, by first path segment. Everything else is public (sign-in, password reset,
 * sign-up, school showcase, online payment) or does not exist, and falls through to Next so an
 * unknown address shows the 404 page instead of the sign-in.
 *
 * On a private page the middleware does a soft check for the cookie `erp_session`, set at sign-in
 * by the API next to the refresh token (which is limited to `/api/auth` and never sent on pages).
 * It carries no secret and its presence is not a proof of authentication (the client still
 * validates by calling `/auth/me`): it is only a hint that lets us redirect anonymous visitors to
 * `/login` without showing an empty shell for a split second.
 *
 * A private page missing from this list only loses that early redirect; the API still refuses.
 */
const PRIVATE_SECTIONS = new Set([
  "account",
  "admissions",
  "announcements",
  "attendance",
  "audit",
  "billing",
  "classes",
  "dashboard",
  "discipline",
  "domains",
  "gate",
  "grades",
  "homework",
  "imports",
  "inbox",
  "insights",
  "messaging",
  "parents",
  "payroll",
  "platform",
  "portal",
  "privacy",
  "promotion",
  "quick-entry",
  "schools",
  "staff",
  "students",
  "timetable",
  "transport",
  "users",
]);

const SESSION_COOKIE = "erp_session";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (!PRIVATE_SECTIONS.has(pathname.split("/")[1])) {
    return NextResponse.next();
  }

  // Private page: look for the session marker. Absent → bounce to /login with `next=`.
  if (!req.cookies.has(SESSION_COOKIE)) {
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

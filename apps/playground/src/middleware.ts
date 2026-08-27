import { isReservedSegment } from "@4mica/url";
import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

/**
 * Runs on the Edge runtime.
 *
 * It must NEVER import @/logger (winston needs fs), @/services/* or @4mica/db
 * (Prisma cannot run here). Only @4mica/url — which is pure string work —
 * @clerk/nextjs/server, and next/server. A violation fails the build, loudly,
 * which is the intended safety net.
 *
 * Note: Next 16 deprecates the `middleware` file convention in favour of
 * `proxy`. It still works and Clerk 6.x still documents `middleware.ts`, so the
 * only cost is one warning per build. Migrating is a rename when we're ready.
 */

const HANDLE_PATTERN = /^[A-Za-z0-9_-]{2,64}$/;

/** Everything after the first path segment, preserved verbatim on redirect. */
const rest = (segments: string[]): string =>
  segments.length > 1 ? `/${segments.slice(1).join("/")}` : "";

export default clerkMiddleware(async (_auth, request) => {
  // No auth.protect() anywhere: every route here is public. Clerk only
  // populates the session so a page can tell whether the viewer is the owner.
  const { pathname } = request.nextUrl;
  const segments = pathname.split("/").filter(Boolean);

  if (segments.length === 0) {
    return NextResponse.next();
  }

  const [first] = segments;

  // Owned by apps/web or by this app's own literal routes. In production nginx
  // never sends these here; in dev they fall through to a 404.
  if (isReservedSegment(first)) {
    return NextResponse.next();
  }

  // Compatibility with the dashboard's older /@handle links, and with anyone
  // who types the cal.com-style form. Canonical is bare.
  if (first.startsWith("@")) {
    const bare = first.slice(1).toLowerCase();

    if (HANDLE_PATTERN.test(bare)) {
      const url = request.nextUrl.clone();
      url.pathname = `/${bare}${rest(segments)}`;
      return NextResponse.redirect(url, 308);
    }

    return NextResponse.next();
  }

  // Handles are stored lowercase, so /MO and /mo must not be two URLs.
  if (HANDLE_PATTERN.test(first) && first !== first.toLowerCase()) {
    const url = request.nextUrl.clone();
    url.pathname = `/${first.toLowerCase()}${rest(segments)}`;
    return NextResponse.redirect(url, 308);
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    // Skip Next internals and anything that looks like a static file, unless
    // it appears in a search param.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};

import { isReservedSegment } from "@4mica/url";
import { clerkMiddleware } from "@clerk/nextjs/server";
import {
  type NextFetchEvent,
  type NextRequest,
  NextResponse,
} from "next/server";
import {
  createRequestId,
  parseUpstreamRequestId,
  REQUEST_ID_HEADER,
  UPSTREAM_REQUEST_ID_HEADER,
} from "@/lib/telemetry";
import {
  buildContentSecurityPolicy,
  clerkFrontendApi,
  createNonce,
  NONCE_HEADER,
  sentryEndpoints,
} from "@/utils/csp";
import { PATHNAME_HEADER } from "@/utils/pathnameHeader";

/**
 * Runs on the Edge runtime.
 *
 * It must NEVER import @/logger (winston needs fs), @/services/* or @4mica/db
 * (Prisma cannot run here). Only @4mica/url and @/utils — which are pure string
 * work — @clerk/nextjs/server, and next/server. A violation fails the build, loudly,
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

const CLERK_HOST = clerkFrontendApi(
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
);

const SENTRY = sentryEndpoints(
  process.env.NEXT_PUBLIC_SENTRY_DSN,
  process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT,
);

const CSP_HEADER = "content-security-policy";

const LIGHTWEIGHT_PATH =
  /^\/(?:api\/(?:health|og|revalidate)(?:\/|$)|\.well-known\/|sitemap-profiles\.xml$|[^/]+\/llms\.txt$)/;

interface RequestIds {
  requestId: string;
  upstreamRequestId?: string;
}

const requestIdsFor = (request: NextRequest): RequestIds => ({
  requestId: createRequestId(),
  upstreamRequestId: parseUpstreamRequestId(
    request.headers.get(REQUEST_ID_HEADER),
  ),
});

const stampRequestIds = (headers: Headers, ids: RequestIds) => {
  headers.set(REQUEST_ID_HEADER, ids.requestId);

  if (ids.upstreamRequestId) {
    headers.set(UPSTREAM_REQUEST_ID_HEADER, ids.upstreamRequestId);
  } else {
    headers.delete(UPSTREAM_REQUEST_ID_HEADER);
  }
};

const stampOnly = (request: NextRequest, ids: RequestIds) => {
  const headers = new Headers(request.headers);
  stampRequestIds(headers, ids);

  const response = NextResponse.next({ request: { headers } });
  response.headers.set(REQUEST_ID_HEADER, ids.requestId);
  return response;
};

const passThrough = (request: NextRequest, ids: RequestIds) => {
  const nonce = createNonce();
  const policy = buildContentSecurityPolicy({
    nonce,
    clerkHost: CLERK_HOST,
    sentry: SENTRY,
    development: process.env.NODE_ENV === "development",
  });

  const headers = new Headers(request.headers);
  headers.set(PATHNAME_HEADER, request.nextUrl.pathname);
  headers.set(NONCE_HEADER, nonce);
  headers.set(CSP_HEADER, policy);
  stampRequestIds(headers, ids);

  const response = NextResponse.next({ request: { headers } });
  response.headers.set(CSP_HEADER, policy);
  response.headers.set(REQUEST_ID_HEADER, ids.requestId);
  return response;
};

const redirect = (url: URL, ids: RequestIds) => {
  const response = NextResponse.redirect(url, 308);
  response.headers.set(REQUEST_ID_HEADER, ids.requestId);
  return response;
};

const withClerk = clerkMiddleware(async (_auth, request) => {
  // No auth.protect() anywhere: every route here is public. Clerk only
  // populates the session so a page can tell whether the viewer is the owner.
  const ids = requestIdsFor(request);
  const { pathname } = request.nextUrl;
  const segments = pathname.split("/").filter(Boolean);

  if (segments.length === 0) {
    return passThrough(request, ids);
  }

  const [first] = segments;

  // Owned by apps/web or by this app's own literal routes. In production nginx
  // never sends these here; in dev they fall through to a 404.
  if (isReservedSegment(first)) {
    return passThrough(request, ids);
  }

  // Compatibility with the dashboard's older /@handle links, and with anyone
  // who types the cal.com-style form. Canonical is bare.
  if (first.startsWith("@")) {
    const bare = first.slice(1).toLowerCase();

    if (HANDLE_PATTERN.test(bare)) {
      const url = request.nextUrl.clone();
      url.pathname = `/${bare}${rest(segments)}`;
      return redirect(url, ids);
    }

    return passThrough(request, ids);
  }

  // Handles are stored lowercase, so /MO and /mo must not be two URLs.
  if (HANDLE_PATTERN.test(first) && first !== first.toLowerCase()) {
    const url = request.nextUrl.clone();
    url.pathname = `/${first.toLowerCase()}${rest(segments)}`;
    return redirect(url, ids);
  }

  return passThrough(request, ids);
});

export default function middleware(
  request: NextRequest,
  event: NextFetchEvent,
) {
  if (LIGHTWEIGHT_PATH.test(request.nextUrl.pathname)) {
    return stampOnly(request, requestIdsFor(request));
  }

  return withClerk(request, event);
}

export const config = {
  matcher: [
    // Skip Next internals and anything that looks like a static file, unless
    // it appears in a search param.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};

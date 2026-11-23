export const TRACES_SAMPLE_RATE = 0.1;

const ROUTE_PATTERNS: [RegExp, string][] = [
  [/^\/customers\/[^/]+$/, "/customers/:id"],
  [/^\/agents\/[^/]+\/advanced$/, "/agents/:id/advanced"],
  [/^\/agents\/[^/]+$/, "/agents/:id"],
  [/^\/apis\/[^/]+$/, "/apis/:id"],
  [/^\/help\/requests\/[^/]+$/, "/help/requests/:id"],
];

export const routeName = (pathname: string): string => {
  const path = pathname.replace(/\/+$/, "") || "/";
  return ROUTE_PATTERNS.find(([pattern]) => pattern.test(path))?.[1] ?? path;
};

export const sentryOriginFromDsn = (dsn: string | undefined): string | null => {
  const value = dsn?.trim();
  if (!value) {
    return null;
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("VITE_SENTRY_DSN must be a Sentry DSN URL.");
  }
  if (url.protocol !== "https:" || !url.username) {
    throw new Error("VITE_SENTRY_DSN must be an https Sentry DSN with a key.");
  }

  return url.origin;
};

export const NONCE_HEADER = "x-nonce";

export const clerkFrontendApi = (
  publishableKey: string | undefined,
): string | null => {
  const encoded = publishableKey?.replace(/^pk_(test|live)_/, "");

  if (!encoded || encoded === publishableKey) {
    return null;
  }

  try {
    const host = atob(encoded).replace(/\$$/, "");
    return /^[a-z0-9.-]+$/i.test(host) ? host : null;
  } catch {
    return null;
  }
};

export interface SentryEndpoints {
  origin: string;
  reportUri: string;
}

export const sentryEndpoints = (
  dsn: string | undefined,
  environment?: string,
): SentryEndpoints | null => {
  if (!dsn) {
    return null;
  }

  try {
    const url = new URL(dsn);
    const projectId = url.pathname.replace(/^\/+|\/+$/g, "");

    if (
      url.protocol !== "https:" ||
      !url.username ||
      !/^\d+$/.test(projectId)
    ) {
      return null;
    }

    const report = new URL(`${url.origin}/api/${projectId}/security/`);
    report.searchParams.set("sentry_key", url.username);

    if (environment) {
      report.searchParams.set("sentry_environment", environment);
    }

    return { origin: url.origin, reportUri: report.toString() };
  } catch {
    return null;
  }
};

export const createNonce = (): string => {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
};

export interface ContentSecurityPolicyOptions {
  nonce: string;
  clerkHost: string | null;
  sentry?: SentryEndpoints | null;
  development: boolean;
}

export const buildContentSecurityPolicy = ({
  nonce,
  clerkHost,
  sentry,
  development,
}: ContentSecurityPolicyOptions): string => {
  const clerk = clerkHost ? [`https://${clerkHost}`] : [];

  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": [
      "'self'",
      `'nonce-${nonce}'`,
      "'strict-dynamic'",
      ...clerk,
      ...(development ? ["'unsafe-eval'"] : []),
    ],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:", "https:"],
    "font-src": ["'self'", "data:"],
    "connect-src": [
      "'self'",
      ...clerk,
      "https://clerk-telemetry.com",
      "https://*.clerk-telemetry.com",
      "https://img.clerk.com",
      ...(sentry ? [sentry.origin] : []),
      ...(development ? ["ws:"] : []),
    ],
    "frame-src": ["'self'", "https://challenges.cloudflare.com"],
    "worker-src": ["'self'", "blob:"],
    "manifest-src": ["'self'"],
    "frame-ancestors": ["'none'"],
    "base-uri": ["'self'"],
    "object-src": ["'none'"],
    "form-action": ["'self'"],
    ...(sentry ? { "report-uri": [sentry.reportUri] } : {}),
  };

  return Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(" ")}`)
    .join("; ");
};

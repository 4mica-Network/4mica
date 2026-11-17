const CLERK_KEY_PATTERN = /^pk_(test|live)_([A-Za-z0-9+/=_-]+)$/;
const HOSTNAME_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9-]+)+$/;
const CLERK_TELEMETRY_ORIGIN = "https://clerk-telemetry.com";
const CLERK_IMAGE_ORIGIN = "https://img.clerk.com";
const CAPTCHA_ORIGIN = "https://challenges.cloudflare.com";

export interface ClerkInstance {
  origin: string;
  development: boolean;
}

export function clerkInstanceFromKey(key: string | undefined): ClerkInstance {
  const match = CLERK_KEY_PATTERN.exec(key?.trim() ?? "");
  if (!match) {
    throw new Error("VITE_CLERK_PUBLISHABLE_KEY is missing or malformed.");
  }

  const decoded = atob(match[2].replace(/-/g, "+").replace(/_/g, "/"));
  const host = decoded.endsWith("$") ? decoded.slice(0, -1) : "";
  if (!HOSTNAME_PATTERN.test(host)) {
    throw new Error(
      "VITE_CLERK_PUBLISHABLE_KEY does not encode a Clerk frontend API host.",
    );
  }

  return { origin: `https://${host}`, development: match[1] === "test" };
}

export function buildContentSecurityPolicy(
  apiOrigin: string,
  clerk: ClerkInstance,
  sentryOrigin: string | null = null,
): string {
  const connect = ["'self'", apiOrigin, clerk.origin];
  if (sentryOrigin) {
    connect.push(sentryOrigin);
  }
  if (clerk.development) {
    connect.push(CLERK_TELEMETRY_ORIGIN);
  }

  return [
    "default-src 'self'",
    `script-src 'self' ${clerk.origin} ${CAPTCHA_ORIGIN}`,
    `connect-src ${connect.join(" ")}`,
    `img-src 'self' data: ${CLERK_IMAGE_ORIGIN}`,
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
    `frame-src ${CAPTCHA_ORIGIN}`,
    "worker-src 'self' blob:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "object-src 'none'",
    "form-action 'self'",
  ].join("; ");
}

export function renderSecurityHeaders(
  apiOrigin: string,
  clerk: ClerkInstance,
  sentryOrigin: string | null = null,
): string {
  const headers: [string, string][] = [
    [
      "Content-Security-Policy",
      buildContentSecurityPolicy(apiOrigin, clerk, sentryOrigin),
    ],
    ["Strict-Transport-Security", "max-age=31536000"],
    ["X-Frame-Options", "DENY"],
    ["X-Content-Type-Options", "nosniff"],
    ["Referrer-Policy", "strict-origin-when-cross-origin"],
    ["Permissions-Policy", "camera=(), microphone=(), geolocation=()"],
  ];

  return headers
    .map(([name, value]) => `add_header ${name} "${value}" always;\n`)
    .join("");
}

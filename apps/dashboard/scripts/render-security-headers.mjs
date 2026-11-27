import { writeFileSync } from "node:fs";
import { requireTrustedApiUrl } from "../src/api/apiUrl.ts";
import {
  clerkInstanceFromKey,
  renderSecurityHeaders,
} from "../src/lib/securityHeaders.ts";
import { sentryOriginFromDsn } from "../src/lib/telemetryConfig.ts";

const [output] = process.argv.slice(2);
if (!output) {
  throw new Error("Usage: render-security-headers.mjs <output-file>");
}

const apiOrigin = requireTrustedApiUrl(process.env.VITE_API_URL);
const clerk = clerkInstanceFromKey(process.env.VITE_CLERK_PUBLISHABLE_KEY);

const sentryOrigin = sentryOriginFromDsn(process.env.VITE_SENTRY_DSN);

writeFileSync(output, renderSecurityHeaders(apiOrigin, clerk, sentryOrigin));

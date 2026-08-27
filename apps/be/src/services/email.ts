/**
 * The connection to apps/email.
 *
 * That service has no authentication of its own — reaching it is the
 * authorisation — so it publishes no host port and lives on the private
 * `4mica-internal` Docker network with this one. `EMAIL_SERVICE_URL` is
 * therefore always a compose service name (`http://email:4100`), never a
 * loopback port and never a public hostname.
 *
 * The client is optional by design. An unset `EMAIL_SERVICE_URL` yields `null`
 * rather than throwing, so local dev, tests and a degraded box all run without
 * an email service. Callers must handle `null`; the alternative — failing boot
 * — would make the API unavailable because a *notification* channel is down.
 */

import { EmailClient } from "@4mica/email-client";
import { config } from "@config/index";
import { createScopedLogger } from "@logger/index";

declare module "fastify" {
  interface FastifyInstance {
    /** `null` when no email service is configured. Callers must handle it. */
    email: EmailClient | null;
  }
}

const logger = createScopedLogger("email");

let client: EmailClient | null | undefined;

/**
 * `null` when no email service is configured.
 *
 * Memoised on first call rather than built at module load so importing this
 * file has no side effects — the same reason src/server.ts splits `initApp`
 * from `runServer`.
 */
export const getEmailClient = (): EmailClient | null => {
  if (client !== undefined) {
    return client;
  }

  const baseURL = config.emailServiceUrl;

  if (!baseURL) {
    logger.warn("EMAIL_SERVICE_URL is unset; email sending is disabled");
    client = null;
    return client;
  }

  client = new EmailClient(baseURL, {
    // A failed send must never fail the request that triggered it. The client
    // logs and returns null instead, and its own retry covers 429/5xx.
    throwOnError: false,
    logger,
  });

  return client;
};

/** Test seam: forces the next `getEmailClient()` to rebuild from config. */
export const resetEmailClient = (): void => {
  client = undefined;
};

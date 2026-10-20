import { EmailClient } from "@4mica/email-client";
import { config } from "@config/index";
import { createScopedLogger } from "@logger/index";

declare module "fastify" {
  interface FastifyInstance {
    email: EmailClient | null;
  }
}

const logger = createScopedLogger("email");

let client: EmailClient | null | undefined;

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
    throwOnError: false,
    logger,
  });

  return client;
};

export const resetEmailClient = (): void => {
  client = undefined;
};

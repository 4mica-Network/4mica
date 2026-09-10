import { config } from "@config/index";
import { parseBody } from "@controllers/shared";
import { appLogger } from "@logger/index";
import { verifyUnsubscribeToken } from "@services/unsubscribe-token";
import type { RouteHandler } from "fastify";
import { unsubscribeFromOnboarding } from "./repository";
import { UnsubscribeBodySchema, UnsubscribeQuerySchema } from "./schema";

const confirmUrl = (token: string): string =>
  `${config.appUrl}/settings/notifications?unsubscribe=confirm&token=${encodeURIComponent(token)}`;

const outcomeUrl = (outcome: "done" | "invalid"): string =>
  `${config.appUrl}/settings/notifications?unsubscribe=${outcome}`;

/**
 * `GET /unsubscribe` — deliberately does not mutate anything.
 *
 * Mail scanners, link previewers and corporate security gateways prefetch every
 * URL in a message with a GET. A mutating GET here would silently unsubscribe
 * people who never clicked, so this only redirects to a confirm screen. The
 * mutation lives behind POST, which is also exactly what RFC 8058 one-click
 * requires — so real mail clients still get a single-step unsubscribe.
 */
export const unsubscribeConfirmHandler: RouteHandler = async (
  request,
  reply,
) => {
  reply.header("cache-control", "no-store");
  reply.header("x-robots-tag", "noindex");

  const parsed = parseBody(UnsubscribeQuerySchema, request.query);

  if (!parsed.success) {
    return reply.redirect(outcomeUrl("invalid"), 303);
  }

  // Verified here purely so an obviously bad link fails on the confirm screen
  // rather than after the user clicks through. Nothing is written either way.
  if (!verifyUnsubscribeToken(parsed.data.token)) {
    return reply.redirect(outcomeUrl("invalid"), 303);
  }

  return reply.redirect(confirmUrl(parsed.data.token), 303);
};

/** `POST /unsubscribe` — the mutating half. */
export const unsubscribeHandler: RouteHandler = async (request, reply) => {
  reply.header("cache-control", "no-store");

  const fromQuery = parseBody(UnsubscribeBodySchema, request.query ?? {});
  const fromBody = parseBody(UnsubscribeBodySchema, request.body ?? {});

  const token =
    (fromQuery.success ? fromQuery.data.token : undefined) ??
    (fromBody.success ? fromBody.data.token : undefined);

  const userId = token ? verifyUnsubscribeToken(token) : null;

  if (userId) {
    const found = await unsubscribeFromOnboarding(userId);

    if (found) {
      appLogger.info("onboarding drip: user unsubscribed", { userId });
    }
  }

  // Always 200, whether or not the token verified. Distinguishing the two would
  // turn this unauthenticated endpoint into an oracle for valid tokens, and a
  // one-click mail client ignores the body regardless.
  return reply.code(200).send({ unsubscribed: true });
};

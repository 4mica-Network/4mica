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

  if (!verifyUnsubscribeToken(parsed.data.token)) {
    return reply.redirect(outcomeUrl("invalid"), 303);
  }

  return reply.redirect(confirmUrl(parsed.data.token), 303);
};

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

  return reply.code(200).send({ unsubscribed: true });
};

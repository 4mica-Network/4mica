import {
  unsubscribeConfirmHandler,
  unsubscribeHandler,
} from "@controllers/unsubscribe/index";
import type { FastifyPluginCallback } from "fastify";
import { limitedResponses } from "./schema-fragments";

/**
 * Public, unauthenticated: the signed token is the credential, exactly as on
 * `/verify-email`.
 *
 * `sensitiveRateLimit` is deliberately not used — it keys on `request.auth` and
 * early-returns when there is none, so it would be a no-op here. The global
 * IP shield already covers these routes, and the route-level budget below
 * tightens them further.
 */
const budget = { rateLimit: { max: 20, timeWindow: 60_000 } };

export const unsubscribeRoutes: FastifyPluginCallback = (app, _opts, done) => {
  // RFC 8058 one-click clients POST `List-Unsubscribe=One-Click` as
  // `application/x-www-form-urlencoded`, which Fastify rejects with 415 out of
  // the box — one-click would silently fail for every real mail client. The
  // parser is registered inside this plugin, so it stays scoped to these two
  // routes rather than changing how the whole API accepts bodies.
  app.addContentTypeParser(
    "application/x-www-form-urlencoded",
    { parseAs: "string" },
    (_request, body, next) => {
      try {
        next(null, Object.fromEntries(new URLSearchParams(body as string)));
      } catch {
        next(null, {});
      }
    },
  );

  app.get(
    "/unsubscribe",
    {
      config: budget,
      schema: {
        tags: ["unsubscribe"],
        summary: "Show the unsubscribe confirmation (never mutates)",
        querystring: {
          type: "object",
          properties: { token: { type: "string" } },
        },
        response: { ...limitedResponses, 303: { type: "null" } },
      },
    },
    unsubscribeConfirmHandler,
  );

  app.post(
    "/unsubscribe",
    {
      config: budget,
      schema: {
        tags: ["unsubscribe"],
        summary: "Opt out of onboarding emails (RFC 8058 one-click)",
        querystring: {
          type: "object",
          properties: { token: { type: "string" } },
        },
        response: {
          ...limitedResponses,
          200: {
            type: "object",
            required: ["unsubscribed"],
            properties: { unsubscribed: { type: "boolean" } },
          },
        },
      },
    },
    unsubscribeHandler,
  );

  done();
};

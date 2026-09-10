import {
  unsubscribeConfirmHandler,
  unsubscribeHandler,
} from "@controllers/unsubscribe/index";
import type { FastifyPluginCallback } from "fastify";
import { limitedResponses } from "./schema-fragments";

const budget = { rateLimit: { max: 20, timeWindow: 60_000 } };

export const unsubscribeRoutes: FastifyPluginCallback = (app, _opts, done) => {
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

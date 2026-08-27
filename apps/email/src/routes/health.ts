import { templateIds } from "@4mica/email-client";
import { config } from "@config/index";
import { getServiceState } from "@lifecycle/index";
import type { FastifyPluginCallback } from "fastify";
import { healthResponseSchema } from "./schema-fragments";

export const healthRoutes: FastifyPluginCallback = (app, _opts, done) => {
  app.get(
    "/health",
    {
      schema: {
        tags: ["system"],
        summary: "Liveness probe",
        response: { 200: healthResponseSchema, 503: healthResponseSchema },
      },
    },
    async (_request, reply) => {
      const state = getServiceState();

      const body = {
        status: state === "ready" ? ("ok" as const) : ("draining" as const),
        state,
        uptime: Math.round(process.uptime() * 1000) / 1000,
        timestamp: new Date().toISOString(),
        templates: templateIds.length,
        dryRun: config.email.dryRun,
      };

      return reply.code(state === "ready" ? 200 : 503).send(body);
    },
  );

  done();
};

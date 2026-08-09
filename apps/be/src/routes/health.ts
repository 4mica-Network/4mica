import { getHealthHandler } from "@controllers/health/index";
import type { FastifyPluginCallback } from "fastify";

const healthResponseSchema = {
  type: "object",
  required: ["status", "state", "uptime", "timestamp", "db"],
  properties: {
    status: { type: "string", enum: ["ok", "degraded", "draining"] },
    state: {
      type: "string",
      enum: ["ready", "draining", "closing"],
      description: "Whether the instance is still accepting traffic",
    },
    uptime: { type: "number", description: "Process uptime in seconds" },
    timestamp: { type: "string", format: "date-time" },
    db: { type: "string", enum: ["ok", "down", "unknown"] },
    agents: {
      type: "integer",
      description: "Row count, omitted when the database is down",
    },
  },
} as const;

export const healthRoutes: FastifyPluginCallback = (app, _opts, done) => {
  app.get(
    "/health",
    {
      schema: {
        tags: ["system"],
        summary: "Liveness probe with database readiness",
        response: {
          200: healthResponseSchema,
          503: healthResponseSchema,
        },
      },
    },
    getHealthHandler,
  );

  done();
};

import type { FastifyPluginCallback } from "fastify";
import { getHealthHandler } from "../controllers/health/index";

const healthResponseSchema = {
  type: "object",
  required: ["status", "uptime", "timestamp", "db"],
  properties: {
    status: { type: "string", enum: ["ok", "degraded"] },
    uptime: { type: "number", description: "Process uptime in seconds" },
    timestamp: { type: "string", format: "date-time" },
    db: { type: "string", enum: ["ok", "down"] },
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

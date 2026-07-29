import { prisma } from "@4mica/db";
import type { FastifyPluginCallback } from "fastify";
import { appLogger } from "../logger/index";

export interface HealthResponse {
  status: "ok" | "degraded";
  uptime: number;
  timestamp: string;
  db: "ok" | "down";
  agents?: number;
}

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
    async (_request, reply) => {
      const body: HealthResponse = {
        status: "degraded",
        uptime: Math.round(process.uptime() * 1000) / 1000,
        timestamp: new Date().toISOString(),
        db: "down",
      };

      try {
        body.agents = await prisma.agent.count();
        body.db = "ok";
        body.status = "ok";
      } catch (error) {
        appLogger.error("Health check database probe failed", { error });
      }

      return reply.code(body.db === "ok" ? 200 : 503).send(body);
    },
  );

  done();
};

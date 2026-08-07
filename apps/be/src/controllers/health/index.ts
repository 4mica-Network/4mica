import type { RouteHandler } from "fastify";
import { appLogger } from "../../logger/index";
import { countAgents } from "./repository";

export interface HealthResponse {
  status: "ok" | "degraded";
  uptime: number;
  timestamp: string;
  db: "ok" | "down";
  agents?: number;
}

export const getHealthHandler: RouteHandler = async (_request, reply) => {
  const body: HealthResponse = {
    status: "degraded",
    uptime: Math.round(process.uptime() * 1000) / 1000,
    timestamp: new Date().toISOString(),
    db: "down",
  };

  try {
    body.agents = await countAgents();
    body.db = "ok";
    body.status = "ok";
  } catch (error) {
    appLogger.error("Health check database probe failed", { error });
  }

  return reply.code(body.db === "ok" ? 200 : 503).send(body);
};

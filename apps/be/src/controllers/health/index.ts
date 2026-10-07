import { getServiceState, type ServiceState } from "@lifecycle/index";
import { appLogger } from "@logger/index";
import type { RouteHandler } from "fastify";
import { pingDatabase } from "./repository";

export interface HealthResponse {
  status: "ok" | "degraded" | "draining";
  state: ServiceState;
  uptime: number;
  timestamp: string;
  db: "ok" | "down" | "unknown";
}

export const getHealthHandler: RouteHandler = async (_request, reply) => {
  const state = getServiceState();

  const body: HealthResponse = {
    status: "degraded",
    state,
    uptime: Math.round(process.uptime() * 1000) / 1000,
    timestamp: new Date().toISOString(),
    db: "down",
  };

  if (state !== "ready") {
    body.status = "draining";
    body.db = "unknown";
    return reply.code(503).send(body);
  }

  try {
    await pingDatabase();
    body.db = "ok";
    body.status = "ok";
  } catch (error) {
    appLogger.error("Health check database probe failed", { error });
  }

  return reply.code(body.db === "ok" ? 200 : 503).send(body);
};

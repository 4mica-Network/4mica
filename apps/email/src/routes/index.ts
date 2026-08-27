import type { FastifyPluginCallback } from "fastify";
import { emailRoutes } from "./emails";
import { healthRoutes } from "./health";

export interface RouteRegistration {
  plugin: FastifyPluginCallback;
  prefix?: string;
}

export const routes: RouteRegistration[] = [
  { plugin: healthRoutes },
  { plugin: emailRoutes },
];

export { emailRoutes, healthRoutes };

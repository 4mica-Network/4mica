import type { FastifyPluginCallback } from "fastify";
import { healthRoutes } from "./health";

export interface RouteRegistration {
  plugin: FastifyPluginCallback;
  prefix?: string;
}

export const routes: RouteRegistration[] = [{ plugin: healthRoutes }];

export { healthRoutes };

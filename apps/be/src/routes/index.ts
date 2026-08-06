import type { FastifyPluginCallback } from "fastify";
import { developerRoutes } from "./developer";
import { healthRoutes } from "./health";
import { meRoutes } from "./me";

export interface RouteRegistration {
  plugin: FastifyPluginCallback;
  prefix?: string;
}

export const routes: RouteRegistration[] = [
  { plugin: healthRoutes },
  { plugin: meRoutes },
  { plugin: developerRoutes },
];

export { developerRoutes, healthRoutes, meRoutes };

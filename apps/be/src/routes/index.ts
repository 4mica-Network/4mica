import type { FastifyPluginCallback } from "fastify";
import { bannerRoutes } from "./banners";
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
  { plugin: bannerRoutes },
];

export { bannerRoutes, developerRoutes, healthRoutes, meRoutes };

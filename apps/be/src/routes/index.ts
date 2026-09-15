import type { FastifyPluginCallback } from "fastify";
import { bannerRoutes } from "./banners";
import { developerRoutes } from "./developer";
import { healthRoutes } from "./health";
import { meRoutes } from "./me";
import { unsubscribeRoutes } from "./unsubscribe";
import { verificationRoutes } from "./verification";
import { walletRoutes } from "./wallets";

export interface RouteRegistration {
  plugin: FastifyPluginCallback;
  prefix?: string;
}

export const routes: RouteRegistration[] = [
  { plugin: healthRoutes },
  { plugin: meRoutes },
  { plugin: verificationRoutes },
  { plugin: developerRoutes },
  { plugin: bannerRoutes },
  { plugin: unsubscribeRoutes },
  { plugin: walletRoutes },
];

export {
  bannerRoutes,
  developerRoutes,
  healthRoutes,
  meRoutes,
  unsubscribeRoutes,
  verificationRoutes,
  walletRoutes,
};

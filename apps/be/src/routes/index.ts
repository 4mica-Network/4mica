import type { FastifyPluginCallback } from "fastify";
import { agentRoutes } from "./agents";
import { apiListingRoutes } from "./api-listings";
import { bannerRoutes } from "./banners";
import { developerRoutes } from "./developer";
import { healthRoutes } from "./health";
import { meRoutes } from "./me";
import { paymentRoutes } from "./payments";
import { trustRoutes } from "./trust";
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
  { plugin: apiListingRoutes },
  { plugin: agentRoutes },
  { plugin: paymentRoutes },
  { plugin: trustRoutes },
];

export {
  agentRoutes,
  apiListingRoutes,
  bannerRoutes,
  developerRoutes,
  healthRoutes,
  meRoutes,
  paymentRoutes,
  trustRoutes,
  unsubscribeRoutes,
  verificationRoutes,
  walletRoutes,
};

import type { FastifyPluginCallback } from "fastify";
import { agentRoutes } from "./agents";
import { apiListingRoutes } from "./api-listings";
import { balanceRoutes } from "./balances";
import { bannerRoutes } from "./banners";
import { cliRoutes } from "./cli";
import { complianceRoutes } from "./compliance";
import { configRoutes } from "./config";
import { customerRoutes } from "./customers";
import { developerRoutes } from "./developer";
import { healthRoutes } from "./health";
import { meRoutes } from "./me";
import { organizationRoutes } from "./organizations";
import { paymentRoutes } from "./payments";
import { resourceKeyRoutes } from "./resource-keys";
import { supportRoutes } from "./support";
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
  { plugin: organizationRoutes },
  { plugin: verificationRoutes },
  { plugin: developerRoutes },
  { plugin: bannerRoutes },
  { plugin: unsubscribeRoutes },
  { plugin: walletRoutes },
  { plugin: apiListingRoutes },
  { plugin: agentRoutes },
  { plugin: paymentRoutes },
  { plugin: balanceRoutes },
  { plugin: customerRoutes },
  { plugin: trustRoutes },
  { plugin: resourceKeyRoutes },
  { plugin: complianceRoutes },
  { plugin: configRoutes },
  { plugin: supportRoutes },
  { plugin: cliRoutes },
];

export {
  agentRoutes,
  apiListingRoutes,
  balanceRoutes,
  bannerRoutes,
  cliRoutes,
  complianceRoutes,
  customerRoutes,
  developerRoutes,
  healthRoutes,
  meRoutes,
  organizationRoutes,
  paymentRoutes,
  resourceKeyRoutes,
  supportRoutes,
  trustRoutes,
  unsubscribeRoutes,
  verificationRoutes,
  walletRoutes,
};

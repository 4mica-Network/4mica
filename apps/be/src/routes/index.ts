import type { FastifyPluginCallback } from "fastify";
import { agentRoutes } from "./agents";
import { apiListingRoutes } from "./api-listings";
import { approvalRoutes } from "./approvals";
import { auditStreamRoutes } from "./audit-streams";
import { balanceRoutes } from "./balances";
import { bannerRoutes } from "./banners";
import { cliRoutes } from "./cli";
import { complianceRoutes } from "./compliance";
import { complianceReportRoutes } from "./compliance-report";
import { configRoutes } from "./config";
import { customerRoutes } from "./customers";
import { developerRoutes } from "./developer";
import { domainRoutes } from "./domains";
import { financeRoutes } from "./finance";
import { financeAlertRoutes } from "./finance-alerts";
import { healthRoutes } from "./health";
import { meRoutes } from "./me";
import { organizationRoutes } from "./organizations";
import { paymentRoutes } from "./payments";
import { projectRoutes } from "./projects";
import { resourceKeyRoutes } from "./resource-keys";
import { roleRoutes } from "./roles";
import { SCIM_PREFIX, scimRoutes } from "./scim";
import { scimGroupRoutes } from "./scim-groups";
import { scimTokenRoutes } from "./scim-tokens";
import { securityRoutes } from "./security";
import { serviceAccountRoutes } from "./service-accounts";
import { spendRoutes } from "./spend";
import { spendingPolicyRoutes } from "./spending-policies";
import { ssoRoutes } from "./sso";
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
  { plugin: projectRoutes },
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
  { plugin: financeRoutes },
  { plugin: financeAlertRoutes },
  { plugin: spendingPolicyRoutes },
  { plugin: spendRoutes },
  { plugin: trustRoutes },
  { plugin: resourceKeyRoutes },
  { plugin: serviceAccountRoutes },
  { plugin: complianceRoutes },
  { plugin: configRoutes },
  { plugin: supportRoutes },
  { plugin: cliRoutes },
  { plugin: approvalRoutes },
  { plugin: roleRoutes },
  { plugin: complianceReportRoutes },
  { plugin: auditStreamRoutes },
  { plugin: domainRoutes },
  { plugin: ssoRoutes },
  { plugin: securityRoutes },
  { plugin: scimTokenRoutes },
  { plugin: scimGroupRoutes },
  { plugin: scimRoutes, prefix: SCIM_PREFIX },
];

export {
  agentRoutes,
  apiListingRoutes,
  approvalRoutes,
  auditStreamRoutes,
  balanceRoutes,
  bannerRoutes,
  cliRoutes,
  complianceReportRoutes,
  complianceRoutes,
  customerRoutes,
  developerRoutes,
  domainRoutes,
  financeAlertRoutes,
  financeRoutes,
  healthRoutes,
  meRoutes,
  organizationRoutes,
  paymentRoutes,
  projectRoutes,
  resourceKeyRoutes,
  roleRoutes,
  scimGroupRoutes,
  scimRoutes,
  scimTokenRoutes,
  securityRoutes,
  serviceAccountRoutes,
  spendingPolicyRoutes,
  spendRoutes,
  ssoRoutes,
  supportRoutes,
  trustRoutes,
  unsubscribeRoutes,
  verificationRoutes,
  walletRoutes,
};

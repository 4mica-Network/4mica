import { type ComponentType, createElement, lazy } from "react";
import { Navigate } from "react-router-dom";

const AccountSettings = lazy(() =>
  import("@/pages/account").then((page) => ({ default: page.AccountSettings })),
);
const AgentAdvanced = lazy(() =>
  import("@/pages/agent-advanced").then((page) => ({
    default: page.AgentAdvanced,
  })),
);
const AgentDetail = lazy(() =>
  import("@/pages/agent-detail").then((page) => ({
    default: page.AgentDetail,
  })),
);
const Agents = lazy(() =>
  import("@/pages/agents").then((page) => ({ default: page.Agents })),
);
const ApiDetail = lazy(() =>
  import("@/pages/api-detail").then((page) => ({ default: page.ApiDetail })),
);
const Apis = lazy(() =>
  import("@/pages/apis").then((page) => ({ default: page.Apis })),
);
const BusinessSettings = lazy(() =>
  import("@/pages/business").then((page) => ({
    default: page.BusinessSettings,
  })),
);
const ComplianceSettings = lazy(() =>
  import("@/pages/compliance").then((page) => ({
    default: page.ComplianceSettings,
  })),
);
const CustomerDetail = lazy(() =>
  import("@/pages/customer-detail").then((page) => ({
    default: page.CustomerDetail,
  })),
);
const Customers = lazy(() =>
  import("@/pages/customers").then((page) => ({ default: page.Customers })),
);
const DeveloperSettings = lazy(() =>
  import("@/pages/developer").then((page) => ({
    default: page.DeveloperSettings,
  })),
);
const Disputes = lazy(() =>
  import("@/pages/disputes").then((page) => ({ default: page.Disputes })),
);
const Help = lazy(() =>
  import("@/pages/help").then((page) => ({ default: page.Help })),
);
const HelpRequestDetail = lazy(() =>
  import("@/pages/help-request").then((page) => ({
    default: page.HelpRequestDetail,
  })),
);
const NotificationSettings = lazy(() =>
  import("@/pages/notification").then((page) => ({
    default: page.NotificationSettings,
  })),
);
const Overview = lazy(() =>
  import("@/pages/overview").then((page) => ({ default: page.Overview })),
);
const Payments = lazy(() =>
  import("@/pages/payments").then((page) => ({ default: page.Payments })),
);
const PlansSettings = lazy(() =>
  import("@/pages/plans").then((page) => ({ default: page.PlansSettings })),
);
const ProfileSettings = lazy(() =>
  import("@/pages/profile").then((page) => ({ default: page.ProfileSettings })),
);
const TeamSettings = lazy(() =>
  import("@/pages/team").then((page) => ({ default: page.TeamSettings })),
);
const Wallet = lazy(() =>
  import("@/pages/wallet").then((page) => ({ default: page.Wallet })),
);

export interface RouteMeta {
  path?: string;
  index?: boolean;
  component: ComponentType;
}

export const APP_PAGES: RouteMeta[] = [
  { index: true, component: Overview },
  {
    path: "balances",
    component: () => createElement(Navigate, { to: "/", replace: true }),
  },
  { path: "payments", component: Payments },
  { path: "payments/disputes", component: Disputes },
  { path: "wallet", component: Wallet },
  { path: "customers", component: Customers },
  { path: "customers/:id", component: CustomerDetail },
  { path: "agents", component: Agents },
  { path: "agents/:id", component: AgentDetail },
  { path: "agents/:id/advanced", component: AgentAdvanced },
  { path: "apis", component: Apis },
  { path: "apis/:id", component: ApiDetail },
  { path: "help", component: Help },
  { path: "help/requests/:id", component: HelpRequestDetail },
];

export interface SettingsRouteMeta {
  path: string;
  component: ComponentType;
}

export const SETTINGS_PAGES: SettingsRouteMeta[] = [
  { path: "profile", component: ProfileSettings },
  { path: "general", component: AccountSettings },
  { path: "business", component: BusinessSettings },
  { path: "team", component: TeamSettings },
  { path: "notifications", component: NotificationSettings },
  { path: "plans", component: PlansSettings },
  { path: "compliance", component: ComplianceSettings },
  { path: "developer", component: DeveloperSettings },
];

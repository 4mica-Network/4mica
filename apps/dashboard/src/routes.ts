import { type ComponentType, createElement, lazy } from "react";
import { Navigate } from "react-router-dom";

type PageLoader = () => Promise<ComponentType>;

const lazyPage = (load: PageLoader) =>
  Object.assign(
    lazy(() => load().then((component) => ({ default: component }))),
    { preload: load },
  );

const AccountSettings = lazyPage(() =>
  import("@/pages/account").then((page) => page.AccountSettings),
);
const AgentAdvanced = lazyPage(() =>
  import("@/pages/agent-advanced").then((page) => page.AgentAdvanced),
);
const AgentDetail = lazyPage(() =>
  import("@/pages/agent-detail").then((page) => page.AgentDetail),
);
const Agents = lazyPage(() =>
  import("@/pages/agents").then((page) => page.Agents),
);
const ApiDetail = lazyPage(() =>
  import("@/pages/api-detail").then((page) => page.ApiDetail),
);
const Apis = lazyPage(() => import("@/pages/apis").then((page) => page.Apis));
const BusinessSettings = lazyPage(() =>
  import("@/pages/business").then((page) => page.BusinessSettings),
);
const ComplianceSettings = lazyPage(() =>
  import("@/pages/compliance").then((page) => page.ComplianceSettings),
);
const CustomerDetail = lazyPage(() =>
  import("@/pages/customer-detail").then((page) => page.CustomerDetail),
);
const Customers = lazyPage(() =>
  import("@/pages/customers").then((page) => page.Customers),
);
const DeveloperSettings = lazyPage(() =>
  import("@/pages/developer").then((page) => page.DeveloperSettings),
);
const Disputes = lazyPage(() =>
  import("@/pages/disputes").then((page) => page.Disputes),
);
const Help = lazyPage(() => import("@/pages/help").then((page) => page.Help));
const HelpRequestDetail = lazyPage(() =>
  import("@/pages/help-request").then((page) => page.HelpRequestDetail),
);
const NotificationSettings = lazyPage(() =>
  import("@/pages/notification").then((page) => page.NotificationSettings),
);
const Overview = lazyPage(() =>
  import("@/pages/overview").then((page) => page.Overview),
);
const Payments = lazyPage(() =>
  import("@/pages/payments").then((page) => page.Payments),
);
const PlansSettings = lazyPage(() =>
  import("@/pages/plans").then((page) => page.PlansSettings),
);
const ProfileSettings = lazyPage(() =>
  import("@/pages/profile").then((page) => page.ProfileSettings),
);
const TeamSettings = lazyPage(() =>
  import("@/pages/team").then((page) => page.TeamSettings),
);
const Wallet = lazyPage(() =>
  import("@/pages/wallet").then((page) => page.Wallet),
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

export const pageAt = (to: string): ComponentType | undefined => {
  const path = to.replace(/^\/+|\/+$/g, "");
  if (path === "") {
    return APP_PAGES.find((page) => page.index)?.component;
  }
  if (path === "settings") {
    return SETTINGS_PAGES[0]?.component;
  }
  if (path.startsWith("settings/")) {
    return SETTINGS_PAGES.find((page) => `settings/${page.path}` === path)
      ?.component;
  }
  return APP_PAGES.find((page) => page.path === path)?.component;
};

export const preloadPage = (to: string): void => {
  const page = pageAt(to) as { preload?: PageLoader } | undefined;
  page?.preload?.().catch(() => {});
};

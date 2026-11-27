import { type ComponentType, createElement, lazy } from "react";
import { Navigate } from "react-router-dom";
import { type TranslatedModule, translated } from "@/i18n/manifest";

type PageLoader = () => Promise<ComponentType>;

const lazyPage = (module: TranslatedModule, load: PageLoader) => {
  const loadWithTranslations = translated(module, load);
  return Object.assign(
    lazy(() =>
      loadWithTranslations().then((component) => ({ default: component })),
    ),
    { preload: loadWithTranslations },
  );
};

const AccountSettings = lazyPage("pages/account", () =>
  import("@/pages/account").then((page) => page.AccountSettings),
);
const AgentAdvanced = lazyPage("pages/agent-advanced", () =>
  import("@/pages/agent-advanced").then((page) => page.AgentAdvanced),
);
const AgentDetail = lazyPage("pages/agent-detail", () =>
  import("@/pages/agent-detail").then((page) => page.AgentDetail),
);
const Agents = lazyPage("pages/agents", () =>
  import("@/pages/agents").then((page) => page.Agents),
);
const ApiDetail = lazyPage("pages/api-detail", () =>
  import("@/pages/api-detail").then((page) => page.ApiDetail),
);
const Apis = lazyPage("pages/apis", () =>
  import("@/pages/apis").then((page) => page.Apis),
);
const BusinessSettings = lazyPage("pages/business", () =>
  import("@/pages/business").then((page) => page.BusinessSettings),
);
const CliAuthorize = lazyPage("pages/cli-authorize", () =>
  import("@/pages/cli-authorize").then((page) => page.CliAuthorize),
);
const ComplianceSettings = lazyPage("pages/compliance", () =>
  import("@/pages/compliance").then((page) => page.ComplianceSettings),
);
const CustomerDetail = lazyPage("pages/customer-detail", () =>
  import("@/pages/customer-detail").then((page) => page.CustomerDetail),
);
const Customers = lazyPage("pages/customers", () =>
  import("@/pages/customers").then((page) => page.Customers),
);
const DeveloperSettings = lazyPage("pages/developer", () =>
  import("@/pages/developer").then((page) => page.DeveloperSettings),
);
const Disputes = lazyPage("pages/disputes", () =>
  import("@/pages/disputes").then((page) => page.Disputes),
);
const Help = lazyPage("pages/help", () =>
  import("@/pages/help").then((page) => page.Help),
);
const HelpRequestDetail = lazyPage("pages/help-request", () =>
  import("@/pages/help-request").then((page) => page.HelpRequestDetail),
);
const NotificationSettings = lazyPage("pages/notification", () =>
  import("@/pages/notification").then((page) => page.NotificationSettings),
);
const Overview = lazyPage("pages/overview", () =>
  import("@/pages/overview").then((page) => page.Overview),
);
const Payments = lazyPage("pages/payments", () =>
  import("@/pages/payments").then((page) => page.Payments),
);
const PlansSettings = lazyPage("pages/plans", () =>
  import("@/pages/plans").then((page) => page.PlansSettings),
);
const ProfileSettings = lazyPage("pages/profile", () =>
  import("@/pages/profile").then((page) => page.ProfileSettings),
);
const TeamSettings = lazyPage("pages/team", () =>
  import("@/pages/team").then((page) => page.TeamSettings),
);
const Wallet = lazyPage("pages/wallet", () =>
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

/**
 * Signed-in pages that stand alone, outside the app shell: a consent screen
 * should show the one decision and nothing to wander off into.
 */
export const STANDALONE_PAGES: RouteMeta[] = [
  { path: "cli/authorize", component: CliAuthorize },
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

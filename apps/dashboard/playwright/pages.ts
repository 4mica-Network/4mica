export const ORG = "4Mica Workspace";

export interface DashboardPage {
  path: string;
  heading: string;
  level: 1 | 2;
  titled: boolean;
}

export const APP_PAGES: DashboardPage[] = [
  { path: "/", heading: "Overview", level: 1, titled: true },
  { path: "/payments", heading: "Payments", level: 1, titled: false },
  { path: "/payments/disputes", heading: "Disputes", level: 1, titled: true },
  { path: "/wallet", heading: "Wallet", level: 1, titled: true },
  { path: "/customers", heading: "Customers", level: 1, titled: true },
  { path: "/agents", heading: "Agents", level: 1, titled: true },
  { path: "/apis", heading: "APIs", level: 1, titled: true },
  { path: "/help", heading: "Help", level: 1, titled: true },
];

export const SETTINGS_PAGES: DashboardPage[] = [
  "Profile",
  "General",
  "Business",
  "Team",
  "Notifications",
  "Plans",
  "Compliance",
  "Developer",
].map((heading) => ({
  path: `/settings/${heading.toLowerCase()}`,
  heading,
  level: 2,
  titled: true,
}));

export const REDIRECTS: [string, string][] = [
  ["/balances", "/"],
  ["/transactions", "/payments"],
  ["/settings", "/settings/profile"],
  ["/settings/account", "/settings/general"],
  ["/this-page-does-not-exist", "/"],
  ["/sign-in", "/"],
];

export interface DetailPage {
  list: string;
  rowPrefix: string;
  kind: string;
  unknownId: string;
  notFound: string;
}

export const DETAIL_PAGES: DetailPage[] = [
  {
    list: "/agents",
    rowPrefix: "agent-row-",
    kind: "Agent",
    unknownId: "/agents/nope",
    notFound: "That agent is no longer available.",
  },
  {
    list: "/customers",
    rowPrefix: "customer-row-",
    kind: "Customer",
    unknownId: "/customers/nope",
    notFound: "That customer is no longer available.",
  },
  {
    list: "/apis",
    rowPrefix: "api-listing-row-",
    kind: "App",
    unknownId: "/apis/nope",
    notFound: "That API is no longer available.",
  },
];

export const ORG = "4Mica Workspace";

export interface DashboardPage {
  path: string;
  heading: string;
}

export const APP_PAGES: DashboardPage[] = [
  { path: "/", heading: "Overview" },
  { path: "/payments", heading: "Payments" },
  { path: "/payments/disputes", heading: "Disputes" },
  { path: "/wallet", heading: "Wallet" },
  { path: "/customers", heading: "Customers" },
  { path: "/agents", heading: "Agents" },
  { path: "/apis", heading: "APIs" },
  { path: "/help", heading: "Help" },
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

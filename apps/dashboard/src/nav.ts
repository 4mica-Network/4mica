import {
  ArrowRightLeft,
  Blocks,
  Bot,
  ChartColumn,
  CircleHelp,
  CreditCard,
  FilePlus,
  Fingerprint,
  House,
  Landmark,
  ListChecks,
  type LucideIcon,
  Settings,
  Users,
  Wallet,
} from "lucide-react";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Exact-match active state (used for the index route). */
  end?: boolean;
}

export interface NavSection {
  title?: string;
  items: NavItem[];
}

/** Primary sidebar navigation, grouped like a real product console. */
export const NAV_SECTIONS: NavSection[] = [
  { items: [{ to: "/", label: "Home", icon: House, end: true }] },
  {
    title: "Money",
    items: [
      { to: "/balances", label: "Balances", icon: Landmark },
      { to: "/transactions", label: "Transactions", icon: ArrowRightLeft },
      { to: "/payments", label: "Payments", icon: CreditCard },
      { to: "/wallet", label: "Wallet", icon: Wallet },
    ],
  },
  {
    title: "Business",
    items: [
      { to: "/customers", label: "Customers", icon: Users },
      { to: "/agents", label: "Agents", icon: Bot },
      { to: "/whitelist", label: "Whitelist", icon: ListChecks },
      { to: "/apps", label: "Apps", icon: Blocks },
      { to: "/reports", label: "Reports", icon: ChartColumn },
      { to: "/identity", label: "Identity", icon: Fingerprint },
      { to: "/create-invoice", label: "Create invoice", icon: FilePlus },
    ],
  },
];

/** Pinned to the bottom of the sidebar. */
export const FOOTER_ITEMS: NavItem[] = [
  { to: "/settings", label: "Settings", icon: Settings },
  { to: "/help", label: "Help", icon: CircleHelp },
];

/** Secondary navigation inside the Settings section. */
export const SETTINGS_NAV: { to: string; label: string }[] = [
  { to: "/settings/personal-details", label: "Personal details" },
  {
    to: "/settings/communication-preferences",
    label: "Communication preferences",
  },
  { to: "/settings/business", label: "Business" },
  { to: "/settings/team", label: "Team" },
  { to: "/settings/notifications", label: "Notifications" },
  { to: "/settings/plans", label: "Plans" },
  { to: "/settings/4mica-profile", label: "4Mica profile" },
  { to: "/settings/compliance", label: "Compliance" },
  { to: "/settings/developer", label: "Developer" },
];

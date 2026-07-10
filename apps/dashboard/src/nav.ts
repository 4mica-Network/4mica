import {
  ArrowRightLeft,
  BadgeCheck,
  Bell,
  Blocks,
  Bot,
  Building2,
  ChartColumn,
  CircleHelp,
  Code,
  CreditCard,
  FilePlus,
  Fingerprint,
  House,
  Landmark,
  ListChecks,
  type LucideIcon,
  Mail,
  Settings,
  ShieldCheck,
  User,
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

/** Secondary navigation shown in the sidebar while inside the Settings area. */
export const SETTINGS_NAV: NavItem[] = [
  { to: "/settings/personal-details", label: "Personal details", icon: User },
  {
    to: "/settings/communication-preferences",
    label: "Communication preferences",
    icon: Mail,
  },
  { to: "/settings/business", label: "Business", icon: Building2 },
  { to: "/settings/team", label: "Team", icon: Users },
  { to: "/settings/notifications", label: "Notifications", icon: Bell },
  { to: "/settings/plans", label: "Plans", icon: CreditCard },
  { to: "/settings/4mica-profile", label: "4Mica profile", icon: BadgeCheck },
  { to: "/settings/compliance", label: "Compliance", icon: ShieldCheck },
  { to: "/settings/developer", label: "Developer", icon: Code },
];

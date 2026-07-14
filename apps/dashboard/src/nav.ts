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
  Settings,
  ShieldCheck,
  User,
  Users,
  Wallet,
} from "lucide-react";

export interface NavItem {
  to: string;
  labelKey: string;
  icon: LucideIcon;
  end?: boolean;
}

export interface NavSection {
  titleKey?: string;
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  { items: [{ to: "/", labelKey: "nav.home", icon: House, end: true }] },
  {
    titleKey: "nav.section.money",
    items: [
      { to: "/balances", labelKey: "nav.balances", icon: Landmark },
      {
        to: "/transactions",
        labelKey: "nav.transactions",
        icon: ArrowRightLeft,
      },
      { to: "/payments", labelKey: "nav.payments", icon: CreditCard },
      { to: "/wallet", labelKey: "nav.wallet", icon: Wallet },
    ],
  },
  {
    titleKey: "nav.section.business",
    items: [
      { to: "/customers", labelKey: "nav.customers", icon: Users },
      { to: "/agents", labelKey: "nav.agents", icon: Bot },
      { to: "/whitelist", labelKey: "nav.whitelist", icon: ListChecks },
      { to: "/apps", labelKey: "nav.apps", icon: Blocks },
      { to: "/reports", labelKey: "nav.reports", icon: ChartColumn },
      { to: "/identity", labelKey: "nav.identity", icon: Fingerprint },
      { to: "/create-invoice", labelKey: "nav.createInvoice", icon: FilePlus },
    ],
  },
];

export const FOOTER_ITEMS: NavItem[] = [
  { to: "/settings/profile", labelKey: "nav.settings", icon: Settings },
  { to: "/help", labelKey: "nav.help", icon: CircleHelp },
];

export const SETTINGS_NAV: NavItem[] = [
  { to: "/settings/profile", labelKey: "nav.profile", icon: BadgeCheck },
  { to: "/settings/account", labelKey: "nav.account", icon: User },
  { to: "/settings/business", labelKey: "nav.business", icon: Building2 },
  { to: "/settings/team", labelKey: "nav.team", icon: Users },
  { to: "/settings/notifications", labelKey: "nav.notifications", icon: Bell },
  { to: "/settings/plans", labelKey: "nav.plans", icon: CreditCard },
  { to: "/settings/compliance", labelKey: "nav.compliance", icon: ShieldCheck },
  { to: "/settings/developer", labelKey: "nav.developer", icon: Code },
];

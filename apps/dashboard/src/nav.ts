import {
  BadgeCheck,
  Bell,
  Blocks,
  Bot,
  Building2,
  CircleHelp,
  Code,
  CreditCard,
  House,
  type LucideIcon,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
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
      { to: "/payments", labelKey: "nav.payments", icon: CreditCard },
      { to: "/wallet", labelKey: "nav.wallet", icon: Wallet },
    ],
  },
  {
    titleKey: "nav.section.business",
    items: [
      { to: "/customers", labelKey: "nav.customers", icon: Users },
      { to: "/agents", labelKey: "nav.agents", icon: Bot },
      { to: "/apis", labelKey: "nav.apis", icon: Blocks },
    ],
  },
];

export const FOOTER_ITEMS: NavItem[] = [
  { to: "/settings", labelKey: "nav.settings", icon: Settings },
  { to: "/help", labelKey: "nav.help", icon: CircleHelp },
];

export const SETTINGS_NAV: NavItem[] = [
  { to: "/settings/profile", labelKey: "nav.profile", icon: BadgeCheck },
  { to: "/settings/general", labelKey: "nav.account", icon: SlidersHorizontal },
  { to: "/settings/business", labelKey: "nav.business", icon: Building2 },
  { to: "/settings/team", labelKey: "nav.team", icon: Users },
  { to: "/settings/notifications", labelKey: "nav.notifications", icon: Bell },
  { to: "/settings/plans", labelKey: "nav.plans", icon: CreditCard },
  { to: "/settings/compliance", labelKey: "nav.compliance", icon: ShieldCheck },
  { to: "/settings/developer", labelKey: "nav.developer", icon: Code },
];

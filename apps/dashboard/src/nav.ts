import { PERMISSION, type Permission } from "@stores/organization/type";
import {
  BadgeCheck,
  BarChart3,
  Bell,
  BellRing,
  Blocks,
  Bot,
  Building2,
  CircleHelp,
  Code,
  CreditCard,
  FolderKanban,
  House,
  Inbox,
  KeySquare,
  Landmark,
  ListChecks,
  type LucideIcon,
  ScrollText,
  Settings,
  ShieldCheck,
  ShieldHalf,
  SlidersHorizontal,
  Users,
  Wallet,
} from "lucide-react";

export interface NavItem {
  to: string;
  labelKey: string;
  icon: LucideIcon;
  end?: boolean;
  permission?: Permission;
  badge?: "approvals" | "alerts";
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
  {
    titleKey: "nav.section.finance",
    items: [
      {
        to: "/finance/policies",
        labelKey: "nav.policies",
        icon: Landmark,
        permission: PERMISSION.FINANCE_READ,
      },
      {
        to: "/finance/approvals",
        labelKey: "nav.approvals",
        icon: Inbox,
        permission: PERMISSION.FINANCE_READ,
        badge: "approvals",
      },
      {
        to: "/finance/alerts",
        labelKey: "nav.alerts",
        icon: BellRing,
        permission: PERMISSION.FINANCE_READ,
        badge: "alerts",
      },
      {
        to: "/finance/reports",
        labelKey: "nav.reports",
        icon: BarChart3,
        permission: PERMISSION.FINANCE_READ,
      },
      {
        to: "/finance/authorizations",
        labelKey: "nav.authorizations",
        icon: ListChecks,
        permission: PERMISSION.FINANCE_READ,
      },
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
  { to: "/settings/projects", labelKey: "nav.projects", icon: FolderKanban },
  { to: "/settings/notifications", labelKey: "nav.notifications", icon: Bell },
  { to: "/settings/plans", labelKey: "nav.plans", icon: CreditCard },
  { to: "/settings/compliance", labelKey: "nav.compliance", icon: ShieldCheck },
  { to: "/settings/developer", labelKey: "nav.developer", icon: Code },
  {
    to: "/settings/service-accounts",
    labelKey: "nav.serviceAccounts",
    icon: KeySquare,
  },
  {
    to: "/settings/governance",
    labelKey: "nav.governance",
    icon: ShieldHalf,
    permission: PERMISSION.FINANCE_READ,
  },
  {
    to: "/settings/audit-log",
    labelKey: "nav.auditLog",
    icon: ScrollText,
    permission: PERMISSION.AUDIT_READ,
  },
];

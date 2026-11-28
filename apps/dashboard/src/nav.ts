import { PERMISSION, type Permission } from "@stores/organization/type";
import {
  BadgeCheck,
  BarChart3,
  Bell,
  BellRing,
  Blocks,
  Bot,
  Building,
  Building2,
  CircleHelp,
  ClipboardCheck,
  Code,
  CreditCard,
  FolderKanban,
  Gauge,
  House,
  Inbox,
  KeyRound,
  KeySquare,
  Landmark,
  ListChecks,
  LockKeyhole,
  type LucideIcon,
  Radio,
  Scale,
  ScrollText,
  Settings,
  ShieldCheck,
  ShieldHalf,
  SlidersHorizontal,
  UserCog,
  Users,
  Wallet,
  Workflow,
} from "lucide-react";
import type { WorkspaceMode } from "@/hooks/useWorkspaceMode";

export type Visibility =
  | "personal"
  | "team"
  | ((mode: WorkspaceMode) => boolean);

export interface NavItem {
  to: string;
  labelKey: string;
  icon: LucideIcon;
  end?: boolean;
  permission?: Permission;
  badge?: "approvals" | "alerts";
  visibleIn?: Visibility;
  children?: NavItem[];
}

export interface NavSection {
  titleKey?: string;
  visibleIn?: Visibility;
  items: NavItem[];
}

export const isVisible = (
  rule: Visibility | undefined,
  mode: WorkspaceMode,
): boolean => {
  if (rule === undefined) {
    return true;
  }
  if (rule === "personal") {
    return mode.personal;
  }
  if (rule === "team") {
    return !mode.personal;
  }
  return rule(mode);
};

const orgManagers: Visibility = (mode) => !mode.personal && mode.canManageOrg;
const projectManagers: Visibility = (mode) => mode.canSeeProjects;

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
        labelKey: "nav.spendingLimits",
        icon: Gauge,
        permission: PERMISSION.FINANCE_READ,
        visibleIn: "personal",
      },
      {
        to: "/finance/policies",
        labelKey: "nav.policies",
        icon: Landmark,
        permission: PERMISSION.FINANCE_READ,
        visibleIn: "team",
      },
      {
        to: "/finance/approvals",
        labelKey: "nav.approvals",
        icon: Inbox,
        permission: PERMISSION.FINANCE_READ,
        badge: "approvals",
        visibleIn: "team",
      },
      {
        to: "/finance/alerts",
        labelKey: "nav.alerts",
        icon: BellRing,
        permission: PERMISSION.FINANCE_READ,
        badge: "alerts",
        visibleIn: "team",
      },
      {
        to: "/finance/reports",
        labelKey: "nav.reports",
        icon: BarChart3,
        permission: PERMISSION.FINANCE_READ,
        visibleIn: "team",
      },
      {
        to: "/finance/authorizations",
        labelKey: "nav.authorizations",
        icon: ListChecks,
        permission: PERMISSION.FINANCE_READ,
        visibleIn: "team",
      },
    ],
  },
];

export const INVITE_TEAM_PATH = "/settings/team?invite=1";

export const FOOTER_ITEMS: NavItem[] = [
  { to: "/settings", labelKey: "nav.settings", icon: Settings },
  { to: "/help", labelKey: "nav.help", icon: CircleHelp },
];

export const SECURITY_COMPLIANCE: NavItem = {
  to: "/settings/security",
  labelKey: "nav.securityCompliance",
  icon: ShieldHalf,
  visibleIn: orgManagers,
  children: [
    {
      to: "/settings/security",
      labelKey: "nav.securityPolicies",
      icon: LockKeyhole,
      permission: PERMISSION.MEMBERS_MANAGE,
    },
    {
      to: "/settings/sso",
      labelKey: "nav.domainsSso",
      icon: KeyRound,
      permission: PERMISSION.MEMBERS_MANAGE,
    },
    {
      to: "/settings/roles",
      labelKey: "nav.roles",
      icon: UserCog,
      permission: PERMISSION.MEMBERS_MANAGE,
    },
    {
      to: "/settings/scim",
      labelKey: "nav.scim",
      icon: Workflow,
      permission: PERMISSION.SECURITY_MANAGE,
    },
    {
      to: "/settings/audit-log",
      labelKey: "nav.auditLog",
      icon: ScrollText,
      permission: PERMISSION.AUDIT_READ,
    },
    {
      to: "/settings/audit-streams",
      labelKey: "nav.auditStreams",
      icon: Radio,
      permission: PERMISSION.AUDIT_READ,
    },
    {
      to: "/settings/compliance-report",
      labelKey: "nav.complianceReport",
      icon: ClipboardCheck,
      permission: PERMISSION.COMPLIANCE_READ,
    },
    {
      to: "/settings/governance",
      labelKey: "nav.governance",
      icon: Scale,
      permission: PERMISSION.FINANCE_READ,
    },
  ],
};

const PROFILE: NavItem = {
  to: "/settings/profile",
  labelKey: "nav.profile",
  icon: BadgeCheck,
};
const NOTIFICATIONS: NavItem = {
  to: "/settings/notifications",
  labelKey: "nav.notifications",
  icon: Bell,
};
const BUSINESS: NavItem = {
  to: "/settings/business",
  labelKey: "nav.business",
  icon: Building2,
};
const PLANS: NavItem = {
  to: "/settings/plans",
  labelKey: "nav.plans",
  icon: CreditCard,
};
const COMPLIANCE: NavItem = {
  to: "/settings/compliance",
  labelKey: "nav.compliance",
  icon: ShieldCheck,
};
const DEVELOPER: NavItem = {
  to: "/settings/developer",
  labelKey: "nav.developer",
  icon: Code,
};

export const SETTINGS_SECTIONS: NavSection[] = [
  {
    titleKey: "nav.section.organization",
    visibleIn: "team",
    items: [
      { to: "/settings/general", labelKey: "nav.account", icon: Building },
      { to: "/settings/team", labelKey: "nav.team", icon: Users },
      {
        to: "/settings/projects",
        labelKey: "nav.projects",
        icon: FolderKanban,
        visibleIn: projectManagers,
      },
      BUSINESS,
      PLANS,
      COMPLIANCE,
      DEVELOPER,
      {
        to: "/settings/service-accounts",
        labelKey: "nav.serviceAccounts",
        icon: KeySquare,
      },
    ],
  },
  { visibleIn: "team", items: [SECURITY_COMPLIANCE] },
  {
    titleKey: "nav.section.yourAccount",
    visibleIn: "team",
    items: [PROFILE, NOTIFICATIONS],
  },
  {
    titleKey: "nav.section.workspace",
    visibleIn: "personal",
    items: [
      PROFILE,
      {
        to: "/settings/general",
        labelKey: "nav.account",
        icon: SlidersHorizontal,
      },
      BUSINESS,
      NOTIFICATIONS,
      PLANS,
      COMPLIANCE,
      DEVELOPER,
    ],
  },
];

export const navItems = (sections: NavSection[]): NavItem[] =>
  sections.flatMap((section) =>
    section.items.flatMap((item) => [item, ...(item.children ?? [])]),
  );

export const resolveNav = (
  sections: NavSection[],
  mode: WorkspaceMode,
  permitted: (permission: Permission) => boolean,
): NavSection[] => {
  const allowed = (item: NavItem) =>
    isVisible(item.visibleIn, mode) &&
    (!item.permission || permitted(item.permission));
  const resolveItem = (item: NavItem): NavItem[] => {
    if (!allowed(item)) {
      return [];
    }
    if (!item.children) {
      return [item];
    }
    const children = item.children.filter(allowed);
    const [first] = children;
    return first ? [{ ...item, to: first.to, children }] : [];
  };
  return sections
    .filter((section) => isVisible(section.visibleIn, mode))
    .map((section) => ({
      ...section,
      items: section.items.flatMap(resolveItem),
    }))
    .filter((section) => section.items.length > 0);
};

const pathRules = (): Map<string, Visibility[][]> => {
  const rules = new Map<string, Visibility[][]>();
  const add = (to: string, chain: (Visibility | undefined)[]) => {
    const defined = chain.filter((rule): rule is Visibility => Boolean(rule));
    rules.set(to, [...(rules.get(to) ?? []), defined]);
  };
  for (const section of [
    ...NAV_SECTIONS,
    ...SETTINGS_SECTIONS,
    { items: FOOTER_ITEMS },
  ]) {
    for (const item of section.items) {
      if (item.children) {
        for (const child of item.children) {
          add(child.to, [section.visibleIn, item.visibleIn, child.visibleIn]);
        }
      } else {
        add(item.to, [section.visibleIn, item.visibleIn]);
      }
    }
  }
  return rules;
};

const PATH_RULES = pathRules();

export const isPathVisible = (path: string, mode: WorkspaceMode): boolean => {
  const chains = PATH_RULES.get(path);
  return (
    !chains ||
    chains.some((chain) => chain.every((rule) => isVisible(rule, mode)))
  );
};

const settingsPaths = (
  mode: WorkspaceMode,
  permitted: (permission: Permission) => boolean,
): string[] =>
  navItems(resolveNav(SETTINGS_SECTIONS, mode, permitted))
    .map((item) => item.to)
    .filter((to, index, all) => all.indexOf(to) === index);

export const firstSettingsPath = (
  mode: WorkspaceMode,
  permitted: (permission: Permission) => boolean,
): string => settingsPaths(mode, permitted)[0] ?? "/settings/profile";

export const settingsPathFor = (
  pathname: string,
  mode: WorkspaceMode,
  permitted: (permission: Permission) => boolean,
): string =>
  settingsPaths(mode, permitted).includes(pathname)
    ? pathname
    : firstSettingsPath(mode, permitted);

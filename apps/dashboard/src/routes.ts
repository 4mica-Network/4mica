import type { ComponentType } from "react";
import { AccountSettings } from "@/pages/account";
import { AgentAdvanced } from "@/pages/agent-advanced";
import { AgentDetail } from "@/pages/agent-detail";
import { Agents } from "@/pages/agents";
import { Apps } from "@/pages/apps";
import { Balances } from "@/pages/balances";
import { BusinessSettings } from "@/pages/business";
import { ComplianceSettings } from "@/pages/compliance";
import { CreateInvoice } from "@/pages/create-invoice";
import { Customers } from "@/pages/customers";
import { DeveloperSettings } from "@/pages/developer";
import { Disputes } from "@/pages/disputes";
import { Help } from "@/pages/help";
import { Identity } from "@/pages/identity";
import { NotificationSettings } from "@/pages/notification";
import { Overview } from "@/pages/overview";
import { Payments } from "@/pages/payments";
import { PlansSettings } from "@/pages/plans";
import { ProfileSettings } from "@/pages/profile";
import { Reports } from "@/pages/reports";
import { TeamSettings } from "@/pages/team";
import { Transactions } from "@/pages/transactions";
import { Wallet } from "@/pages/wallet";
import { Whitelist } from "@/pages/whitelist";

export interface RouteMeta {
  path?: string;
  index?: boolean;
  component: ComponentType;
}

export const APP_PAGES: RouteMeta[] = [
  { index: true, component: Overview },
  { path: "balances", component: Balances },
  { path: "transactions", component: Transactions },
  { path: "payments", component: Payments },
  { path: "payments/disputes", component: Disputes },
  { path: "wallet", component: Wallet },
  { path: "customers", component: Customers },
  { path: "agents", component: Agents },
  { path: "agents/:id", component: AgentDetail },
  { path: "agents/:id/advanced", component: AgentAdvanced },
  { path: "whitelist", component: Whitelist },
  { path: "apps", component: Apps },
  { path: "reports", component: Reports },
  { path: "identity", component: Identity },
  { path: "create-invoice", component: CreateInvoice },
  { path: "help", component: Help },
];

export interface SettingsRouteMeta {
  path: string;
  component: ComponentType;
}

export const SETTINGS_PAGES: SettingsRouteMeta[] = [
  { path: "account", component: AccountSettings },
  { path: "profile", component: ProfileSettings },
  { path: "business", component: BusinessSettings },
  { path: "team", component: TeamSettings },
  { path: "notifications", component: NotificationSettings },
  { path: "plans", component: PlansSettings },
  { path: "compliance", component: ComplianceSettings },
  { path: "developer", component: DeveloperSettings },
];

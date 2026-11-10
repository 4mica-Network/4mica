import type { SupportPriority, SupportStatus } from "@stores/support/type";
import {
  ArrowLeftRight,
  Bot,
  Bug,
  CircleHelp,
  Code,
  Globe,
  Lightbulb,
  type LucideIcon,
  Receipt,
  ShieldCheck,
  UserRound,
  Wallet,
} from "lucide-react";
import { links } from "@/lib/links";

export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  ACCOUNT: UserRound,
  BILLING: Receipt,
  PAYMENTS: ArrowLeftRight,
  WALLETS: Wallet,
  AGENTS: Bot,
  API_LISTINGS: Globe,
  INTEGRATION: Code,
  COMPLIANCE: ShieldCheck,
  BUG: Bug,
  FEATURE_REQUEST: Lightbulb,
};

export const CATEGORY_GUIDES: Record<string, string> = {
  PAYMENTS: links.docsDeposits,
  WALLETS: links.docsWallet,
  COMPLIANCE: links.docsSecurity,
  FEATURE_REQUEST: links.docsChangelog,
};

export const categoryIcon = (category: string): LucideIcon =>
  CATEGORY_ICONS[category] ?? CircleHelp;

export const categoryGuide = (category: string): string =>
  CATEGORY_GUIDES[category] ?? links.docs;

export const categoryLabelKey = (category: string) =>
  `help.category.${category}.title`;

export const categoryDescriptionKey = (category: string) =>
  `help.category.${category}.description`;

export const STATUS_LABEL_KEYS = {
  OPEN: "help.status.open",
  IN_PROGRESS: "help.status.inProgress",
  WAITING_ON_CUSTOMER: "help.status.waitingOnYou",
  RESOLVED: "help.status.resolved",
  CLOSED: "help.status.closed",
} as const satisfies Record<SupportStatus, string>;

export const STATUS_TAG_VARIANT = {
  OPEN: "default",
  IN_PROGRESS: "default",
  WAITING_ON_CUSTOMER: "warning",
  RESOLVED: "success",
  CLOSED: "neutral",
} as const satisfies Record<
  SupportStatus,
  "default" | "success" | "warning" | "neutral"
>;

export const PRIORITY_LABEL_KEYS = {
  LOW: "help.priority.low",
  NORMAL: "help.priority.normal",
  HIGH: "help.priority.high",
  URGENT: "help.priority.urgent",
} as const satisfies Record<SupportPriority, string>;

export const PRIORITY_HINT_KEYS = {
  LOW: "help.priority.lowHint",
  NORMAL: "help.priority.normalHint",
  HIGH: "help.priority.highHint",
  URGENT: "help.priority.urgentHint",
} as const satisfies Record<SupportPriority, string>;

export const PRIORITY_TAG_VARIANT = {
  LOW: "neutral",
  NORMAL: "neutral",
  HIGH: "warning",
  URGENT: "error",
} as const satisfies Record<SupportPriority, "neutral" | "warning" | "error">;

export const isDone = (status: SupportStatus) =>
  status === "RESOLVED" || status === "CLOSED";

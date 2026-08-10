import type { TemplateId, TemplateProps } from "@4mica/email-client";
import { brand, formatMoney } from "@components/index";
import Announcement from "@emails/marketing/Announcement";
import WeeklyReport from "@emails/marketing/WeeklyReport";
import ActionRequired from "@emails/onboarding/ActionRequired";
import Welcome from "@emails/onboarding/Welcome";
import AccountDeleted from "@emails/platform/AccountDeleted";
import AgentCreated from "@emails/platform/AgentCreated";
import CreditLimitChanged from "@emails/platform/CreditLimitChanged";
import DisputeCreated from "@emails/platform/DisputeCreated";
import PaymentSucceeded from "@emails/platform/PaymentSucceeded";
import PayoutPaid from "@emails/platform/PayoutPaid";
import Receipt from "@emails/platform/Receipt";
import SubscriptionExpiration from "@emails/platform/SubscriptionExpiration";
import SubscriptionRenewed from "@emails/platform/SubscriptionRenewed";
import WaitlistConfirmation from "@emails/platform/WaitlistConfirmation";
import WaitlistInvitation from "@emails/platform/WaitlistInvitation";
import WorkspaceInvite from "@emails/platform/WorkspaceInvite";
import type { ReactElement } from "react";

/**
 * Everything that differs between two emails, in one place. The route, the
 * request validation, the OpenAPI body schema and the client method are all
 * derived from this map plus the shared schema map in `@4mica/email-client`,
 * so adding a template is a single entry here rather than an edit in five
 * files.
 */
export interface TemplateDefinition<K extends TemplateId> {
  /** Shown as the OpenAPI operation summary. */
  summary: string;
  subject: (props: TemplateProps<K>) => string;
  component: (props: TemplateProps<K>) => ReactElement;
  /** Overrides config.email.replyTo for this template only. */
  replyTo?: string;
}

const define = <K extends TemplateId>(
  definition: TemplateDefinition<K>,
): TemplateDefinition<K> => definition;

export const registry = {
  welcome: define<"welcome">({
    summary: "Welcome a newly registered user",
    subject: () => `Welcome to ${brand.name}`,
    component: Welcome,
  }),

  "action-required": define<"action-required">({
    summary: "Ask the user to complete a required step",
    subject: ({ actionText }) => `Action required: ${actionText}`,
    component: ActionRequired,
  }),

  "waitlist-confirmation": define<"waitlist-confirmation">({
    summary: "Confirm a waitlist signup",
    subject: () => `You're on the ${brand.name} waitlist`,
    component: WaitlistConfirmation,
  }),

  "waitlist-invitation": define<"waitlist-invitation">({
    summary: "Invite a waitlisted user to sign up",
    subject: () => `Your ${brand.name} invite is ready`,
    component: WaitlistInvitation,
  }),

  "workspace-invite": define<"workspace-invite">({
    summary: "Invite someone to a workspace",
    subject: ({ workspaceName }) => `Join ${workspaceName} on ${brand.name}`,
    component: WorkspaceInvite,
  }),

  receipt: define<"receipt">({
    summary: "Send a purchase receipt",
    subject: ({ orderNumber }) => `Your ${brand.name} receipt ${orderNumber}`,
    component: Receipt,
    replyTo: "billing@4mica.io",
  }),

  "subscription-expiration": define<"subscription-expiration">({
    summary: "Warn that a subscription is about to expire",
    subject: ({ planName }) => `Your ${planName} plan expires soon`,
    component: SubscriptionExpiration,
    replyTo: "billing@4mica.io",
  }),

  "subscription-renewed": define<"subscription-renewed">({
    summary: "Confirm a subscription renewal",
    subject: ({ planName }) => `Your ${planName} plan renewed`,
    component: SubscriptionRenewed,
    replyTo: "billing@4mica.io",
  }),

  "payment-succeeded": define<"payment-succeeded">({
    summary: "Notify that a payment settled",
    subject: ({ amount }) =>
      `Payment of ${formatMoney(amount.amount, amount.currency)} succeeded`,
    component: PaymentSucceeded,
  }),

  "payout-paid": define<"payout-paid">({
    summary: "Notify that a payout was sent",
    subject: ({ amount }) =>
      `Payout of ${formatMoney(amount.amount, amount.currency)} is on its way`,
    component: PayoutPaid,
  }),

  "dispute-created": define<"dispute-created">({
    summary: "Alert that a dispute was opened",
    subject: ({ amount }) =>
      `Action needed: dispute on ${formatMoney(amount.amount, amount.currency)}`,
    component: DisputeCreated,
  }),

  "credit-limit-changed": define<"credit-limit-changed">({
    summary: "Notify that a credit limit changed",
    subject: ({ newLimit }) =>
      `Your credit limit is now ${formatMoney(newLimit.amount, newLimit.currency)}`,
    component: CreditLimitChanged,
  }),

  "agent-created": define<"agent-created">({
    summary: "Confirm that an agent was registered",
    subject: ({ agentName }) => `${agentName} is registered and ready`,
    component: AgentCreated,
  }),

  "account-deleted": define<"account-deleted">({
    summary: "Confirm that an account was deleted",
    subject: () => `Your ${brand.name} account has been deleted`,
    component: AccountDeleted,
  }),

  "weekly-report": define<"weekly-report">({
    summary: "Send the weekly activity digest",
    subject: () => `Your week on ${brand.name}`,
    component: WeeklyReport,
  }),

  announcement: define<"announcement">({
    summary: "Send a product announcement",
    subject: ({ title }) => title,
    component: Announcement,
  }),
} satisfies { [K in TemplateId]: TemplateDefinition<K> };

export type Registry = typeof registry;

/**
 * The registry is keyed by a literal union, so reading it with a `TemplateId`
 * variable widens every payload to the union of all payloads. Callers that
 * already hold a matching `(id, props)` pair go through here instead.
 */
export const getTemplate = <K extends TemplateId>(
  id: K,
): TemplateDefinition<K> => registry[id] as TemplateDefinition<K>;

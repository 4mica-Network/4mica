import type * as v from "valibot";
import {
  AccountDeletedSchema,
  ActionRequiredSchema,
  AgentCreatedSchema,
  AnnouncementSchema,
  CreditLimitChangedSchema,
  DisputeCreatedSchema,
  PaymentSucceededSchema,
  PayoutPaidSchema,
  ReceiptSchema,
  SubscriptionExpirationSchema,
  SubscriptionRenewedSchema,
  WaitlistConfirmationSchema,
  WaitlistInvitationSchema,
  WeeklyReportSchema,
  WelcomeSchema,
  WorkspaceInviteSchema,
} from "./payloads";

/**
 * The whole email contract in one object. Adding a template means adding one
 * entry here — the service derives its routes, its request validation and its
 * OpenAPI body schemas from this map, and the client derives its method
 * signatures from it, so the two sides cannot drift apart.
 */
export const templateSchemas = {
  welcome: WelcomeSchema,
  "action-required": ActionRequiredSchema,
  "waitlist-confirmation": WaitlistConfirmationSchema,
  "waitlist-invitation": WaitlistInvitationSchema,
  "workspace-invite": WorkspaceInviteSchema,
  receipt: ReceiptSchema,
  "subscription-expiration": SubscriptionExpirationSchema,
  "subscription-renewed": SubscriptionRenewedSchema,
  "payment-succeeded": PaymentSucceededSchema,
  "payout-paid": PayoutPaidSchema,
  "dispute-created": DisputeCreatedSchema,
  "credit-limit-changed": CreditLimitChangedSchema,
  "agent-created": AgentCreatedSchema,
  "account-deleted": AccountDeletedSchema,
  "weekly-report": WeeklyReportSchema,
  announcement: AnnouncementSchema,
} as const;

export type TemplateSchemas = typeof templateSchemas;
export type TemplateId = keyof TemplateSchemas;

/** What a caller sends: fields with a schema default stay optional. */
export type TemplatePayload<K extends TemplateId> = v.InferInput<
  TemplateSchemas[K]
>;

/** What a template renders with: defaults already applied by validation. */
export type TemplateProps<K extends TemplateId> = v.InferOutput<
  TemplateSchemas[K]
>;

export const templateIds = Object.keys(templateSchemas) as TemplateId[];

export const isTemplateId = (value: string): value is TemplateId =>
  Object.hasOwn(templateSchemas, value);

/** The service exposes exactly one route per template, at this path. */
export const templatePath = (id: TemplateId): string => `/emails/${id}`;

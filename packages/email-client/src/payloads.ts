import * as v from "valibot";

const emailAddress = v.pipe(
  v.string(),
  v.trim(),
  v.email("Must be a valid email address"),
);

const absoluteUrl = v.pipe(
  v.string(),
  v.trim(),
  v.url("Must be an absolute URL"),
);

const nonEmpty = (label: string) =>
  v.pipe(v.string(), v.trim(), v.minLength(1, `${label} is required`));

/**
 * Money is carried as a minor-unit integer plus an ISO-4217 code rather than a
 * pre-formatted string, so the template — not the caller — decides how it
 * renders. `2500` + `USD` becomes `$25.00`.
 */
const money = v.object({
  amount: v.pipe(v.number(), v.integer("amount must be in minor units")),
  currency: v.pipe(
    v.string(),
    v.trim(),
    v.length(3, "currency must be a 3-letter ISO-4217 code"),
  ),
});

export type Money = v.InferInput<typeof money>;

/**
 * Fields every template accepts. `idempotencyKey` is forwarded to Resend so a
 * retried send never produces a duplicate message.
 */
export const BaseEmailSchema = v.object({
  to: emailAddress,
  userName: v.optional(v.string(), "there"),
  idempotencyKey: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(256))),
});

export type BaseEmailPayload = v.InferInput<typeof BaseEmailSchema>;

const base = BaseEmailSchema.entries;

// --- Onboarding -------------------------------------------------------------

export const WelcomeSchema = v.object({
  ...base,
  ctaUrl: v.optional(absoluteUrl),
});

export const ActionRequiredSchema = v.object({
  ...base,
  actionText: nonEmpty("actionText"),
  actionUrl: absoluteUrl,
  reason: v.optional(v.string()),
});

// --- Waitlist & access ------------------------------------------------------

export const WaitlistConfirmationSchema = v.object({
  ...base,
  position: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
});

export const WaitlistInvitationSchema = v.object({
  ...base,
  actionUrl: absoluteUrl,
  expiresInDays: v.optional(
    v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(365)),
    7,
  ),
});

export const WorkspaceInviteSchema = v.object({
  ...base,
  workspaceName: nonEmpty("workspaceName"),
  inviteUrl: absoluteUrl,
  invitedByName: v.optional(v.string()),
  expiresInDays: v.optional(
    v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(365)),
  ),
});

// --- Billing ----------------------------------------------------------------

export const ReceiptSchema = v.object({
  ...base,
  orderNumber: nonEmpty("orderNumber"),
  purchaseDate: v.pipe(v.string(), v.isoTimestamp()),
  total: money,
  items: v.pipe(
    v.array(
      v.object({
        name: nonEmpty("item name"),
        quantity: v.pipe(v.number(), v.integer(), v.minValue(1)),
        price: money,
      }),
    ),
    v.minLength(1, "receipt must contain at least one item"),
  ),
  invoiceUrl: v.optional(absoluteUrl),
});

export const SubscriptionExpirationSchema = v.object({
  ...base,
  planName: nonEmpty("planName"),
  expiresAt: v.pipe(v.string(), v.isoTimestamp()),
  manageBillingUrl: absoluteUrl,
});

export const SubscriptionRenewedSchema = v.object({
  ...base,
  planName: nonEmpty("planName"),
  renewedAt: v.pipe(v.string(), v.isoTimestamp()),
  nextInvoiceDate: v.optional(v.pipe(v.string(), v.isoTimestamp())),
  amount: v.optional(money),
  manageBillingUrl: absoluteUrl,
});

// --- Platform events --------------------------------------------------------
// These mirror the event ids in apps/be/src/services/webhook-events.ts.

export const PaymentSucceededSchema = v.object({
  ...base,
  paymentId: nonEmpty("paymentId"),
  amount: money,
  paidAt: v.pipe(v.string(), v.isoTimestamp()),
  agentName: v.optional(v.string()),
  receiptUrl: v.optional(absoluteUrl),
});

export const PayoutPaidSchema = v.object({
  ...base,
  payoutId: nonEmpty("payoutId"),
  amount: money,
  paidAt: v.pipe(v.string(), v.isoTimestamp()),
  destination: v.optional(v.string()),
  dashboardUrl: v.optional(absoluteUrl),
});

export const DisputeCreatedSchema = v.object({
  ...base,
  disputeId: nonEmpty("disputeId"),
  amount: money,
  reason: v.optional(v.string()),
  respondByAt: v.optional(v.pipe(v.string(), v.isoTimestamp())),
  disputeUrl: absoluteUrl,
});

export const CreditLimitChangedSchema = v.object({
  ...base,
  previousLimit: money,
  newLimit: money,
  effectiveAt: v.pipe(v.string(), v.isoTimestamp()),
  dashboardUrl: v.optional(absoluteUrl),
});

export const AgentCreatedSchema = v.object({
  ...base,
  agentName: nonEmpty("agentName"),
  agentId: nonEmpty("agentId"),
  agentUrl: v.optional(absoluteUrl),
});

export const AccountDeletedSchema = v.object({
  ...base,
  deletedAt: v.pipe(v.string(), v.isoTimestamp()),
  restoreWindowDays: v.optional(
    v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(365)),
  ),
  feedbackUrl: v.optional(absoluteUrl),
});

// --- Digest & announcements -------------------------------------------------

export const WeeklyReportSchema = v.object({
  ...base,
  periodStart: v.pipe(v.string(), v.isoTimestamp()),
  periodEnd: v.pipe(v.string(), v.isoTimestamp()),
  summary: nonEmpty("summary"),
  metrics: v.optional(
    v.array(
      v.object({
        label: nonEmpty("metric label"),
        value: v.string(),
        /** Percentage change vs the previous period, e.g. 12.5 or -3. */
        change: v.optional(v.number()),
      }),
    ),
    [],
  ),
  dashboardUrl: v.optional(absoluteUrl),
});

export const AnnouncementSchema = v.object({
  ...base,
  title: nonEmpty("title"),
  body: nonEmpty("body"),
  ctaText: v.optional(v.string()),
  ctaUrl: v.optional(absoluteUrl),
});

export type WelcomePayload = v.InferInput<typeof WelcomeSchema>;
export type ActionRequiredPayload = v.InferInput<typeof ActionRequiredSchema>;
export type WaitlistConfirmationPayload = v.InferInput<
  typeof WaitlistConfirmationSchema
>;
export type WaitlistInvitationPayload = v.InferInput<
  typeof WaitlistInvitationSchema
>;
export type WorkspaceInvitePayload = v.InferInput<typeof WorkspaceInviteSchema>;
export type ReceiptPayload = v.InferInput<typeof ReceiptSchema>;
export type SubscriptionExpirationPayload = v.InferInput<
  typeof SubscriptionExpirationSchema
>;
export type SubscriptionRenewedPayload = v.InferInput<
  typeof SubscriptionRenewedSchema
>;
export type PaymentSucceededPayload = v.InferInput<
  typeof PaymentSucceededSchema
>;
export type PayoutPaidPayload = v.InferInput<typeof PayoutPaidSchema>;
export type DisputeCreatedPayload = v.InferInput<typeof DisputeCreatedSchema>;
export type CreditLimitChangedPayload = v.InferInput<
  typeof CreditLimitChangedSchema
>;
export type AgentCreatedPayload = v.InferInput<typeof AgentCreatedSchema>;
export type AccountDeletedPayload = v.InferInput<typeof AccountDeletedSchema>;
export type WeeklyReportPayload = v.InferInput<typeof WeeklyReportSchema>;
export type AnnouncementPayload = v.InferInput<typeof AnnouncementSchema>;

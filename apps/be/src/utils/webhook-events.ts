export interface WebhookEventDefinition {
  slug: string;
  group: string;
  description: string;
}

/**
 * The catalog a customer can subscribe to. Kept in code rather than a Postgres
 * enum so adding an event does not need a migration; valibot validates against
 * this list on write.
 */
export const WEBHOOK_EVENTS: WebhookEventDefinition[] = [
  {
    slug: "payment.succeeded",
    group: "Payments",
    description: "An x402 payment settled successfully",
  },
  {
    slug: "payment.failed",
    group: "Payments",
    description: "A payment attempt was declined or errored",
  },
  {
    slug: "payment.refunded",
    group: "Payments",
    description: "A settled payment was refunded",
  },
  {
    slug: "payout.paid",
    group: "Payouts",
    description: "A payout reached the destination account",
  },
  {
    slug: "payout.failed",
    group: "Payouts",
    description: "A payout was returned or rejected",
  },
  {
    slug: "dispute.created",
    group: "Disputes",
    description: "A counterparty opened a dispute",
  },
  {
    slug: "dispute.resolved",
    group: "Disputes",
    description: "A dispute was closed",
  },
  {
    slug: "agent.created",
    group: "Agents",
    description: "A new agent was registered on the account",
  },
  {
    slug: "agent.updated",
    group: "Agents",
    description: "An agent's configuration changed",
  },
  {
    slug: "agent.suspended",
    group: "Agents",
    description: "An agent was suspended from trading",
  },
  {
    slug: "credit.limit_changed",
    group: "Credit",
    description: "An agent's credit limit was raised or lowered",
  },
];

export const WEBHOOK_EVENT_SLUGS = WEBHOOK_EVENTS.map((event) => event.slug);

const SLUGS = new Set(WEBHOOK_EVENT_SLUGS);

export const isKnownEvent = (slug: string): boolean => SLUGS.has(slug);

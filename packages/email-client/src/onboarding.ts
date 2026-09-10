import type * as v from "valibot";
import { OnboardingStepSchema } from "./payloads";

/**
 * The onboarding drip, in send order.
 *
 * The index of an id *is* its position in the sequence, which
 * `apps/be/src/jobs/onboarding` persists as `OnboardingEmailQueue.sequenceIndex`.
 * Rows already in flight point at these positions, so **append only** — never
 * reorder or delete an id, or every enrolled user silently jumps to a different
 * email.
 *
 * Ids are digit-free kebab-case on purpose: `client.test.ts` asserts every
 * template id matches `/^[a-z]+(-[a-z]+)*$/`, so `onboarding-x402-basics` or
 * `onboarding-01-welcome` would fail the contract test.
 *
 * Step one reuses the pre-existing `welcome` template rather than shipping a
 * second "Welcome to 4Mica" email alongside it.
 */
export const ONBOARDING_STEP_IDS = [
  "welcome",
  "onboarding-finish-setup",
  "onboarding-api-keys",
  "onboarding-profile-and-handle",
  "onboarding-business-and-kyb",
  "onboarding-how-payments-work",
  "onboarding-transaction-lifecycle",
  "onboarding-deposits-and-withdrawals",
  "onboarding-no-custodial-risk",
  "onboarding-collateral-ratios",
  "onboarding-bilateral-netting",
  "onboarding-settlements",
  "onboarding-earning-yield",
  "onboarding-buyer-quick-start",
  "onboarding-budgets-and-limits",
  "onboarding-safety-and-permissions",
  "onboarding-payment-proof-and-audit",
  "onboarding-automatic-paid-requests",
  "onboarding-seller-quick-start",
  "onboarding-payment-middleware",
  "onboarding-pricing-and-monetization",
  "onboarding-microtransactions",
  "onboarding-proof-and-disputes",
  "onboarding-typescript-sdk",
  "onboarding-framework-quickstarts",
  "onboarding-cli-and-examples",
  "onboarding-facilitator",
  "onboarding-webhooks",
  "onboarding-test-in-sandbox",
  "onboarding-go-live-and-support",
] as const;

export type OnboardingStepId = (typeof ONBOARDING_STEP_IDS)[number];

export const isOnboardingStepId = (value: string): value is OnboardingStepId =>
  (ONBOARDING_STEP_IDS as readonly string[]).includes(value);

/**
 * Every drip step takes the same props, so they share one schema. The steps
 * differ in copy, which lives in `apps/email` — not in this contract.
 *
 * The mapped-type assertion keeps `TemplateId` a precise literal union, so the
 * `satisfies { [K in TemplateId]: … }` clause in the service's registry still
 * turns a missing template into a compile error.
 */
export const onboardingStepSchemas = Object.fromEntries(
  ONBOARDING_STEP_IDS.map((id) => [id, OnboardingStepSchema]),
) as { [K in OnboardingStepId]: typeof OnboardingStepSchema };

/** Convenience for callers that only ever address drip steps. */
export type OnboardingStepPayload = v.InferInput<typeof OnboardingStepSchema>;

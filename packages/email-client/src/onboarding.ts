import type * as v from "valibot";
import { OnboardingStepSchema } from "./payloads";

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

export const onboardingStepSchemas = Object.fromEntries(
  ONBOARDING_STEP_IDS.map((id) => [id, OnboardingStepSchema]),
) as { [K in OnboardingStepId]: typeof OnboardingStepSchema };

export type OnboardingStepPayload = v.InferInput<typeof OnboardingStepSchema>;

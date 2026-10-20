import {
  ONBOARDING_STEP_IDS,
  type OnboardingStepId,
} from "@4mica/email-client";
import { config } from "@config/index";

export interface OnboardingStep {
  id: OnboardingStepId;
  gapMs: number;
}

export const ONBOARDING_STEPS: readonly OnboardingStep[] =
  ONBOARDING_STEP_IDS.map((id) => ({ id, gapMs: config.onboarding.stepGapMs }));

export const STEP_COUNT = ONBOARDING_STEPS.length;

export const stepAt = (index: number): OnboardingStep | null =>
  ONBOARDING_STEPS[index] ?? null;

export const RETRY_BACKOFF_MS: readonly number[] = [
  60_000, 300_000, 1_800_000, 7_200_000, 21_600_000,
];

export const MAX_ATTEMPTS = RETRY_BACKOFF_MS.length;

export const backoffFor = (attempts: number): number =>
  RETRY_BACKOFF_MS[Math.min(Math.max(attempts - 1, 0), MAX_ATTEMPTS - 1)] ??
  RETRY_BACKOFF_MS[MAX_ATTEMPTS - 1];

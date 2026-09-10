import {
  ONBOARDING_STEP_IDS,
  type OnboardingStepId,
} from "@4mica/email-client";
import { config } from "@config/index";

export interface OnboardingStep {
  id: OnboardingStepId;
  /**
   * Delay from the previous step's send before this one becomes due. Step zero
   * measures from the moment the user was created.
   */
  gapMs: number;
}

/**
 * The drip, in order. The index of a step *is* its `sequenceIndex` in the
 * database, so this list must only ever be appended to — see
 * `@4mica/email-client`'s `ONBOARDING_STEP_IDS`, which is the source of order.
 *
 * The gap is uniform today but modelled per-step so a future "day 1, day 3, day
 * 7, then weekly" curve needs no schema change.
 */
export const ONBOARDING_STEPS: readonly OnboardingStep[] =
  ONBOARDING_STEP_IDS.map((id) => ({ id, gapMs: config.onboarding.stepGapMs }));

export const STEP_COUNT = ONBOARDING_STEPS.length;

export const stepAt = (index: number): OnboardingStep | null =>
  ONBOARDING_STEPS[index] ?? null;

/**
 * Backoff for a step that failed, indexed by the attempt just made.
 * 1 min, 5 min, 30 min, 2 h, 6 h.
 */
export const RETRY_BACKOFF_MS: readonly number[] = [
  60_000, 300_000, 1_800_000, 7_200_000, 21_600_000,
];

/**
 * After this many consecutive failures the step is abandoned and the sequence
 * moves on. One template that renders badly must not wedge every user forever.
 */
export const MAX_ATTEMPTS = RETRY_BACKOFF_MS.length;

export const backoffFor = (attempts: number): number =>
  RETRY_BACKOFF_MS[Math.min(Math.max(attempts - 1, 0), MAX_ATTEMPTS - 1)] ??
  RETRY_BACKOFF_MS[MAX_ATTEMPTS - 1];

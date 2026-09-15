import { ONBOARDING_STEP_IDS } from "@4mica/email-client";
import { describe, expect, it } from "vitest";
import {
  backoffFor,
  MAX_ATTEMPTS,
  ONBOARDING_STEPS,
  RETRY_BACKOFF_MS,
  STEP_COUNT,
  stepAt,
} from "./steps";

describe("onboarding steps", () => {
  it("mirrors the contract's order exactly", () => {
    expect(ONBOARDING_STEPS.map((step) => step.id)).toEqual([
      ...ONBOARDING_STEP_IDS,
    ]);
  });

  it("is thirty steps long", () => {
    expect(STEP_COUNT).toBe(30);
  });

  it("gives every step a positive gap", () => {
    for (const step of ONBOARDING_STEPS) {
      expect(step.gapMs).toBeGreaterThan(0);
    }
  });

  it("returns null outside the sequence", () => {
    expect(stepAt(0)?.id).toBe("welcome");
    expect(stepAt(STEP_COUNT - 1)).not.toBeNull();
    expect(stepAt(STEP_COUNT)).toBeNull();
    expect(stepAt(-1)).toBeNull();
  });

  it("backs off monotonically", () => {
    for (let i = 1; i < RETRY_BACKOFF_MS.length; i++) {
      expect(RETRY_BACKOFF_MS[i]).toBeGreaterThan(
        RETRY_BACKOFF_MS[i - 1] as number,
      );
    }
  });

  it("clamps the backoff at both ends", () => {
    expect(backoffFor(0)).toBe(RETRY_BACKOFF_MS[0]);
    expect(backoffFor(1)).toBe(RETRY_BACKOFF_MS[0]);
    expect(backoffFor(MAX_ATTEMPTS)).toBe(RETRY_BACKOFF_MS[MAX_ATTEMPTS - 1]);
    expect(backoffFor(999)).toBe(RETRY_BACKOFF_MS[MAX_ATTEMPTS - 1]);
  });
});

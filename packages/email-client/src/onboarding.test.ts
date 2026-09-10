import { describe, expect, it } from "vitest";
import {
  isOnboardingStepId,
  ONBOARDING_STEP_IDS,
  onboardingStepSchemas,
} from "./onboarding";
import { OnboardingStepSchema } from "./payloads";
import { templateIds, templateSchemas } from "./templates";

describe("onboarding drip contract", () => {
  it("is thirty steps long", () => {
    expect(ONBOARDING_STEP_IDS).toHaveLength(30);
  });

  it("starts at the pre-existing welcome template", () => {
    expect(ONBOARDING_STEP_IDS[0]).toBe("welcome");
  });

  it("has no duplicate ids", () => {
    expect(new Set(ONBOARDING_STEP_IDS).size).toBe(ONBOARDING_STEP_IDS.length);
  });

  // Sequence positions are persisted as OnboardingEmailQueue.sequenceIndex, so
  // a digit in an id is not the only way to break ordering — but it is the one
  // the existing kebab-case contract test would catch late.
  it("uses digit-free kebab-case ids", () => {
    for (const id of ONBOARDING_STEP_IDS) {
      expect(id).toMatch(/^[a-z]+(-[a-z]+)*$/);
    }
  });

  it("registers every step in the template contract", () => {
    for (const id of ONBOARDING_STEP_IDS) {
      expect(templateIds).toContain(id);
      expect(templateSchemas[id]).toBe(OnboardingStepSchema);
    }
  });

  it("exposes one schema entry per step", () => {
    expect(Object.keys(onboardingStepSchemas).sort()).toEqual(
      [...ONBOARDING_STEP_IDS].sort(),
    );
  });

  it("narrows a string to a step id", () => {
    expect(isOnboardingStepId("onboarding-api-keys")).toBe(true);
    expect(isOnboardingStepId("receipt")).toBe(false);
    expect(isOnboardingStepId("nope")).toBe(false);
  });
});

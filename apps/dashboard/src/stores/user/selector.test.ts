import { describe, expect, it } from "vitest";
import type { RootState } from "..";
import { INITIAL_STATE } from "./reducer";
import {
  selectHasCompletedOnboarding,
  selectNeedsOnboarding,
} from "./selector";
import type { User, UserState } from "./type";

const stateWith = (user: UserState["user"]): RootState =>
  ({ user: { ...INITIAL_STATE, user } }) as RootState;

describe("onboarding selectors", () => {
  it("does not ask for onboarding before GET /me resolves", () => {
    // The contract that stops the blocking modal flashing over the app on every
    // page load. Do not "simplify" this to !completeOnboarding.
    expect(selectNeedsOnboarding(stateWith(null))).toBe(false);
    expect(selectHasCompletedOnboarding(stateWith(null))).toBe(false);
  });

  it("asks for onboarding once a user arrives without the flag", () => {
    const user = { completeOnboarding: false } as User;

    expect(selectNeedsOnboarding(stateWith(user))).toBe(true);
    expect(selectHasCompletedOnboarding(stateWith(user))).toBe(false);
  });

  it("stops asking once the flag is set", () => {
    const user = { completeOnboarding: true } as User;

    expect(selectNeedsOnboarding(stateWith(user))).toBe(false);
    expect(selectHasCompletedOnboarding(stateWith(user))).toBe(true);
  });

  it("stays quiet when the fetch failed and left no user", () => {
    const failed = {
      user: { ...INITIAL_STATE, user: null, error: "network down" },
    } as RootState;

    expect(selectNeedsOnboarding(failed)).toBe(false);
    expect(selectHasCompletedOnboarding(failed)).toBe(false);
  });
});

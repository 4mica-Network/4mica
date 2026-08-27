import { describe, expect, it } from "vitest";
import {
  checkUsername,
  checkUsernameFailed,
  checkUsernameSucceeded,
  completeOnboarding,
  resetUsernameCheck,
  updateBusinessFailed,
  updateProfile,
  updateUserFailed,
  updateUserSucceeded,
} from "./actions";
import reducer, { INITIAL_STATE } from "./reducer";
import type { Business, User, UserState } from "./type";

const user = { private: true, hidden: false, name: "Ada" } as User;

const seeded: UserState = { ...INITIAL_STATE, user };

describe("user reducer optimistic updates", () => {
  it("applies the change immediately and marks the section saving", () => {
    const next = reducer(
      seeded,
      updateProfile({ private: false }, "visibility"),
    );

    expect(next.user?.private).toBe(false);
    expect(next.savingSections.visibility).toBe(true);
    expect(next.rollback).toEqual({ private: true });
  });

  it("keeps the server response and clears saving on success", () => {
    const pending = reducer(
      seeded,
      updateProfile({ private: false }, "visibility"),
    );
    const done = reducer(
      pending,
      updateUserSucceeded({ ...user, private: false } as User, {
        section: "visibility",
      }),
    );

    expect(done.user?.private).toBe(false);
    expect(done.savingSections).toEqual({});
    expect(done.rollback).toBeNull();
  });

  it("reverts the optimistic change when the write fails", () => {
    const pending = reducer(
      seeded,
      updateProfile({ private: false }, "visibility"),
    );
    const failed = reducer(
      pending,
      updateUserFailed("nope", {}, { section: "visibility" }),
    );

    expect(failed.user?.private).toBe(true);
    expect(failed.savingSections).toEqual({});
    expect(failed.error).toBe("nope");
  });

  it("surfaces field issues so the form can highlight them", () => {
    const failed = reducer(
      seeded,
      updateUserFailed("bad", { username: "taken" }, { section: "identity" }),
    );

    expect(failed.validationIssues).toEqual({ username: "taken" });
  });

  it("tracks each card independently", () => {
    let state = reducer(
      seeded,
      updateProfile({ private: false }, "visibility"),
    );
    state = reducer(state, updateProfile({ name: "Grace" }, "identity"));

    expect(state.savingSections).toEqual({ visibility: true, identity: true });

    state = reducer(
      state,
      updateUserSucceeded(state.user as User, { section: "visibility" }),
    );

    expect(state.savingSections).toEqual({ identity: true });
  });

  it("does not lose the original value when two writes overlap", () => {
    let state = reducer(
      seeded,
      updateProfile({ private: false }, "visibility"),
    );
    state = reducer(state, updateProfile({ hidden: true }, "visibility"));

    // The first snapshot must survive so a rollback restores the true original.
    expect(state.rollback).toEqual({ private: true });

    state = reducer(
      state,
      updateUserFailed("nope", {}, { section: "visibility" }),
    );

    expect(state.user?.private).toBe(true);
  });
});

describe("username availability check", () => {
  it("records the candidate it is checking", () => {
    const next = reducer(seeded, checkUsername("ada"));

    expect(next.usernameCheck).toEqual({ value: "ada", status: "checking" });
  });

  it("applies a verdict for the candidate in flight", () => {
    const checking = reducer(seeded, checkUsername("ada"));
    const done = reducer(checking, checkUsernameSucceeded("ada", true, null));

    expect(done.usernameCheck.status).toBe("available");
  });

  it("maps an unavailable verdict to its reason", () => {
    const checking = reducer(seeded, checkUsername("pricing"));
    const done = reducer(
      checking,
      checkUsernameSucceeded("pricing", false, "reserved"),
    );

    expect(done.usernameCheck.status).toBe("reserved");
  });

  it("carries the blacklisted reason through as its own status", () => {
    const checking = reducer(seeded, checkUsername("google"));
    const done = reducer(
      checking,
      checkUsernameSucceeded("google", false, "blacklisted"),
    );

    expect(done.usernameCheck.status).toBe("blacklisted");
  });

  it("ignores a verdict for a candidate the user has already typed past", () => {
    const stale = reducer(seeded, checkUsername("ad"));
    const current = reducer(stale, checkUsername("ada"));
    const raced = reducer(current, checkUsernameSucceeded("ad", true, null));

    expect(raced.usernameCheck).toEqual({ value: "ada", status: "checking" });
  });

  it("ignores a failure for a stale candidate too", () => {
    const current = reducer(seeded, checkUsername("ada"));
    const raced = reducer(current, checkUsernameFailed("ad"));

    expect(raced.usernameCheck.status).toBe("checking");
  });

  it("clears the verdict on reset", () => {
    const checking = reducer(seeded, checkUsername("ada"));
    const cleared = reducer(checking, resetUsernameCheck());

    expect(cleared.usernameCheck).toEqual({ value: "", status: "idle" });
  });
});

describe("completing onboarding", () => {
  const withBusiness: UserState = {
    ...seeded,
    business: { legalName: "Old Ltd", country: "GB" } as Business,
  };

  it("optimistically applies the business patch and marks the section saving", () => {
    const next = reducer(
      withBusiness,
      completeOnboarding({ legalName: "Analytical Engines Ltd" }),
    );

    expect(next.business?.legalName).toBe("Analytical Engines Ltd");
    expect(next.savingSections["onboarding.business"]).toBe(true);
    expect(next.businessRollback).toEqual({ legalName: "Old Ltd" });
  });

  it("reverts the business when the write fails", () => {
    const pending = reducer(
      withBusiness,
      completeOnboarding({ legalName: "Analytical Engines Ltd" }),
    );
    const failed = reducer(
      pending,
      updateBusinessFailed("nope", {}, { section: "onboarding.business" }),
    );

    expect(failed.business?.legalName).toBe("Old Ltd");
    expect(failed.savingSections).toEqual({});
    expect(failed.error).toBe("nope");
  });

  it("sets the flag when the account write lands", () => {
    const done = reducer(
      seeded,
      updateUserSucceeded({ ...user, completeOnboarding: true } as User, {
        section: "onboarding.complete",
      }),
    );

    expect(done.user?.completeOnboarding).toBe(true);
  });
});

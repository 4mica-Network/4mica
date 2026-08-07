import { describe, expect, it } from "vitest";
import {
  updateProfile,
  updateUserFailed,
  updateUserSucceeded,
} from "./actions";
import reducer, { INITIAL_STATE } from "./reducer";
import type { User, UserState } from "./type";

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

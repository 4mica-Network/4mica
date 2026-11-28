import { describe, expect, it } from "vitest";
import { resetSession, withSessionReset } from "./session";

type State = { config: { version: string }; user: { email: string | null } };

const reducer = withSessionReset<State>(
  (
    state = { config: { version: "" }, user: { email: null } },
    action: { type: string },
  ) =>
    action.type === "LOAD"
      ? { config: { version: "v1" }, user: { email: "ada@example.com" } }
      : {
          config: state.config ?? { version: "" },
          user: state.user ?? { email: null },
        },
);

describe("withSessionReset", () => {
  it("drops every slice except the shared config on reset", () => {
    const loaded = reducer(undefined, { type: "LOAD" });
    expect(loaded.user.email).toBe("ada@example.com");

    const cleared = reducer(loaded, resetSession());

    expect(cleared.user).toEqual({ email: null });
    expect(cleared.config).toEqual({ version: "v1" });
  });

  it("passes every other action straight through", () => {
    const loaded = reducer(undefined, { type: "LOAD" });

    expect(reducer(loaded, { type: "OTHER" })).toEqual(loaded);
  });

  it("keeps the slices a reset names, alongside the config", () => {
    const loaded = reducer(undefined, { type: "LOAD" });

    const kept = reducer(loaded, resetSession(["user"]));

    expect(kept.user).toEqual({ email: "ada@example.com" });
    expect(kept.config).toEqual({ version: "v1" });
  });
});

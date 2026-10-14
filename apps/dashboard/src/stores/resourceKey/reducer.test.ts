import type { ApiKey } from "@stores/developer/type";
import { describe, expect, it } from "vitest";
import {
  createResourceKey,
  createResourceKeySucceeded,
  deleteResourceKeySucceeded,
  dismissRevealedResourceKey,
  fetchResourceKeysSucceeded,
  resetResourceKeys,
  resourceKeyActionFailed,
  revokeResourceKey,
  revokeResourceKeySucceeded,
} from "./actions";
import reducer, { INITIAL_STATE } from "./reducer";
import type { ResourceKeyState } from "./type";

const resource = { kind: "listing" as const, id: "listing_1" };

const key = (over: Partial<ApiKey> = {}): ApiKey => ({
  id: "key_1",
  name: "Production",
  prefix: "4mica_sk_ab12",
  last4: "wxyz",
  lastUsedAt: null,
  expiresAt: null,
  revokedAt: null,
  createdAt: "2026-10-08T00:00:00.000Z",
  updatedAt: "2026-10-08T00:00:00.000Z",
  ...over,
});

const seeded: ResourceKeyState = {
  ...INITIAL_STATE,
  items: [key()],
  hasLoaded: true,
};

describe("resourceKey reducer", () => {
  it("stores the fetched keys", () => {
    const state = reducer(INITIAL_STATE, fetchResourceKeysSucceeded([key()]));

    expect(state.items).toHaveLength(1);
    expect(state.hasLoaded).toBe(true);
    expect(state.isLoading).toBe(false);
  });

  it("marks only the acting row pending", () => {
    const state = reducer(seeded, revokeResourceKey(resource, "key_1"));

    expect(state.pending).toEqual({ "resourceKey:key_1": true });
  });

  it("tracks create separately from row actions", () => {
    let state = reducer(seeded, createResourceKey(resource, "New"));
    state = reducer(state, revokeResourceKey(resource, "key_1"));

    expect(state.pending).toEqual({
      createResourceKey: true,
      "resourceKey:key_1": true,
    });
  });

  it("prepends a created key and holds its plaintext for display", () => {
    const created = key({ id: "key_2", name: "New" });
    const state = reducer(
      seeded,
      createResourceKeySucceeded(
        created,
        { id: "key_2", plaintext: "4mica_sk_secret" },
        { pendingKey: "createResourceKey" },
      ),
    );

    expect(state.items[0].id).toBe("key_2");
    expect(state.revealed?.plaintext).toBe("4mica_sk_secret");
    expect(state.pending).toEqual({});
  });

  it("drops the plaintext once dismissed", () => {
    const state = reducer(
      { ...seeded, revealed: { id: "key_1", plaintext: "4mica_sk_secret" } },
      dismissRevealedResourceKey(),
    );

    expect(state.revealed).toBeNull();
  });

  it("replaces a revoked key in place rather than appending", () => {
    const revoked = key({ revokedAt: "2026-10-08T01:00:00.000Z" });
    const state = reducer(
      seeded,
      revokeResourceKeySucceeded(revoked, { pendingKey: "resourceKey:key_1" }),
    );

    expect(state.items).toHaveLength(1);
    expect(state.items[0].revokedAt).toBe("2026-10-08T01:00:00.000Z");
    expect(state.pending).toEqual({});
  });

  it("removes a deleted key and any plaintext still shown for it", () => {
    const state = reducer(
      { ...seeded, revealed: { id: "key_1", plaintext: "4mica_sk_secret" } },
      deleteResourceKeySucceeded("key_1", { pendingKey: "resourceKey:key_1" }),
    );

    expect(state.items).toEqual([]);
    expect(state.revealed).toBeNull();
  });

  it("keeps the message and field issues from a failure", () => {
    let state = reducer(seeded, createResourceKey(resource, "x"));
    state = reducer(
      state,
      resourceKeyActionFailed(
        "The request body failed validation.",
        { name: "is required" },
        { pendingKey: "createResourceKey" },
      ),
    );

    expect(state.error).toBe("The request body failed validation.");
    expect(state.validationIssues).toEqual({ name: "is required" });
    expect(state.pending).toEqual({});
  });

  it("clears everything on reset", () => {
    const state = reducer(
      { ...seeded, revealed: { id: "key_1", plaintext: "4mica_sk_secret" } },
      resetResourceKeys(),
    );

    expect(state).toEqual(INITIAL_STATE);
  });
});

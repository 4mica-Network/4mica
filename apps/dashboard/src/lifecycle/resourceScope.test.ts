import {
  createResourceKeySucceeded,
  fetchResourceKeys,
  resetResourceKeys,
} from "@stores/resourceKey/actions";
import resourceKeyReducer, {
  INITIAL_STATE as KEYS_INITIAL,
} from "@stores/resourceKey/reducer";
import type { ResourceRef } from "@stores/shared/type";
import { describe, expect, it } from "vitest";

const agentA: ResourceRef = { kind: "agent", id: "agt_a" };
const agentB: ResourceRef = { kind: "agent", id: "agt_b" };

const key = {
  id: "key_a",
  name: "A",
  prefix: "4mica_sk_ab12",
  last4: "wxyz",
  lastUsedAt: null,
  expiresAt: null,
  revokedAt: null,
  createdAt: "2026-08-05T00:00:00.000Z",
  updatedAt: "2026-08-05T00:00:00.000Z",
};

describe("secret keys stay on the resource they were created for", () => {
  it("does not reveal agent A's new key on agent B's page", () => {
    let state = resourceKeyReducer(KEYS_INITIAL, fetchResourceKeys(agentA));
    state = resourceKeyReducer(state, resetResourceKeys());
    state = resourceKeyReducer(state, fetchResourceKeys(agentB));

    state = resourceKeyReducer(
      state,
      createResourceKeySucceeded(
        key,
        { id: "key_a", plaintext: "4mica_sk_secret_for_a" },
        { pendingKey: "createResourceKey", resource: agentA },
      ),
    );

    expect(state.revealed).toBeNull();
    expect(state.items).toEqual([]);
    expect(state.resource).toEqual(agentB);
  });

  it("still reveals the key on the page that created it", () => {
    let state = resourceKeyReducer(KEYS_INITIAL, fetchResourceKeys(agentA));
    state = resourceKeyReducer(
      state,
      createResourceKeySucceeded(
        key,
        { id: "key_a", plaintext: "4mica_sk_secret_for_a" },
        { pendingKey: "createResourceKey", resource: agentA },
      ),
    );

    expect(state.revealed?.plaintext).toBe("4mica_sk_secret_for_a");
  });
});

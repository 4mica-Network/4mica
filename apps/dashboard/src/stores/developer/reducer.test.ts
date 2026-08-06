import { describe, expect, it } from "vitest";
import {
  createApiKey,
  createApiKeySucceeded,
  deleteApiKeySucceeded,
  developerActionFailed,
  dismissRevealedSecret,
  revokeApiKey,
  revokeApiKeySucceeded,
  updateWebhook,
  updateWebhookSucceeded,
} from "./actions";
import reducer, { INITIAL_STATE } from "./reducer";
import type { ApiKey, DeveloperState, Webhook } from "./type";

const key = (over: Partial<ApiKey> = {}): ApiKey => ({
  id: "key_1",
  name: "CI",
  prefix: "4mica_sk_ab12",
  last4: "wxyz",
  lastUsedAt: null,
  expiresAt: null,
  revokedAt: null,
  createdAt: "2026-08-05T00:00:00.000Z",
  updatedAt: "2026-08-05T00:00:00.000Z",
  ...over,
});

const hook = (over: Partial<Webhook> = {}): Webhook => ({
  id: "wh_1",
  url: "https://example.com/hook",
  description: null,
  events: ["payment.succeeded"],
  status: "ENABLED",
  secretPrefix: "whsec_ab12",
  lastDeliveryAt: null,
  lastDeliveryStatus: null,
  failureCount: 0,
  createdAt: "2026-08-05T00:00:00.000Z",
  updatedAt: "2026-08-05T00:00:00.000Z",
  ...over,
});

const seeded: DeveloperState = {
  ...INITIAL_STATE,
  apiKeys: [key()],
  webhooks: [hook()],
};

describe("developer reducer", () => {
  it("marks only the acting row pending", () => {
    const state = reducer(seeded, revokeApiKey({ id: "key_1" }));

    expect(state.pending).toEqual({ "apiKey:key_1": true });
    expect(state.pending["apiKey:key_2"]).toBeUndefined();
  });

  it("tracks create separately from row actions", () => {
    let state = reducer(seeded, createApiKey({ name: "New" }));
    state = reducer(state, revokeApiKey({ id: "key_1" }));

    expect(state.pending).toEqual({
      createApiKey: true,
      "apiKey:key_1": true,
    });
  });

  it("prepends a created key and holds its plaintext for display", () => {
    const created = key({ id: "key_2", name: "New" });
    const state = reducer(
      seeded,
      createApiKeySucceeded(
        created,
        { kind: "apiKey", id: "key_2", plaintext: "4mica_sk_secret" },
        { pendingKey: "createApiKey" },
      ),
    );

    expect(state.apiKeys[0].id).toBe("key_2");
    expect(state.revealed?.plaintext).toBe("4mica_sk_secret");
    expect(state.pending).toEqual({});
  });

  it("drops the plaintext once dismissed", () => {
    let state = reducer(
      seeded,
      createApiKeySucceeded(
        key({ id: "key_2" }),
        { kind: "apiKey", id: "key_2", plaintext: "secret" },
        { pendingKey: "createApiKey" },
      ),
    );
    state = reducer(state, dismissRevealedSecret());

    expect(state.revealed).toBeNull();
    // The key itself survives; only the secret is forgotten.
    expect(state.apiKeys).toHaveLength(2);
  });

  it("replaces a revoked key in place rather than appending", () => {
    const revoked = key({ revokedAt: "2026-08-05T01:00:00.000Z" });
    const state = reducer(
      seeded,
      revokeApiKeySucceeded(revoked, { pendingKey: "apiKey:key_1" }),
    );

    expect(state.apiKeys).toHaveLength(1);
    expect(state.apiKeys[0].revokedAt).not.toBeNull();
  });

  it("removes a deleted key", () => {
    const state = reducer(
      seeded,
      deleteApiKeySucceeded("key_1", { pendingKey: "apiKey:key_1" }),
    );

    expect(state.apiKeys).toHaveLength(0);
  });

  it("updates a webhook in place", () => {
    const state = reducer(
      seeded,
      updateWebhookSucceeded(hook({ status: "DISABLED" }), {
        pendingKey: "webhook:wh_1",
      }),
    );

    expect(state.webhooks).toHaveLength(1);
    expect(state.webhooks[0].status).toBe("DISABLED");
  });

  it("clears the pending row and surfaces field issues on failure", () => {
    let state = reducer(
      seeded,
      updateWebhook({ id: "wh_1", data: { url: "http://nope" } }),
    );
    state = reducer(
      state,
      developerActionFailed(
        "bad url",
        { url: "must be https" },
        {
          pendingKey: "webhook:wh_1",
        },
      ),
    );

    expect(state.pending).toEqual({});
    expect(state.error).toBe("bad url");
    expect(state.validationIssues).toEqual({ url: "must be https" });
  });
});

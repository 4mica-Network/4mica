import { describe, expect, it } from "vitest";
import {
  createApiKey,
  createApiKeySucceeded,
  createCliTokenSucceeded,
  deleteApiKeySucceeded,
  developerActionFailed,
  fetchCliSessionsFailed,
  fetchCliSessionsPending,
  fetchCliSessionsSucceeded,
  fetchDeveloperSucceeded,
  revokeApiKey,
  revokeApiKeySucceeded,
  revokeCliSession,
  revokeCliSessionSucceeded,
  updateWebhook,
  updateWebhookSucceeded,
} from "./actions";
import reducer, { INITIAL_STATE } from "./reducer";
import type { ApiKey, CliSession, DeveloperState, Webhook } from "./type";

const key = (over: Partial<ApiKey> = {}): ApiKey => ({
  id: "key_1",
  name: "CI",
  prefix: "4mica_sk_ab12",
  last4: "wxyz",
  environment: "SANDBOX",
  scopes: ["PAYMENTS_WRITE", "CUSTOMERS_READ", "RESOURCE_READ"],
  serviceAccountId: null,
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

  it("prepends a created key without keeping any plaintext", () => {
    const created = key({ id: "key_2", name: "New" });
    const state = reducer(
      seeded,
      createApiKeySucceeded(created, { pendingKey: "createApiKey" }),
    );

    expect(state.apiKeys[0].id).toBe("key_2");
    expect(state).not.toHaveProperty("revealed");
    expect(state.pending).toEqual({});
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

const cliSession = (over: Partial<CliSession> = {}): CliSession => ({
  id: "cli_1",
  kind: "DEVICE",
  name: "ada-laptop",
  prefix: "4mica_cli_ab12",
  last4: "wxyz",
  scopes: ["account:read"],
  lastUsedAt: null,
  expiresAt: "2026-11-05T00:00:00.000Z",
  createdAt: "2026-08-05T00:00:00.000Z",
  ...over,
});

describe("cli sessions", () => {
  it("puts a new token first in the list", () => {
    const state = reducer(
      { ...INITIAL_STATE, cliSessions: [cliSession()] },
      createCliTokenSucceeded(cliSession({ id: "cli_2", kind: "TOKEN" }), {
        pendingKey: "createCliToken",
      }),
    );

    expect(state.cliSessions.map((session) => session.id)).toEqual([
      "cli_2",
      "cli_1",
    ]);
  });

  it("drops a revoked session, and only that one", () => {
    const requested = revokeCliSession({ id: "cli_1" });
    const pending = reducer(
      {
        ...INITIAL_STATE,
        cliSessions: [cliSession(), cliSession({ id: "cli_2" })],
      },
      requested,
    );
    expect(pending.pending["cliSession:cli_1"]).toBe(true);

    const state = reducer(
      pending,
      revokeCliSessionSucceeded("cli_1", requested.meta),
    );

    expect(state.cliSessions.map((session) => session.id)).toEqual(["cli_2"]);
    expect(state.pending["cliSession:cli_1"]).toBeUndefined();
  });

  it("fails on its own, leaving keys and webhooks loaded", () => {
    const loaded = reducer(
      INITIAL_STATE,
      fetchDeveloperSucceeded({
        apiKeys: [key()],
        webhooks: [hook()],
        events: [],
      }),
    );
    const state = reducer(
      reducer(loaded, fetchCliSessionsPending()),
      fetchCliSessionsFailed("CLI sessions are unavailable"),
    );

    expect(state.hasLoaded).toBe(true);
    expect(state.error).toBeNull();
    expect(state.apiKeys).toHaveLength(1);
    expect(state.webhooks).toHaveLength(1);
    expect(state.cliSessionsError).toBe("CLI sessions are unavailable");
    expect(state.cliSessionsLoaded).toBe(false);
  });

  it("drops a list fetched before a revoke, so the session stays gone", () => {
    const listed = reducer(
      INITIAL_STATE,
      fetchCliSessionsSucceeded([cliSession(), cliSession({ id: "cli_2" })], 0),
    );
    const requested = revokeCliSession({ id: "cli_1" });
    const revoked = reducer(
      listed,
      revokeCliSessionSucceeded("cli_1", requested.meta),
    );
    const stale = reducer(
      revoked,
      fetchCliSessionsSucceeded([cliSession(), cliSession({ id: "cli_2" })], 0),
    );

    expect(stale.cliSessions.map((session) => session.id)).toEqual(["cli_2"]);
  });

  it("drops a list fetched before a token was made, so it stays listed", () => {
    const made = reducer(
      INITIAL_STATE,
      createCliTokenSucceeded(cliSession({ id: "cli_new" }), {
        pendingKey: "createCliToken",
      }),
    );
    const stale = reducer(made, fetchCliSessionsSucceeded([], 0));

    expect(stale.cliSessions.map((session) => session.id)).toEqual(["cli_new"]);
  });
});

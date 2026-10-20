import { HttpError } from "@4mica/http";
import { runSaga } from "redux-saga";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getResourceKeys,
  createResourceKeyRequest,
  revokeResourceKeyRequest,
  deleteResourceKeyRequest,
} = vi.hoisted(() => ({
  getResourceKeys: vi.fn(),
  createResourceKeyRequest: vi.fn(),
  revokeResourceKeyRequest: vi.fn(),
  deleteResourceKeyRequest: vi.fn(),
}));

vi.mock("@api/resourceKey", () => ({
  getResourceKeys,
  createResourceKey: createResourceKeyRequest,
  revokeResourceKey: revokeResourceKeyRequest,
  deleteResourceKey: deleteResourceKeyRequest,
}));

const { notifyError, notifySuccess } = vi.hoisted(() => ({
  notifyError: vi.fn(),
  notifySuccess: vi.fn(),
}));
vi.mock("@/lib/notify", () => ({ notifyError, notifySuccess }));

const {
  createResourceKey,
  deleteResourceKey,
  fetchResourceKeys,
  revokeResourceKey,
} = await import("./saga");
const actionTypes = (await import("./actionTypes")).default;
const { INITIAL_STATE } = await import("./reducer");

interface Dispatched {
  type: string;
  payload?: unknown;
}

const resource = { kind: "agent" as const, id: "agent_1" };
const CREATE_META = { pendingKey: "createResourceKey" };
const ROW_META = { pendingKey: "resourceKey:key_1" };

const state = { resourceKey: INITIAL_STATE };

const record = async <TArgs extends unknown[]>(
  saga: (...args: TArgs) => Generator,
  ...args: TArgs
): Promise<Dispatched[]> => {
  const dispatched: Dispatched[] = [];

  await runSaga(
    {
      dispatch: (action: Dispatched) => dispatched.push(action),
      getState: () => state,
    },
    saga as (...a: TArgs) => Generator,
    ...args,
  ).toPromise();

  return dispatched;
};

const types = (dispatched: Dispatched[]) => dispatched.map((a) => a.type);

const storedKey = {
  id: "key_1",
  name: "Agent runtime",
  prefix: "4mica_sk_ab12",
  last4: "wxyz",
  lastUsedAt: null,
  expiresAt: null,
  revokedAt: null,
  createdAt: "2026-10-08T00:00:00.000Z",
  updatedAt: "2026-10-08T00:00:00.000Z",
};

describe("resourceKey sagas", () => {
  beforeEach(() => {
    for (const fn of [
      getResourceKeys,
      createResourceKeyRequest,
      revokeResourceKeyRequest,
      deleteResourceKeyRequest,
      notifyError,
      notifySuccess,
    ]) {
      fn.mockReset();
    }
  });

  it("fetches the keys for the given resource", async () => {
    getResourceKeys.mockResolvedValue({ items: [storedKey] });

    const dispatched = await record(fetchResourceKeys, {
      type: actionTypes.FETCH_RESOURCE_KEYS_REQUESTED,
      payload: resource,
    });

    expect(getResourceKeys).toHaveBeenCalledWith("agent", "agent_1");
    expect(types(dispatched)).toEqual([
      actionTypes.FETCH_RESOURCE_KEYS_PENDING,
      actionTypes.FETCH_RESOURCE_KEYS_SUCCEEDED,
    ]);
    expect(dispatched[1].payload).toEqual({ items: [storedKey] });
  });

  it("creates a key and carries the plaintext to the reducer", async () => {
    createResourceKeyRequest.mockResolvedValue({
      apiKey: storedKey,
      plaintext: "4mica_sk_secret",
    });

    const dispatched = await record(createResourceKey, {
      type: actionTypes.CREATE_RESOURCE_KEY_REQUESTED,
      payload: { resource, name: "Agent runtime" },
      meta: CREATE_META,
    });

    expect(createResourceKeyRequest).toHaveBeenCalledWith("agent", "agent_1", {
      name: "Agent runtime",
    });
    expect(types(dispatched)).toEqual([
      actionTypes.CREATE_RESOURCE_KEY_SUCCEEDED,
    ]);
    expect(dispatched[0].payload).toEqual({
      apiKey: storedKey,
      revealed: { id: "key_1", plaintext: "4mica_sk_secret" },
    });
    expect(notifySuccess).toHaveBeenCalledTimes(1);
  });

  it("maps server issues onto field paths", async () => {
    createResourceKeyRequest.mockRejectedValue(
      new HttpError(400, "Bad Request", {
        error: "invalid_request",
        message: "The request body failed validation.",
        issues: [{ path: "name", message: "must be a single line" }],
      }),
    );

    const dispatched = await record(createResourceKey, {
      type: actionTypes.CREATE_RESOURCE_KEY_REQUESTED,
      payload: { resource, name: "two\nlines" },
      meta: CREATE_META,
    });

    const failure = dispatched[0] as {
      type: string;
      payload: { issues: Record<string, string> };
    };
    expect(failure.type).toBe(actionTypes.RESOURCE_KEY_ACTION_FAILED);
    expect(failure.payload.issues).toEqual({ name: "must be a single line" });
    expect(notifyError).toHaveBeenCalledTimes(1);
  });

  it("never echoes the API's auth copy at the user", async () => {
    for (const status of [401, 403]) {
      createResourceKeyRequest.mockRejectedValue(
        new HttpError(status, "Unauthorized", {
          error: "unauthorized",
          message: "No user context is attached to this request.",
        }),
      );

      const dispatched = await record(createResourceKey, {
        type: actionTypes.CREATE_RESOURCE_KEY_REQUESTED,
        payload: { resource, name: "x" },
        meta: CREATE_META,
      });
      const failure = dispatched[0] as { payload: { message: string } };

      expect(failure.payload.message, String(status)).not.toContain(
        "user context",
      );
      expect(failure.payload.message, String(status)).toContain("session");
    }
  });

  it("revokes against the resource the page is on", async () => {
    const revoked = { ...storedKey, revokedAt: "2026-10-08T01:00:00.000Z" };
    revokeResourceKeyRequest.mockResolvedValue(revoked);

    const dispatched = await record(revokeResourceKey, {
      type: actionTypes.REVOKE_RESOURCE_KEY_REQUESTED,
      payload: { resource, keyId: "key_1" },
      meta: ROW_META,
    });

    expect(revokeResourceKeyRequest).toHaveBeenCalledWith(
      "agent",
      "agent_1",
      "key_1",
    );
    expect(types(dispatched)).toEqual([
      actionTypes.REVOKE_RESOURCE_KEY_SUCCEEDED,
    ]);
    expect(dispatched[0].payload).toEqual(revoked);
    expect(notifySuccess).toHaveBeenCalledTimes(1);
  });

  it("deletes and reports the id so the row can go", async () => {
    deleteResourceKeyRequest.mockResolvedValue(undefined);

    const dispatched = await record(deleteResourceKey, {
      type: actionTypes.DELETE_RESOURCE_KEY_REQUESTED,
      payload: { resource, keyId: "key_1" },
      meta: ROW_META,
    });

    expect(deleteResourceKeyRequest).toHaveBeenCalledWith(
      "agent",
      "agent_1",
      "key_1",
    );
    expect(dispatched[0]).toEqual({
      type: actionTypes.DELETE_RESOURCE_KEY_SUCCEEDED,
      payload: { id: "key_1" },
      meta: ROW_META,
    });
  });
});

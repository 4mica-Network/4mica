import { HttpError } from "@4mica/http";
import { runSaga } from "redux-saga";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getOrganizations, createOrganizationRequest } = vi.hoisted(() => ({
  getOrganizations: vi.fn(),
  createOrganizationRequest: vi.fn(),
}));

vi.mock("@api/organization", () => ({
  getOrganizations,
  createOrganization: createOrganizationRequest,
}));

vi.mock("@/lib/notify", () => ({
  notifyError: vi.fn(),
  notifySuccess: vi.fn(),
}));

const { createOrganization, fetchOrganizations, switchOrganization } =
  await import("./saga");
const actionTypes = (await import("./actionTypes")).default;
const { INITIAL_STATE } = await import("./reducer");
const { ACTIVE_ORGANIZATION_STORAGE_KEY } = await import("./persist");
const { SESSION_RESET } = await import("@stores/session");
const userActionTypes = (await import("@stores/user/actionTypes")).default;

interface Dispatched {
  type: string;
  payload?: unknown;
  meta?: { keep?: string[] };
}

const organization = (id: string, personal = false) => ({
  id,
  handle: id,
  name: id,
  avatarUrl: null,
  personal,
  role: "OWNER" as const,
  permissions: [],
  memberCount: 1,
  createdAt: "2026-11-01T00:00:00.000Z",
});

const LIST = {
  items: [organization("personal", true), organization("acme")],
  defaultId: "personal",
};

const record = async (
  saga: (...args: never[]) => Generator,
  state: unknown,
  ...args: unknown[]
): Promise<Dispatched[]> => {
  const dispatched: Dispatched[] = [];
  await runSaga(
    {
      dispatch: (action: Dispatched) => dispatched.push(action),
      getState: () => state,
    },
    saga as (...a: unknown[]) => Generator,
    ...args,
  ).toPromise();
  return dispatched;
};

const types = (dispatched: Dispatched[]) => dispatched.map((a) => a.type);

const stateWith = (over: Partial<typeof INITIAL_STATE> = {}) => ({
  organization: { ...INITIAL_STATE, ...over },
});

const succeeded = (dispatched: Dispatched[]) =>
  dispatched.find(
    (action) => action.type === actionTypes.FETCH_ORGANIZATIONS_SUCCEEDED,
  )?.payload as { activeId: string };

describe("fetchOrganizations saga", () => {
  beforeEach(() => {
    localStorage.clear();
    getOrganizations.mockReset();
    getOrganizations.mockResolvedValue(LIST);
  });

  it("restores the organization remembered from the last visit", async () => {
    localStorage.setItem(ACTIVE_ORGANIZATION_STORAGE_KEY, "acme");

    const dispatched = await record(fetchOrganizations, stateWith());

    expect(succeeded(dispatched).activeId).toBe("acme");
    expect(localStorage.getItem(ACTIVE_ORGANIZATION_STORAGE_KEY)).toBe("acme");
  });

  it("reloads the user when the restored organization is not the default", async () => {
    localStorage.setItem(ACTIVE_ORGANIZATION_STORAGE_KEY, "acme");

    const dispatched = await record(fetchOrganizations, stateWith());

    expect(types(dispatched)).toContain(userActionTypes.FETCH_USER_REQUESTED);
  });

  it("falls back to the default when the remembered id is no longer one of yours", async () => {
    localStorage.setItem(ACTIVE_ORGANIZATION_STORAGE_KEY, "deleted-org");

    const dispatched = await record(fetchOrganizations, stateWith());

    expect(succeeded(dispatched).activeId).toBe("personal");
    expect(localStorage.getItem(ACTIVE_ORGANIZATION_STORAGE_KEY)).toBe(
      "personal",
    );
    expect(types(dispatched)).not.toContain(
      userActionTypes.FETCH_USER_REQUESTED,
    );
  });

  it("keeps the organization already in use on a refetch", async () => {
    localStorage.setItem(ACTIVE_ORGANIZATION_STORAGE_KEY, "personal");

    const dispatched = await record(
      fetchOrganizations,
      stateWith({ activeId: "acme", items: LIST.items, status: "loaded" }),
    );

    expect(succeeded(dispatched).activeId).toBe("acme");
    expect(types(dispatched)).not.toContain(SESSION_RESET);
  });

  it("resets the session when the organization in use disappears", async () => {
    getOrganizations.mockResolvedValue({
      items: [organization("personal", true)],
      defaultId: "personal",
    });

    const dispatched = await record(
      fetchOrganizations,
      stateWith({ activeId: "acme", items: LIST.items, status: "loaded" }),
    );

    expect(succeeded(dispatched).activeId).toBe("personal");
    expect(types(dispatched)).toContain(SESSION_RESET);
  });

  it("reports a failure without picking an organization", async () => {
    getOrganizations.mockRejectedValue(new Error("offline"));

    const dispatched = await record(fetchOrganizations, stateWith());

    expect(types(dispatched)).toEqual([
      actionTypes.FETCH_ORGANIZATIONS_PENDING,
      actionTypes.FETCH_ORGANIZATIONS_FAILED,
    ]);
  });
});

describe("switchOrganization saga", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  const loaded = stateWith({
    items: LIST.items,
    defaultId: "personal",
    activeId: "personal",
    status: "loaded",
  });

  it("activates, remembers, resets the session and reloads the user", async () => {
    const dispatched = await record(switchOrganization, loaded, {
      type: actionTypes.SWITCH_ORGANIZATION_REQUESTED,
      payload: { id: "acme" },
    });

    expect(types(dispatched)).toEqual([
      actionTypes.ACTIVE_ORGANIZATION_SET,
      SESSION_RESET,
      userActionTypes.FETCH_USER_REQUESTED,
    ]);
    expect(localStorage.getItem(ACTIVE_ORGANIZATION_STORAGE_KEY)).toBe("acme");
  });

  it("keeps the user and the organization list through the reset", async () => {
    const dispatched = await record(switchOrganization, loaded, {
      type: actionTypes.SWITCH_ORGANIZATION_REQUESTED,
      payload: { id: "acme" },
    });

    const reset = dispatched.find((action) => action.type === SESSION_RESET);
    expect(reset?.meta?.keep).toEqual(["user", "organization"]);
  });

  it("ignores an organization the user does not belong to", async () => {
    const dispatched = await record(switchOrganization, loaded, {
      type: actionTypes.SWITCH_ORGANIZATION_REQUESTED,
      payload: { id: "someone-elses" },
    });

    expect(dispatched).toEqual([]);
  });

  it("does nothing when the organization is already active", async () => {
    const dispatched = await record(switchOrganization, loaded, {
      type: actionTypes.SWITCH_ORGANIZATION_REQUESTED,
      payload: { id: "personal" },
    });

    expect(dispatched).toEqual([]);
  });
});

describe("createOrganization saga", () => {
  beforeEach(() => {
    createOrganizationRequest.mockReset();
  });

  const action = {
    type: actionTypes.CREATE_ORGANIZATION_REQUESTED,
    payload: { name: "Acme", handle: "acme" },
    meta: { pendingKey: "createOrganization" },
  };

  it("switches into the organization it just created", async () => {
    createOrganizationRequest.mockResolvedValue(organization("acme"));

    const dispatched = await record(
      createOrganization,
      stateWith({
        items: [organization("personal", true)],
        activeId: "personal",
      }),
      action,
    );

    expect(types(dispatched)).toEqual([
      actionTypes.CREATE_ORGANIZATION_SUCCEEDED,
      actionTypes.ACTIVE_ORGANIZATION_SET,
      SESSION_RESET,
      userActionTypes.FETCH_USER_REQUESTED,
    ]);
  });

  it("puts a taken handle on the handle field", async () => {
    createOrganizationRequest.mockRejectedValue(
      new HttpError(409, "Conflict", { error: "handle_taken" }),
    );

    const dispatched = await record(createOrganization, stateWith(), action);

    expect(dispatched).toHaveLength(1);
    expect(dispatched[0].type).toBe(actionTypes.ORGANIZATION_ACTION_FAILED);
    expect(
      (dispatched[0].payload as { issues: Record<string, string> }).issues
        .handle,
    ).toBe("That handle is already taken.");
  });
});

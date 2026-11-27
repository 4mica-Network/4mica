import { HttpError } from "@4mica/http";
import { runSaga } from "redux-saga";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  getMembers: vi.fn(),
  updateMemberRole: vi.fn(),
  suspendMember: vi.fn(),
  revokeMemberSessions: vi.fn(),
  removeMember: vi.fn(),
  getInvitations: vi.fn(),
  createInvitations: vi.fn(),
  resendInvitation: vi.fn(),
  revokeInvitation: vi.fn(),
  getAuditLogs: vi.fn(),
}));
vi.mock("@api/organization", () => api);

const { notifyError, notifySuccess } = vi.hoisted(() => ({
  notifyError: vi.fn(),
  notifySuccess: vi.fn(),
}));
vi.mock("@/lib/notify", () => ({ notifyError, notifySuccess }));

const saga = await import("./saga");
const actions = await import("./actions");
const actionTypes = (await import("./actionTypes")).default;
const reducerModule = await import("./reducer");
const reducer = reducerModule.default;
const { INITIAL_STATE } = reducerModule;

type Dispatched = {
  type: string;
  payload?: unknown;
  meta?: { pendingKey: string };
};

const record = async (
  worker: (action: never) => Generator,
  action: unknown,
) => {
  const dispatched: Dispatched[] = [];
  await runSaga(
    {
      dispatch: (next: Dispatched) => dispatched.push(next),
      getState: () => ({ team: INITIAL_STATE, user: { user: { id: "me" } } }),
    },
    worker as (a: unknown) => Generator,
    action,
  ).toPromise();
  return dispatched;
};

const MEMBER = {
  userId: "u1",
  name: "Alan",
  username: null,
  email: "alan@acme.com",
  avatarUrl: null,
  role: "VIEWER" as const,
  joinedAt: "2026-11-01T00:00:00.000Z",
  customRole: { id: "role_1", name: "Auditor" },
  source: "SCIM",
  suspendedAt: null,
};

describe("team enterprise sagas", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("assigns a custom role by id", async () => {
    api.updateMemberRole.mockResolvedValue(MEMBER);
    await record(
      saga.updateMemberRole,
      actions.updateMemberRole({ userId: "u1", customRoleId: "role_1" }),
    );
    expect(api.updateMemberRole).toHaveBeenCalledWith("u1", {
      customRoleId: "role_1",
    });
  });

  it("stores the suspended member the API returns", async () => {
    const suspended = { ...MEMBER, suspendedAt: "2026-11-27T00:00:00.000Z" };
    api.suspendMember.mockResolvedValue(suspended);
    const action = actions.suspendMember({ userId: "u1", suspended: true });
    const dispatched = await record(saga.suspendMember, action);

    expect(api.suspendMember).toHaveBeenCalledWith("u1", true);
    const state = dispatched.reduce(
      (current, next) => reducer(current, next),
      reducer({ ...INITIAL_STATE, members: [MEMBER] }, action),
    );
    expect(state.members[0].suspendedAt).toBe("2026-11-27T00:00:00.000Z");
    expect(state.pending).toEqual({});
  });

  it("reports how many sessions were ended", async () => {
    api.revokeMemberSessions.mockResolvedValue({ revoked: 2 });
    const dispatched = await record(
      saga.revokeMemberSessions,
      actions.revokeMemberSessions({ userId: "u1" }),
    );
    expect(dispatched.map((a) => a.type)).toEqual([
      actionTypes.REVOKE_MEMBER_SESSIONS_SUCCEEDED,
    ]);
    expect(notifySuccess.mock.calls[0][0].content).toBe(
      "2 sessions were ended.",
    );
  });

  it("explains why an identity outside the verified domains cannot be signed out", async () => {
    api.revokeMemberSessions.mockRejectedValue(
      new HttpError(403, "Forbidden", {
        error: "identity_not_managed",
        message: "Not managed",
      }),
    );
    const dispatched = await record(
      saga.revokeMemberSessions,
      actions.revokeMemberSessions({ userId: "u1" }),
    );
    expect(dispatched[0].type).toBe(actionTypes.TEAM_ACTION_FAILED);
    expect(notifyError.mock.calls[0][0].content).toContain("verified domains");
  });
});

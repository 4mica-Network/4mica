import { HttpError } from "@4mica/http";
import { runSaga } from "redux-saga";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  agentActionFailed,
  batchDeleteAgents,
  batchDeleteAgentsSucceeded,
  fetchAgentsSucceeded,
  publishAgent,
  setAgentFilters,
  setAgentPage,
  setAgentSelection,
  updateAgent,
} from "./actions";
import reducer, { INITIAL_STATE } from "./reducer";
import type { Agent, AgentState } from "./type";

const { getAgents, createAgentRequest, updateAgentRequest } = vi.hoisted(
  () => ({
    getAgents: vi.fn(),
    createAgentRequest: vi.fn(),
    updateAgentRequest: vi.fn(),
  }),
);

vi.mock("@api/agent", () => ({
  getAgents,
  getAgent: vi.fn(),
  createAgent: createAgentRequest,
  updateAgent: updateAgentRequest,
  publishAgent: vi.fn(),
  unpublishAgent: vi.fn(),
  deleteAgent: vi.fn(),
  batchDeleteAgents: vi.fn(),
}));

const { notifyError, notifySuccess } = vi.hoisted(() => ({
  notifyError: vi.fn(),
  notifySuccess: vi.fn(),
}));
vi.mock("@utils/notification", () => ({ notifyError, notifySuccess }));

const { createAgent: createAgentSaga, fetchAgents: fetchAgentsSaga } =
  await import("./saga");
const actionTypes = (await import("./actionTypes")).default;

const agent = (over: Partial<Agent> = {}): Agent => ({
  id: "agent_1",
  slug: "atlas-research",
  name: "Atlas Research Agent",
  headline: null,
  description: null,
  avatarUrl: null,
  docsUrl: null,
  status: "PENDING",
  visibility: "PRIVATE",
  network: "BASE_SEPOLIA",
  walletAddress: null,
  payerWalletId: null,
  creditLimit: "0",
  walletId: null,
  payToAddress: null,
  assetAddress: null,
  priceAmount: null,
  priceCurrency: null,
  priceLabel: null,
  endpointUrl: null,
  x402Endpoint: null,
  publishedAt: null,
  createdAt: "2026-09-21T00:00:00.000Z",
  updatedAt: "2026-09-21T00:00:00.000Z",
  ...over,
});

const seeded: AgentState = {
  ...INITIAL_STATE,
  items: [agent(), agent({ id: "agent_2", slug: "critic" })],
  total: 2,
  hasLoaded: true,
};

describe("agent reducer", () => {
  it("marks only the acting row pending", () => {
    const state = reducer(seeded, updateAgent({ id: "agent_1", data: {} }));

    expect(state.pending["agent:agent_1"]).toBe(true);
    expect(state.pending["agent:agent_2"]).toBeUndefined();
  });

  it("shares one pending key between edit and publish", () => {
    for (const action of [
      updateAgent({ id: "agent_1", data: {} }),
      publishAgent({ id: "agent_1", publish: true }),
    ]) {
      expect(reducer(seeded, action).pending).toEqual({
        "agent:agent_1": true,
      });
    }
  });

  it("drops selections for rows that left the page", () => {
    const selected = reducer(seeded, setAgentSelection(["agent_1"]));
    const state = reducer(
      selected,
      fetchAgentsSucceeded({
        items: [agent({ id: "agent_2" })],
        total: 1,
        page: 1,
        limit: 20,
      }),
    );

    expect(state.selectedIds).toEqual([]);
  });

  it("returns to the first page when a filter changes", () => {
    const paged = reducer(seeded, setAgentPage(4));
    expect(reducer(paged, setAgentFilters({ status: "ACTIVE" })).page).toBe(1);
  });

  it("merges filters rather than replacing them", () => {
    const first = reducer(seeded, setAgentFilters({ q: "atlas" }));
    const state = reducer(first, setAgentFilters({ status: "ACTIVE" }));

    expect(state.filters).toEqual({
      q: "atlas",
      status: "ACTIVE",
      visibility: "",
      network: "",
    });
  });

  it("empties the selection after a batch delete", () => {
    const selected = reducer(seeded, setAgentSelection(["agent_1"]));
    const pending = reducer(selected, batchDeleteAgents({ ids: ["agent_1"] }));
    const state = reducer(
      pending,
      batchDeleteAgentsSucceeded(
        { deleted: ["agent_1"], notFound: [] },
        { pendingKey: "batchDeleteAgents" },
      ),
    );

    expect(state.selectedIds).toEqual([]);
    expect(state.pending).toEqual({});
  });

  it("records the message and issues from a failure", () => {
    const state = reducer(
      seeded,
      agentActionFailed(
        "This agent signs on BASE_SEPOLIA.",
        { walletId: "is on a different network" },
        { pendingKey: "agent:agent_1" },
      ),
    );

    expect(state.validationIssues.walletId).toBe("is on a different network");
    expect(state.pending["agent:agent_1"]).toBeUndefined();
  });

  it("never lets the page fall below one", () => {
    expect(reducer(seeded, setAgentPage(0)).page).toBe(1);
  });
});

interface Dispatched {
  type: string;
  payload?: unknown;
}

const agentState = (over: Record<string, unknown> = {}) => ({
  agent: { ...INITIAL_STATE, ...over },
});

const record = async <TArgs extends unknown[]>(
  saga: (...args: TArgs) => Generator,
  state: unknown,
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

const page = { items: [], total: 0, page: 1, limit: 20 };

describe("agent sagas", () => {
  beforeEach(() => {
    for (const m of [
      getAgents,
      createAgentRequest,
      updateAgentRequest,
      notifyError,
      notifySuccess,
    ]) {
      m.mockReset();
    }
    getAgents.mockResolvedValue(page);
  });

  it("omits blank filters rather than sending empty strings", async () => {
    await record(fetchAgentsSaga, agentState());

    expect(getAgents).toHaveBeenCalledWith({ page: 1, limit: 20 });
  });

  it("sends every set filter", async () => {
    await record(
      fetchAgentsSaga,
      agentState({
        filters: {
          q: "atlas",
          status: "ACTIVE",
          visibility: "PUBLIC",
          network: "BASE",
        },
      }),
    );

    expect(getAgents).toHaveBeenCalledWith({
      page: 1,
      limit: 20,
      q: "atlas",
      status: "ACTIVE",
      visibility: "PUBLIC",
      network: "BASE",
    });
  });

  it("refreshes the list after a create", async () => {
    createAgentRequest.mockResolvedValue({ id: "agent_1" });

    const dispatched = await record(createAgentSaga, agentState(), {
      type: actionTypes.CREATE_AGENT_REQUESTED,
      payload: { name: "Atlas" },
      meta: { pendingKey: "createAgent" },
    });

    expect(dispatched.map((a) => a.type)).toEqual([
      actionTypes.CREATE_AGENT_SUCCEEDED,
      actionTypes.FETCH_AGENTS_REQUESTED,
    ]);
  });

  it("maps a network mismatch onto the wallet field", async () => {
    createAgentRequest.mockRejectedValue(
      new HttpError(400, "Bad Request", {
        error: "network_mismatch",
        message:
          "This agent signs on BASE_SEPOLIA, but that wallet is on BASE.",
        issues: [{ path: "walletId", message: "is on a different network" }],
      }),
    );

    const dispatched = await record(createAgentSaga, agentState(), {
      type: actionTypes.CREATE_AGENT_REQUESTED,
      payload: { name: "Atlas" },
      meta: { pendingKey: "createAgent" },
    });
    const failure = dispatched[0] as {
      payload: { message: string; issues: Record<string, string> };
    };

    expect(failure.payload.issues.walletId).toBe("is on a different network");
    expect(failure.payload.message).toContain("BASE_SEPOLIA");
  });

  it("never echoes the API's auth copy at the user", async () => {
    createAgentRequest.mockRejectedValue(
      new HttpError(401, "Unauthorized", {
        error: "unauthorized",
        message: "No user context is attached to this request.",
      }),
    );

    const dispatched = await record(createAgentSaga, agentState(), {
      type: actionTypes.CREATE_AGENT_REQUESTED,
      payload: { name: "Atlas" },
      meta: { pendingKey: "createAgent" },
    });
    const failure = dispatched[0] as { payload: { message: string } };

    expect(failure.payload.message).not.toContain("user context");
  });
});

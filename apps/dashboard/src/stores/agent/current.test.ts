import { HttpError } from "@4mica/http";
import { runSaga } from "redux-saga";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Agent } from "./type";

const { getAgent } = vi.hoisted(() => ({ getAgent: vi.fn() }));

vi.mock("@api/agent", () => ({ getAgent }));

const { fetchAgent } = await import("./saga");
const { fetchAgentFailed, fetchAgentSucceeded, updateAgentSucceeded } =
  await import("./actions");
const actionTypes = (await import("./actionTypes")).default;
const { default: reducer, INITIAL_STATE } = await import("./reducer");

const agent = (over: Partial<Agent> = {}) =>
  ({ id: "agt_1", name: "Scout", ...over }) as Agent;

const run = async (id: string) => {
  const dispatched: { type: string; payload?: unknown }[] = [];
  await runSaga(
    { dispatch: (action: { type: string }) => dispatched.push(action) },
    fetchAgent,
    { type: actionTypes.FETCH_AGENT_REQUESTED, payload: { id } },
  ).toPromise();
  return dispatched;
};

describe("loading one agent", () => {
  beforeEach(() => {
    getAgent.mockReset();
  });

  it("loads the agent by id, whatever page the list is on", async () => {
    getAgent.mockResolvedValue(agent());

    expect(await run("agt_1")).toEqual([fetchAgentSucceeded(agent())]);
    expect(getAgent).toHaveBeenCalledWith("agt_1");
  });

  it("marks a 404 as not found", async () => {
    getAgent.mockRejectedValue(new HttpError(404, "Not Found", {}));

    const [failure] = await run("agt_missing");

    expect(failure.type).toBe(actionTypes.FETCH_AGENT_FAILED);
    expect((failure.payload as { notFound: boolean }).notFound).toBe(true);
  });

  it("keeps an outage apart from not found so the page can offer a retry", async () => {
    getAgent.mockRejectedValue(new HttpError(503, "Unavailable", {}));

    const [failure] = await run("agt_1");

    expect((failure.payload as { notFound: boolean }).notFound).toBe(false);
  });
});

describe("the open agent", () => {
  it("follows a successful edit of the same agent", () => {
    let state = reducer(INITIAL_STATE, fetchAgentSucceeded(agent()));
    state = reducer(
      state,
      updateAgentSucceeded(agent({ name: "Renamed" }), { pendingKey: "x" }),
    );

    expect(state.current?.name).toBe("Renamed");
  });

  it("ignores an edit to a different agent", () => {
    let state = reducer(INITIAL_STATE, fetchAgentSucceeded(agent()));
    state = reducer(
      state,
      updateAgentSucceeded(agent({ id: "agt_2", name: "Other" }), {
        pendingKey: "x",
      }),
    );

    expect(state.current?.name).toBe("Scout");
  });

  it("clears an earlier failure when it loads again", () => {
    let state = reducer(INITIAL_STATE, fetchAgentFailed("gone", true));
    state = reducer(state, {
      type: actionTypes.FETCH_AGENT_REQUESTED,
      payload: { id: "agt_1" },
    });

    expect(state.currentNotFound).toBe(false);
    expect(state.currentError).toBeNull();
  });
});

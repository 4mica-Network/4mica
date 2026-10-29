import { describe, expect, it } from "vitest";
import {
  deleteSupportRequestSucceeded,
  fetchSupportRequest,
  fetchSupportRequestSucceeded,
  fetchSupportRequestsSucceeded,
  replySupportRequestSucceeded,
  setSupportFilters,
  toggleSupportRequestSelected,
  updateSupportRequest,
  updateSupportRequestSucceeded,
} from "./actions";
import reducer, { INITIAL_STATE } from "./reducer";
import type { SupportRequest, SupportRequestDetail } from "./type";

const request = (over: Partial<SupportRequest> = {}): SupportRequest => ({
  id: "r1",
  number: 1001,
  subject: "Payments stuck",
  category: "PAYMENTS",
  priority: "HIGH",
  status: "OPEN",
  description: "Pending for an hour.",
  reference: null,
  firstRespondedAt: null,
  resolvedAt: null,
  lastActivityAt: "2026-10-28T10:00:00.000Z",
  createdAt: "2026-10-28T10:00:00.000Z",
  updatedAt: "2026-10-28T10:00:00.000Z",
  ...over,
});

const detail = (over: Partial<SupportRequestDetail> = {}) => ({
  ...request(),
  messages: [],
  ...over,
});

const META = { pendingKey: "support:r1" };

describe("support reducer", () => {
  it("drops selections that are no longer on the page", () => {
    let state = reducer(INITIAL_STATE, toggleSupportRequestSelected("gone"));
    state = reducer(
      state,
      fetchSupportRequestsSucceeded({
        items: [request()],
        total: 1,
        page: 1,
        limit: 20,
      }),
    );

    expect(state.selectedIds).toEqual([]);
    expect(state.hasLoaded).toBe(true);
  });

  it("resets the page and selection when filters change", () => {
    let state = { ...INITIAL_STATE, page: 3, selectedIds: ["r1"] };
    state = reducer(state, setSupportFilters({ status: "RESOLVED" }));

    expect(state.page).toBe(1);
    expect(state.selectedIds).toEqual([]);
    expect(state.filters.status).toBe("RESOLVED");
  });

  it("keeps the current request while refetching the same one", () => {
    let state = reducer(INITIAL_STATE, fetchSupportRequestSucceeded(detail()));
    state = reducer(state, fetchSupportRequest("r1"));
    expect(state.current?.id).toBe("r1");

    state = reducer(state, fetchSupportRequest("r2"));
    expect(state.current).toBeNull();
  });

  it("applies an update to the list row and the open request", () => {
    let state = reducer(INITIAL_STATE, fetchSupportRequestSucceeded(detail()));
    state = { ...state, items: [request()] };
    state = reducer(
      state,
      updateSupportRequest({ id: "r1", data: { status: "CLOSED" } }),
    );
    expect(state.pending["support:r1"]).toBe(true);

    state = reducer(
      state,
      updateSupportRequestSucceeded(request({ status: "CLOSED" }), META),
    );

    expect(state.items[0].status).toBe("CLOSED");
    expect(state.current?.status).toBe("CLOSED");
    expect(state.pending["support:r1"]).toBeUndefined();
  });

  it("appends a reply to the open conversation", () => {
    let state = reducer(INITIAL_STATE, fetchSupportRequestSucceeded(detail()));
    state = reducer(
      state,
      replySupportRequestSucceeded(
        {
          id: "r1",
          message: {
            id: "m1",
            author: "CUSTOMER",
            body: "Any update?",
            createdAt: "2026-10-28T11:00:00.000Z",
          },
        },
        { pendingKey: "supportReply:r1" },
      ),
    );

    expect(state.current?.messages.map((m) => m.body)).toEqual(["Any update?"]);
  });

  it("clears the open request when it is deleted", () => {
    let state = reducer(INITIAL_STATE, fetchSupportRequestSucceeded(detail()));
    state = reducer(state, deleteSupportRequestSucceeded("r1", META));

    expect(state.current).toBeNull();
  });
});

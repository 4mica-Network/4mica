import { HttpError } from "@4mica/http";
import { runSaga } from "redux-saga";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getConfig } = vi.hoisted(() => ({ getConfig: vi.fn() }));

vi.mock("@api/config", () => ({ getConfig }));

const { fetchConfig, CONFIG_MAX_AGE_MS } = await import("./saga");
const actionTypes = (await import("./actionTypes")).default;
const actions = await import("./actions");
const { default: reducer, INITIAL_STATE } = await import("./reducer");
const { CONFIG_STORAGE_KEY, readConfigCache } = await import("./persist");

import type { AppConfig } from "./type";

interface Dispatched {
  type: string;
  payload?: unknown;
}

const config = (over: Partial<AppConfig> = {}): AppConfig => ({
  version: "v1",
  countries: [{ code: "DE", name: "Germany" }],
  timezones: [
    {
      city: "London",
      timezone: "Europe/London",
      pop: 1,
      gmtOffset: "GMT+00:00",
    },
  ],
  currencies: ["USD"],
  languages: ["en"],
  themes: ["dark"],
  homes: ["overview"],
  notificationPlacements: ["topLeft"],
  businessTypes: ["LLC"],
  monthlyVolumes: ["UNDER_10K"],
  customerBases: ["BOTH"],
  fundsSources: ["LOANS"],
  ownerRoles: ["OWNER"],
  networks: ["BASE"],
  ...over,
});

const run = async (state: Record<string, unknown>) => {
  const dispatched: Dispatched[] = [];
  await runSaga(
    {
      dispatch: (action: Dispatched) => dispatched.push(action),
      getState: () => ({ config: { ...INITIAL_STATE, ...state } }),
    },
    fetchConfig,
  ).toPromise();
  return dispatched;
};

describe("config saga", () => {
  beforeEach(() => {
    getConfig.mockReset();
    localStorage.clear();
  });

  it("skips the request while the cached config is fresh", async () => {
    const dispatched = await run({ config: config(), fetchedAt: Date.now() });

    expect(getConfig).not.toHaveBeenCalled();
    expect(dispatched).toEqual([]);
  });

  it("fetches and persists when nothing is cached", async () => {
    getConfig.mockResolvedValue(config());

    const dispatched = await run({});

    expect(getConfig).toHaveBeenCalledWith(undefined);
    expect(dispatched.map((a) => a.type)).toEqual([
      actionTypes.FETCH_CONFIG_PENDING,
      actionTypes.FETCH_CONFIG_SUCCEEDED,
    ]);
    expect(readConfigCache()?.config.version).toBe("v1");
  });

  it("revalidates a stale cache with its version and keeps it on 304", async () => {
    getConfig.mockRejectedValue(new HttpError(304, "Not Modified", null));
    const stale = Date.now() - CONFIG_MAX_AGE_MS - 1;

    const dispatched = await run({ config: config(), fetchedAt: stale });

    expect(getConfig).toHaveBeenCalledWith("v1");
    expect(dispatched.at(-1)?.type).toBe(actionTypes.FETCH_CONFIG_NOT_MODIFIED);
    expect(readConfigCache()?.fetchedAt).toBeGreaterThan(stale);
  });

  it("reports a failure without dropping the cached config", async () => {
    getConfig.mockRejectedValue(new HttpError(500, "Server Error", null));

    const dispatched = await run({ config: config(), fetchedAt: 0 });

    expect(dispatched.at(-1)?.type).toBe(actionTypes.FETCH_CONFIG_FAILED);
  });
});

describe("config reducer", () => {
  it("stores a fetched config", () => {
    const state = reducer(
      reducer(INITIAL_STATE, actions.fetchConfigPending()),
      actions.fetchConfigSucceeded(config(), 42),
    );

    expect(state.config?.version).toBe("v1");
    expect(state.fetchedAt).toBe(42);
    expect(state.hasLoaded).toBe(true);
    expect(state.isLoading).toBe(false);
  });

  it("only bumps fetchedAt when not modified", () => {
    const loaded = reducer(
      INITIAL_STATE,
      actions.fetchConfigSucceeded(config(), 1),
    );
    const state = reducer(loaded, actions.fetchConfigNotModified(99));

    expect(state.config).toBe(loaded.config);
    expect(state.fetchedAt).toBe(99);
  });

  it("keeps the config on failure", () => {
    const loaded = reducer(
      INITIAL_STATE,
      actions.fetchConfigSucceeded(config(), 1),
    );
    const state = reducer(loaded, actions.fetchConfigFailed("nope"));

    expect(state.config).toBe(loaded.config);
    expect(state.error).toBe("nope");
  });
});

describe("config cache", () => {
  it("ignores a malformed entry", () => {
    localStorage.setItem(CONFIG_STORAGE_KEY, "{not json");
    expect(readConfigCache()).toBeNull();
  });
});

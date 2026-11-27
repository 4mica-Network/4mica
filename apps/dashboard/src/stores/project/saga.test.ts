import { runSaga } from "redux-saga";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectSummary } from "./type";

const { getProjects } = vi.hoisted(() => ({ getProjects: vi.fn() }));

vi.mock("@api/project", () => ({ getProjects }));
vi.mock("@/lib/notify", () => ({
  notifyError: vi.fn(),
  notifySuccess: vi.fn(),
}));

const { fetchProjects, switchEnvironment, switchProject } = await import(
  "./saga"
);
const actionTypes = (await import("./actionTypes")).default;
const { INITIAL_STATE } = await import("./reducer");
const { ACTIVE_PROJECT_STORAGE_PREFIX, ENVIRONMENT_STORAGE_KEY } = await import(
  "./persist"
);
const { SESSION_RESET } = await import("@stores/session");
const { INITIAL_STATE: ORGANIZATION_INITIAL_STATE } = await import(
  "@stores/organization/reducer"
);

interface Dispatched {
  type: string;
  payload?: unknown;
  meta?: { keep?: string[] };
}

const project = (id: string, isDefault = false): ProjectSummary => ({
  id,
  slug: id,
  name: id,
  description: null,
  isDefault,
  restricted: false,
  restrictProduction: false,
  archived: false,
  role: "ADMIN",
  permissions: { SANDBOX: [], PRODUCTION: [] },
  environments: [],
  createdAt: "2026-11-01T00:00:00.000Z",
});

const ITEMS = [project("main", true), project("checkout")];

const stateWith = (
  over: Partial<typeof INITIAL_STATE> = {},
  organizationId = "acme",
) => ({
  organization: { ...ORGANIZATION_INITIAL_STATE, activeId: organizationId },
  project: { ...INITIAL_STATE, ...over },
});

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

const succeeded = (dispatched: Dispatched[]) =>
  dispatched.find(
    (action) => action.type === actionTypes.FETCH_PROJECTS_SUCCEEDED,
  )?.payload as {
    activeId: string;
    organizationId: string;
    environment: string;
  };

const types = (dispatched: Dispatched[]) => dispatched.map((a) => a.type);

describe("fetchProjects saga", () => {
  beforeEach(() => {
    localStorage.clear();
    getProjects.mockReset();
    getProjects.mockResolvedValue({ items: ITEMS });
  });

  it("restores the project remembered for this organization", async () => {
    localStorage.setItem(`${ACTIVE_PROJECT_STORAGE_PREFIX}acme`, "checkout");
    localStorage.setItem(`${ACTIVE_PROJECT_STORAGE_PREFIX}other`, "main");

    const dispatched = await record(fetchProjects, stateWith());

    expect(succeeded(dispatched)).toMatchObject({
      organizationId: "acme",
      activeId: "checkout",
    });
  });

  it("keeps a separate choice per organization", async () => {
    localStorage.setItem(`${ACTIVE_PROJECT_STORAGE_PREFIX}acme`, "checkout");

    const dispatched = await record(fetchProjects, stateWith({}, "other"));

    expect(succeeded(dispatched).activeId).toBe("main");
    expect(localStorage.getItem(`${ACTIVE_PROJECT_STORAGE_PREFIX}acme`)).toBe(
      "checkout",
    );
    expect(localStorage.getItem(`${ACTIVE_PROJECT_STORAGE_PREFIX}other`)).toBe(
      "main",
    );
  });

  it("falls back to the default project when the remembered one is gone", async () => {
    localStorage.setItem(`${ACTIVE_PROJECT_STORAGE_PREFIX}acme`, "deleted");

    const dispatched = await record(fetchProjects, stateWith());

    expect(succeeded(dispatched).activeId).toBe("main");
    expect(localStorage.getItem(`${ACTIVE_PROJECT_STORAGE_PREFIX}acme`)).toBe(
      "main",
    );
  });

  it("restores the remembered environment, sandbox by default", async () => {
    expect(
      succeeded(await record(fetchProjects, stateWith())).environment,
    ).toBe("sandbox");

    localStorage.setItem(ENVIRONMENT_STORAGE_KEY, "production");
    expect(
      succeeded(await record(fetchProjects, stateWith())).environment,
    ).toBe("production");
  });

  it("resets the session when the project in use disappears", async () => {
    getProjects.mockResolvedValue({ items: [project("main", true)] });

    const dispatched = await record(
      fetchProjects,
      stateWith({
        organizationId: "acme",
        items: ITEMS,
        activeId: "checkout",
        status: "loaded",
      }),
    );

    expect(succeeded(dispatched).activeId).toBe("main");
    expect(types(dispatched)).toContain(SESSION_RESET);
  });

  it("does nothing before an organization is active", async () => {
    const dispatched = await record(fetchProjects, stateWith({}, ""));

    expect(dispatched).toEqual([]);
    expect(getProjects).not.toHaveBeenCalled();
  });
});

describe("switching project and environment", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  const loaded = stateWith({
    organizationId: "acme",
    items: ITEMS,
    activeId: "main",
    status: "loaded",
  });

  it("activates, remembers and resets the session, keeping user, organization and project", async () => {
    const dispatched = await record(switchProject, loaded, {
      type: actionTypes.SWITCH_PROJECT_REQUESTED,
      payload: { id: "checkout" },
    });

    expect(types(dispatched)).toEqual([
      actionTypes.ACTIVE_PROJECT_SET,
      SESSION_RESET,
    ]);
    expect(dispatched[1].meta?.keep).toEqual([
      "user",
      "organization",
      "project",
    ]);
    expect(localStorage.getItem(`${ACTIVE_PROJECT_STORAGE_PREFIX}acme`)).toBe(
      "checkout",
    );
  });

  it("ignores a project that is not in the list or already active", async () => {
    expect(
      await record(switchProject, loaded, {
        type: actionTypes.SWITCH_PROJECT_REQUESTED,
        payload: { id: "elsewhere" },
      }),
    ).toEqual([]);
    expect(
      await record(switchProject, loaded, {
        type: actionTypes.SWITCH_PROJECT_REQUESTED,
        payload: { id: "main" },
      }),
    ).toEqual([]);
  });

  it("switches environment, remembers it and resets the session", async () => {
    const dispatched = await record(switchEnvironment, loaded, {
      type: actionTypes.SWITCH_ENVIRONMENT_REQUESTED,
      payload: { environment: "production" },
    });

    expect(types(dispatched)).toEqual([
      actionTypes.ENVIRONMENT_SET,
      SESSION_RESET,
    ]);
    expect(dispatched[1].meta?.keep).toEqual([
      "user",
      "organization",
      "project",
    ]);
    expect(localStorage.getItem(ENVIRONMENT_STORAGE_KEY)).toBe("production");
  });
});

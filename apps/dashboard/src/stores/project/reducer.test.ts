import { INITIAL_STATE as ORGANIZATION_INITIAL_STATE } from "@stores/organization/reducer";
import { describe, expect, it } from "vitest";
import type { RootState } from "..";
import { environmentSet, fetchProjectsSucceeded } from "./actions";
import reducer, { INITIAL_STATE } from "./reducer";
import {
  projectHeaders,
  selectActiveProject,
  selectProjectCan,
} from "./selector";
import type { ProjectSummary } from "./type";

const project: ProjectSummary = {
  id: "p_1",
  slug: "main",
  name: "Main",
  description: null,
  isDefault: true,
  restricted: false,
  restrictProduction: true,
  archived: false,
  role: "DEVELOPER",
  permissions: {
    SANDBOX: ["project.read", "resources.read", "resources.write"],
    PRODUCTION: ["project.read", "resources.read"],
  },
  environments: [],
  createdAt: "2026-11-01T00:00:00.000Z",
};

const loaded = reducer(
  INITIAL_STATE,
  fetchProjectsSucceeded({
    organizationId: "acme",
    items: [project],
    activeId: "p_1",
    environment: "sandbox",
  }),
);

const root = (projectState = loaded, organizationId = "acme") =>
  ({
    organization: { ...ORGANIZATION_INITIAL_STATE, activeId: organizationId },
    project: projectState,
  }) as RootState;

describe("project selectors", () => {
  it("finds the active project", () => {
    expect(selectActiveProject(root())?.name).toBe("Main");
  });

  it("answers permission checks for the active environment", () => {
    expect(selectProjectCan("resources.write")(root())).toBe(true);

    const production = reducer(loaded, environmentSet("production"));
    expect(selectProjectCan("resources.write")(root(production))).toBe(false);
    expect(selectProjectCan("resources.read")(root(production))).toBe(true);
  });

  it("sends the organization, project and environment headers", () => {
    expect(projectHeaders(root())).toEqual({
      "X-Org-Id": "acme",
      "X-Project-Id": "p_1",
      "X-Environment": "sandbox",
    });
  });

  it("leaves the project out while the list belongs to another organization", () => {
    expect(projectHeaders(root(loaded, "other"))).toEqual({
      "X-Org-Id": "other",
      "X-Environment": "sandbox",
    });
  });

  it("sends nothing before an organization is known", () => {
    expect(projectHeaders(root(INITIAL_STATE, ""))).toBeNull();
  });
});

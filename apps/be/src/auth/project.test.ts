import type { FastifyRequest } from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  requestedEnvironment,
  requestedProjectId,
  resolveProject,
} from "./project";
import type { Tenant } from "./tenant";

const { findProjectForMember } = vi.hoisted(() => ({
  findProjectForMember: vi.fn(),
}));

vi.mock("./repository", () => ({ findProjectForMember }));

const PROJECT_ID = "019fce62-0000-7000-8000-0000000000d1";
const ORG_ID = "019fce62-0000-7000-8000-0000000000a1";
const USER_ID = "019fce62-0000-7000-8000-000000000000";

const request = (headers: Record<string, string | string[]> = {}) =>
  ({ headers }) as unknown as FastifyRequest;

const tenant = (role: Tenant["role"] = "DEVELOPER"): Tenant => ({
  orgId: ORG_ID,
  userId: USER_ID,
  role,
  personal: false,
});

const project = (over: Record<string, unknown> = {}) => ({
  id: PROJECT_ID,
  slug: "default",
  isDefault: true,
  restricted: false,
  restrictProduction: false,
  archivedAt: null,
  members: [],
  environments: [
    { id: "env-sandbox", kind: "SANDBOX" },
    { id: "env-production", kind: "PRODUCTION" },
  ],
  ...over,
});

describe("requestedProjectId", () => {
  it("is undefined when no project is named", () => {
    expect(requestedProjectId(request())).toBeUndefined();
    expect(requestedProjectId(request({ "x-project-id": "  " }))).toBe(
      undefined,
    );
  });

  it("accepts a UUID, trimmed and lower-cased", () => {
    expect(
      requestedProjectId(
        request({ "x-project-id": ` ${PROJECT_ID.toUpperCase()} ` }),
      ),
    ).toBe(PROJECT_ID);
  });

  it("rejects a malformed or repeated header", () => {
    expect(requestedProjectId(request({ "x-project-id": "default" }))).toBe(
      null,
    );
    expect(
      requestedProjectId(request({ "x-project-id": [PROJECT_ID, PROJECT_ID] })),
    ).toBeNull();
  });
});

describe("requestedEnvironment", () => {
  it("defaults to sandbox", () => {
    expect(requestedEnvironment(request())).toBe("SANDBOX");
    expect(requestedEnvironment(request({ "x-environment": "" }))).toBe(
      "SANDBOX",
    );
  });

  it("reads either environment, ignoring case and whitespace", () => {
    expect(requestedEnvironment(request({ "x-environment": "sandbox" }))).toBe(
      "SANDBOX",
    );
    expect(
      requestedEnvironment(request({ "x-environment": " Production " })),
    ).toBe("PRODUCTION");
  });

  it("rejects an unknown or repeated environment", () => {
    expect(
      requestedEnvironment(request({ "x-environment": "staging" })),
    ).toBeNull();
    expect(
      requestedEnvironment(request({ "x-environment": "SANDBOX_" })),
    ).toBeNull();
    expect(
      requestedEnvironment(
        request({ "x-environment": ["sandbox", "production"] }),
      ),
    ).toBeNull();
  });
});

describe("resolveProject", () => {
  beforeEach(() => {
    findProjectForMember.mockReset();
    findProjectForMember.mockResolvedValue(project());
  });

  it("resolves the default project's sandbox when nothing is named", async () => {
    const scope = await resolveProject(request(), tenant());

    expect(findProjectForMember).toHaveBeenCalledWith(
      ORG_ID,
      USER_ID,
      undefined,
    );
    expect(scope).toMatchObject({
      orgId: ORG_ID,
      projectId: PROJECT_ID,
      isDefaultProject: true,
      role: "DEVELOPER",
      environment: "SANDBOX",
      environmentId: "env-sandbox",
      archived: false,
    });
    expect(scope?.permissions).toContain("resources.write");
  });

  it("looks the project up once per request", async () => {
    const req = request({ "x-environment": "production" });

    const [first, second] = await Promise.all([
      resolveProject(req, tenant()),
      resolveProject(req, tenant()),
    ]);

    expect(findProjectForMember).toHaveBeenCalledOnce();
    expect(first).toBe(second);
    expect(first?.environmentId).toBe("env-production");
  });

  it("does not query for a malformed header", async () => {
    expect(
      await resolveProject(request({ "x-project-id": "nope" }), tenant()),
    ).toBeNull();
    expect(
      await resolveProject(request({ "x-environment": "staging" }), tenant()),
    ).toBeNull();
    expect(findProjectForMember).not.toHaveBeenCalled();
  });

  it("hides a restricted project from a developer without a membership", async () => {
    findProjectForMember.mockResolvedValue(project({ restricted: true }));

    expect(await resolveProject(request(), tenant())).toBeNull();
  });

  it("uses the explicit project role on a restricted project", async () => {
    findProjectForMember.mockResolvedValue(
      project({ restricted: true, members: [{ role: "VIEWER" }] }),
    );

    const scope = await resolveProject(request(), tenant());

    expect(scope?.role).toBe("VIEWER");
    expect(scope?.permissions).not.toContain("resources.write");
  });

  it("answers null when the project lacks the requested environment", async () => {
    findProjectForMember.mockResolvedValue(
      project({ environments: [{ id: "env-sandbox", kind: "SANDBOX" }] }),
    );

    expect(
      await resolveProject(
        request({ "x-environment": "production" }),
        tenant(),
      ),
    ).toBeNull();
  });

  it("marks an archived, production-restricted project in the scope", async () => {
    findProjectForMember.mockResolvedValue(
      project({
        archivedAt: new Date("2026-11-01T00:00:00Z"),
        restrictProduction: true,
      }),
    );

    const scope = await resolveProject(
      request({ "x-environment": "production" }),
      tenant("OWNER"),
    );

    expect(scope).toMatchObject({
      role: "ADMIN",
      archived: true,
      restrictProduction: true,
      environment: "PRODUCTION",
    });
    expect(scope?.permissions).toEqual([
      "project.read",
      "project.update",
      "resources.read",
      "payments.read",
    ]);
  });
});

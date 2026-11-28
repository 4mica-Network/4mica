import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authenticateApiKey } from "./api-key";

const { findUnique, update } = vi.hoisted(() => ({
  findUnique: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@4mica/db", () => ({
  prisma: { apiKey: { findUnique, update } },
}));

const KEY = "4mica_sk_test_abcdefghijklmnopqrstuvwxyz";

const record = (
  ipAllowlist: string[] = [],
  securitySettings: {
    ipAllowlist: string[];
    enforceIpAllowlistForApiKeys: boolean;
  } | null = null,
) => ({
  id: "key_1",
  organizationId: "org_1",
  listingId: null,
  agentId: null,
  revokedAt: null,
  expiresAt: null,
  projectId: "project_1",
  environmentId: "env_1",
  serviceAccountId: null,
  scopes: ["PAYMENTS_WRITE"],
  ipAllowlist,
  organization: { deletedAt: null, securitySettings },
  project: { deletedAt: null, archivedAt: null },
  environment: { kind: "SANDBOX" },
  serviceAccount: null,
  listing: null,
  agent: null,
});

let app: FastifyInstance;

const call = (remoteAddress: string) =>
  app.inject({
    method: "GET",
    url: "/probe",
    remoteAddress,
    headers: { authorization: `Bearer ${KEY}` },
  });

describe("API key IP restrictions", () => {
  beforeEach(async () => {
    findUnique.mockReset();
    update.mockReset();
    update.mockResolvedValue({});
    app = Fastify();
    app.decorateRequest("apiKey", null);
    app.get("/probe", { onRequest: [authenticateApiKey] }, async (request) => ({
      key: request.apiKey?.id ?? null,
    }));
    await app.ready();
  });

  afterEach(() => app.close());

  it("accepts an unrestricted key from anywhere", async () => {
    findUnique.mockResolvedValue(record());

    const res = await call("198.51.100.1");

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ key: "key_1" });
  });

  it("accepts a key used from inside its own allowlist", async () => {
    findUnique.mockResolvedValue(record(["198.51.100.0/24"]));

    expect((await call("198.51.100.77")).statusCode).toBe(200);
  });

  it("rejects a key used from outside its own allowlist", async () => {
    findUnique.mockResolvedValue(record(["198.51.100.0/24", "2001:db8::/32"]));

    const res = await call("203.0.113.5");

    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ error: "unauthorized" });
    expect(update).not.toHaveBeenCalled();
  });

  it("rejects a key outside an organization allowlist enforced for keys", async () => {
    findUnique.mockResolvedValue(
      record([], {
        ipAllowlist: ["198.51.100.0/24"],
        enforceIpAllowlistForApiKeys: true,
      }),
    );

    expect((await call("203.0.113.5")).statusCode).toBe(401);
    expect((await call("198.51.100.9")).statusCode).toBe(200);
  });

  it("ignores the organization allowlist when it is not enforced for keys", async () => {
    findUnique.mockResolvedValue(
      record([], {
        ipAllowlist: ["198.51.100.0/24"],
        enforceIpAllowlistForApiKeys: false,
      }),
    );

    expect((await call("203.0.113.5")).statusCode).toBe(200);
  });

  it("needs both lists to pass when both apply", async () => {
    findUnique.mockResolvedValue(
      record(["203.0.113.5"], {
        ipAllowlist: ["198.51.100.0/24"],
        enforceIpAllowlistForApiKeys: true,
      }),
    );

    expect((await call("203.0.113.5")).statusCode).toBe(401);
  });
});

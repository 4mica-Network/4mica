import { prisma } from "@4mica/db";
import { clearUserCache } from "@auth/user-store";
import { resourceKeyRoutes } from "@routes/resource-keys";
import { hashSecret } from "@utils/secrets";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { initApp } from "@/server";
import { runTransactionsOn } from "@/test-support/audit";
import {
  APPROVAL_HEADERS,
  approvedFor,
  governOff,
  governOn,
} from "@/test-support/governance";
import {
  actAs,
  ORG_ID,
  OTHER_ORG_ID,
  OTHER_PROJECT_ID,
  PRODUCTION_ENV_ID,
  PROJECT_ID,
  SANDBOX_ENV_ID,
} from "@/test-support/tenancy";

const {
  authenticateRequest,
  getUser,
  findUnique,
  upsert,
  apiKey,
  apiListing,
  agent,
  resourcePolicy,
  faqItem,
  tenancy,
  governance,
} = vi.hoisted(() => ({
  governance: {
    governanceSettings: { findUnique: vi.fn() },
    approvalRequest: {
      findFirst: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
    },
  },
  tenancy: {
    membership: { findFirst: vi.fn(), create: vi.fn() },
    auditLog: { create: vi.fn() },
    project: { findFirst: vi.fn() },
  },
  authenticateRequest: vi.fn(),
  getUser: vi.fn(),
  findUnique: vi.fn(),
  upsert: vi.fn(),
  apiKey: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    deleteMany: vi.fn(),
  },
  apiListing: { findFirst: vi.fn() },
  agent: { findFirst: vi.fn(), count: vi.fn() },
  resourcePolicy: { findFirst: vi.fn() },
  faqItem: { findMany: vi.fn() },
}));

vi.mock("@clerk/backend", () => ({
  createClerkClient: vi.fn(() => ({ authenticateRequest, users: { getUser } })),
}));

vi.mock("@4mica/db", () => ({
  prisma: {
    ...tenancy,
    ...governance,
    user: { findUnique, upsert, update: vi.fn() },
    business: { findUnique: vi.fn(), upsert: vi.fn() },
    apiKey,
    apiListing,
    agent,
    resourcePolicy,
    faqItem,
    $transaction: vi.fn(),
  },
  disconnect: vi.fn(async () => {}),
}));

const USER_ID = "019fce62-0000-7000-8000-000000000000";
const LISTING_ID = "019fce62-1111-7000-8000-000000000000";
const AGENT_ID = "019fce62-2222-7000-8000-000000000000";
const KEY_ID = "019fce62-3333-7000-8000-000000000000";

const API_KEY = "4mica_sk_abcdefghijklmnop";

const AUTH_USER = {
  id: USER_ID,
  clerkUserId: "user_123",
  email: "ada@example.com",
  name: "Ada Lovelace",
  avatarUrl: null,
  banned: false,
  locked: false,
  deletedAt: null,
};

const signedIn = () => ({
  isAuthenticated: true,
  status: "signed-in",
  reason: null,
  toAuth: () => ({
    tokenType: "session_token",
    userId: "user_123",
    sessionId: "sess_123",
    sessionClaims: { sub: "user_123", sid: "sess_123" },
  }),
});

const signedOut = () => ({
  isAuthenticated: false,
  status: "signed-out",
  reason: "session-token-missing",
  toAuth: () => ({ tokenType: null, userId: null }),
});

const AUTH = { authorization: "Bearer good" };
const KEY_AUTH = { authorization: `Bearer ${API_KEY}` };

const STORED_KEY = {
  id: KEY_ID,
  name: "Production",
  prefix: "4mica_sk_ab12",
  last4: "wxyz",
  scopes: ["PAYMENTS_WRITE", "CUSTOMERS_READ", "RESOURCE_READ"],
  serviceAccountId: null,
  environment: { kind: "SANDBOX" },
  lastUsedAt: null,
  expiresAt: null,
  revokedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const storedKey = (over: Record<string, unknown> = {}) => ({
  id: KEY_ID,
  organizationId: ORG_ID,
  projectId: PROJECT_ID,
  environmentId: SANDBOX_ENV_ID,
  serviceAccountId: null,
  scopes: ["PAYMENTS_WRITE", "CUSTOMERS_READ", "RESOURCE_READ"],
  listingId: null,
  agentId: null,
  revokedAt: null,
  expiresAt: null,
  organization: { deletedAt: null },
  project: { deletedAt: null, archivedAt: null },
  environment: { kind: "SANDBOX" },
  serviceAccount: null,
  listing: null,
  agent: null,
  ...over,
});

const storedListing = (over: Record<string, unknown> = {}) => ({
  id: LISTING_ID,
  slug: "weather",
  name: "Weather",
  summary: null,
  description: null,
  url: null,
  method: "GET",
  docsUrl: null,
  category: null,
  tags: [],
  priceLabel: null,
  visibility: "PRIVATE",
  publishedAt: null,
  walletId: null,
  network: null,
  payToAddress: null,
  assetAddress: null,
  priceAmount: null,
  priceCurrency: null,
  x402Endpoint: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...over,
});

const storedAgent = () => ({
  id: AGENT_ID,
  slug: "critic",
  name: "Critic",
  headline: null,
  description: null,
  avatarUrl: null,
  docsUrl: null,
  status: "ACTIVE",
  visibility: "PRIVATE",
  network: "BASE_SEPOLIA",
  walletAddress: null,
  payerWalletId: null,
  creditLimit: { toFixed: () => "0" },
  walletId: null,
  payToAddress: null,
  assetAddress: null,
  priceAmount: null,
  priceCurrency: null,
  priceLabel: null,
  endpointUrl: null,
  x402Endpoint: null,
  publishedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
});

const storedPolicy = () => ({
  id: "policy_1",
  policyEnabled: true,
  faqEnabled: true,
  refundPolicy: "Any 5xx is refunded.",
  uptimeTarget: null,
  supportResponse: null,
  supportEmail: null,
  rateLimit: null,
  dataRetention: null,
  testEndpoint: null,
  termsUrl: null,
  privacyUrl: null,
  statusUrl: null,
  createdAt: new Date(),
  updatedAt: new Date(),
});

const app = () => initApp([{ plugin: resourceKeyRoutes }]);

describe("resource key routes", () => {
  beforeEach(() => {
    for (const m of [authenticateRequest, getUser, findUnique, upsert]) {
      m.mockReset();
    }
    for (const group of [apiKey, apiListing, agent, resourcePolicy, faqItem]) {
      for (const fn of Object.values(group)) {
        fn.mockReset();
      }
    }
    clearUserCache();
    runTransactionsOn(prisma);
    actAs(tenancy);
    governOff(governance);

    authenticateRequest.mockResolvedValue(signedIn());
    upsert.mockResolvedValue(AUTH_USER);
    apiListing.findFirst.mockResolvedValue({ id: LISTING_ID });
    agent.findFirst.mockResolvedValue({ id: AGENT_ID });
    apiKey.findMany.mockResolvedValue([STORED_KEY]);
    apiKey.create.mockResolvedValue(STORED_KEY);
    apiKey.findUnique.mockResolvedValue(STORED_KEY);
    apiKey.update.mockResolvedValue(STORED_KEY);
    apiKey.updateMany.mockResolvedValue({ count: 1 });
    apiKey.deleteMany.mockResolvedValue({ count: 1 });
    resourcePolicy.findFirst.mockResolvedValue(storedPolicy());
    faqItem.findMany.mockResolvedValue([]);
  });

  describe("owner routes", () => {
    it("requires a session", async () => {
      authenticateRequest.mockResolvedValue(signedOut());
      const instance = await app();

      const res = await instance.inject({
        method: "GET",
        url: `/me/api-listings/${LISTING_ID}/keys`,
      });

      expect(res.statusCode).toBe(401);
      expect(apiKey.findMany).not.toHaveBeenCalled();
      await instance.close();
    });

    it("lists only the keys bound to this listing", async () => {
      const instance = await app();

      const res = await instance.inject({
        method: "GET",
        url: `/me/api-listings/${LISTING_ID}/keys`,
        headers: AUTH,
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().items).toHaveLength(1);
      expect(apiKey.findMany.mock.calls[0][0].where).toEqual({
        listingId: LISTING_ID,
        organizationId: ORG_ID,
        projectId: PROJECT_ID,
        environmentId: SANDBOX_ENV_ID,
      });
      expect(apiListing.findFirst.mock.calls[0][0].where).toEqual({
        id: LISTING_ID,
        organizationId: ORG_ID,
        projectId: PROJECT_ID,
        environmentId: SANDBOX_ENV_ID,
        deletedAt: null,
      });
      await instance.close();
    });

    it("is a 404 on a listing the caller does not own", async () => {
      apiListing.findFirst.mockResolvedValue(null);
      const instance = await app();

      for (const [method, url] of [
        ["GET", `/me/api-listings/${LISTING_ID}/keys`],
        ["POST", `/me/api-listings/${LISTING_ID}/keys`],
        ["POST", `/me/api-listings/${LISTING_ID}/keys/${KEY_ID}/revoke`],
        ["DELETE", `/me/api-listings/${LISTING_ID}/keys/${KEY_ID}`],
      ] as const) {
        const res = await instance.inject({
          method,
          url,
          headers: AUTH,
          ...(method === "POST" ? { payload: { name: "x" } } : {}),
        });
        expect(res.statusCode, `${method} ${url}`).toBe(404);
      }

      expect(apiKey.findMany).not.toHaveBeenCalled();
      expect(apiKey.create).not.toHaveBeenCalled();
      expect(apiKey.updateMany).not.toHaveBeenCalled();
      expect(apiKey.deleteMany).not.toHaveBeenCalled();
      await instance.close();
    });

    it("returns the plaintext once and stores only its hash, bound to the listing", async () => {
      const instance = await app();

      const res = await instance.inject({
        method: "POST",
        url: `/me/api-listings/${LISTING_ID}/keys`,
        headers: AUTH,
        payload: { name: "Production" },
      });

      expect(res.statusCode).toBe(201);
      const { apiKey: created, plaintext } = res.json();
      expect(plaintext).toMatch(/^4mica_sk_test_/);
      expect(created).not.toHaveProperty("hashedKey");

      const data = apiKey.create.mock.calls[0][0].data;
      expect(data.organizationId).toBe(ORG_ID);
      expect(data.projectId).toBe(PROJECT_ID);
      expect(data.environmentId).toBe(SANDBOX_ENV_ID);
      expect(data.scopes).toEqual([
        "PAYMENTS_WRITE",
        "CUSTOMERS_READ",
        "RESOURCE_READ",
      ]);
      expect(data.createdById).toBe(USER_ID);
      expect(data.listingId).toBe(LISTING_ID);
      expect(data).not.toHaveProperty("agentId");
      expect(data.hashedKey).toBe(hashSecret(plaintext));
      expect(JSON.stringify(data)).not.toContain(plaintext);
      await instance.close();
    });

    it("audits creation without the secret", async () => {
      const instance = await app();

      const res = await instance.inject({
        method: "POST",
        url: `/me/api-listings/${LISTING_ID}/keys`,
        headers: AUTH,
        payload: { name: "Production" },
      });

      const entry = tenancy.auditLog.create.mock.calls[0][0].data;
      expect(entry).toMatchObject({
        organizationId: ORG_ID,
        actorUserId: USER_ID,
        action: "api_key.created",
        targetId: KEY_ID,
      });
      expect(JSON.stringify(entry)).not.toContain(res.json().plaintext);
      await instance.close();
    });

    it("404s and probes nothing for an organization the caller is not in", async () => {
      const instance = await app();

      const res = await instance.inject({
        method: "GET",
        url: `/me/api-listings/${LISTING_ID}/keys`,
        headers: { ...AUTH, "x-org-id": OTHER_ORG_ID },
      });

      expect(res.statusCode).toBe(404);
      expect(apiListing.findFirst).not.toHaveBeenCalled();
      expect(apiKey.findMany).not.toHaveBeenCalled();
      await instance.close();
    });

    it("binds an agent key to the agent", async () => {
      const instance = await app();

      const res = await instance.inject({
        method: "POST",
        url: `/me/agents/${AGENT_ID}/keys`,
        headers: AUTH,
        payload: { name: "Agent runtime" },
      });

      expect(res.statusCode).toBe(201);
      const data = apiKey.create.mock.calls[0][0].data;
      expect(data.agentId).toBe(AGENT_ID);
      expect(data).not.toHaveProperty("listingId");
      await instance.close();
    });

    it("rejects a blank name", async () => {
      const instance = await app();

      const res = await instance.inject({
        method: "POST",
        url: `/me/agents/${AGENT_ID}/keys`,
        headers: AUTH,
        payload: { name: "   " },
      });

      expect(res.statusCode).toBe(400);
      expect(apiKey.create).not.toHaveBeenCalled();
      await instance.close();
    });

    it("changes the allowlist of a key bound to this resource only", async () => {
      const instance = await app();

      const res = await instance.inject({
        method: "PATCH",
        url: `/me/agents/${AGENT_ID}/keys/${KEY_ID}`,
        headers: AUTH,
        payload: { ipAllowlist: ["198.51.100.0/24"] },
      });

      expect(res.statusCode).toBe(200);
      expect(apiKey.updateMany.mock.calls[0][0]).toEqual({
        where: {
          id: KEY_ID,
          agentId: AGENT_ID,
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          environmentId: SANDBOX_ENV_ID,
        },
        data: { ipAllowlist: ["198.51.100.0/24"] },
      });
      expect(tenancy.auditLog.create.mock.calls[0][0].data).toMatchObject({
        action: "api_key.updated",
        targetId: KEY_ID,
      });
      await instance.close();
    });

    it("revokes only a key bound to this resource", async () => {
      const instance = await app();

      const res = await instance.inject({
        method: "POST",
        url: `/me/agents/${AGENT_ID}/keys/${KEY_ID}/revoke`,
        headers: AUTH,
      });

      expect(res.statusCode).toBe(200);
      expect(apiKey.updateMany.mock.calls[0][0].where).toEqual({
        id: KEY_ID,
        agentId: AGENT_ID,
        organizationId: ORG_ID,
        projectId: PROJECT_ID,
        environmentId: SANDBOX_ENV_ID,
        revokedAt: null,
      });
      expect(tenancy.auditLog.create.mock.calls[0][0].data).toMatchObject({
        action: "api_key.revoked",
        targetId: KEY_ID,
      });
      await instance.close();
    });

    it("is a 404 when the key belongs to another resource", async () => {
      apiKey.updateMany.mockResolvedValue({ count: 0 });
      apiKey.deleteMany.mockResolvedValue({ count: 0 });
      const instance = await app();

      const revoke = await instance.inject({
        method: "POST",
        url: `/me/api-listings/${LISTING_ID}/keys/${KEY_ID}/revoke`,
        headers: AUTH,
      });
      expect(revoke.statusCode).toBe(404);

      const remove = await instance.inject({
        method: "DELETE",
        url: `/me/api-listings/${LISTING_ID}/keys/${KEY_ID}`,
        headers: AUTH,
      });
      expect(remove.statusCode).toBe(404);
      await instance.close();
    });

    it("deletes a key bound to this listing", async () => {
      const instance = await app();

      const res = await instance.inject({
        method: "DELETE",
        url: `/me/api-listings/${LISTING_ID}/keys/${KEY_ID}`,
        headers: AUTH,
      });

      expect(res.statusCode).toBe(204);
      expect(apiKey.deleteMany.mock.calls[0][0].where).toEqual({
        id: KEY_ID,
        listingId: LISTING_ID,
        organizationId: ORG_ID,
        projectId: PROJECT_ID,
        environmentId: SANDBOX_ENV_ID,
      });
      await instance.close();
    });
  });

  describe("GET /v1/resource", () => {
    it("rejects a session token, a missing key and an unknown key", async () => {
      const instance = await app();

      apiKey.findUnique.mockResolvedValue(null);
      for (const headers of [undefined, AUTH, KEY_AUTH]) {
        const res = await instance.inject({
          method: "GET",
          url: "/v1/resource",
          headers,
        });
        expect(res.statusCode).toBe(401);
      }

      expect(apiListing.findFirst).not.toHaveBeenCalled();
      await instance.close();
    });

    it("looks the key up by hash, never by plaintext", async () => {
      apiKey.findUnique.mockResolvedValue(storedKey({ listingId: LISTING_ID }));
      apiListing.findFirst.mockResolvedValue(storedListing());
      const instance = await app();

      await instance.inject({
        method: "GET",
        url: "/v1/resource",
        headers: KEY_AUTH,
      });

      const where = apiKey.findUnique.mock.calls[0][0].where;
      expect(where.hashedKey).toBe(hashSecret(API_KEY));
      expect(JSON.stringify(where)).not.toContain(API_KEY);
      await instance.close();
    });

    it("refuses an account-wide key", async () => {
      apiKey.findUnique.mockResolvedValue(storedKey());
      const instance = await app();

      const res = await instance.inject({
        method: "GET",
        url: "/v1/resource",
        headers: KEY_AUTH,
      });

      expect(res.statusCode).toBe(403);
      expect(res.json().error).toBe("key_not_scoped");
      expect(apiListing.findFirst).not.toHaveBeenCalled();
      await instance.close();
    });

    it("returns the listing, its policy and FAQs for a listing key", async () => {
      apiKey.findUnique.mockResolvedValue(
        storedKey({ listingId: LISTING_ID, listing: { deletedAt: null } }),
      );
      apiListing.findFirst.mockResolvedValue(storedListing());
      faqItem.findMany.mockResolvedValue([
        {
          id: "faq_1",
          question: "Is there a free tier?",
          answer: "Yes.",
          sortOrder: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);
      const instance = await app();

      const res = await instance.inject({
        method: "GET",
        url: "/v1/resource",
        headers: KEY_AUTH,
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.kind).toBe("listing");
      expect(body.listing.id).toBe(LISTING_ID);
      expect(body.listing.assetDecimals).toBeNull();
      expect(body.agent).toBeNull();
      expect(body.policy.refundPolicy).toBe("Any 5xx is refunded.");
      expect(body.faqs).toHaveLength(1);

      expect(apiListing.findFirst.mock.calls[0][0].where).toEqual({
        id: LISTING_ID,
        organizationId: ORG_ID,
        projectId: PROJECT_ID,
        environmentId: SANDBOX_ENV_ID,
        deletedAt: null,
      });
      expect(resourcePolicy.findFirst.mock.calls[0][0].where).toEqual({
        listingId: LISTING_ID,
      });
      expect(agent.findFirst).not.toHaveBeenCalled();
      await instance.close();
    });

    it("gives the decimals of the token a listing is priced in", async () => {
      apiKey.findUnique.mockResolvedValue(
        storedKey({ listingId: LISTING_ID, listing: { deletedAt: null } }),
      );
      apiListing.findFirst.mockResolvedValue(
        storedListing({
          network: "BASE_SEPOLIA",
          assetAddress: "0x036cbd53842c5426634e7929541ec2318f3dcf7e",
        }),
      );
      const instance = await app();

      const res = await instance.inject({
        method: "GET",
        url: "/v1/resource",
        headers: KEY_AUTH,
      });

      expect(res.json().listing.assetDecimals).toBe(6);
      await instance.close();
    });

    it("returns the agent for an agent key", async () => {
      apiKey.findUnique.mockResolvedValue(
        storedKey({ agentId: AGENT_ID, agent: { deletedAt: null } }),
      );
      agent.findFirst.mockResolvedValue(storedAgent());
      resourcePolicy.findFirst.mockResolvedValue(null);
      const instance = await app();

      const res = await instance.inject({
        method: "GET",
        url: "/v1/resource",
        headers: KEY_AUTH,
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.kind).toBe("agent");
      expect(body.agent.id).toBe(AGENT_ID);
      expect(body.agent.assetDecimals).toBe(18);
      expect(body.listing).toBeNull();
      expect(body.policy).toBeNull();
      expect(body.faqs).toEqual([]);
      expect(apiListing.findFirst).not.toHaveBeenCalled();
      await instance.close();
    });

    it("rejects a revoked, expired or orphaned key", async () => {
      const instance = await app();

      for (const key of [
        storedKey({ listingId: LISTING_ID, revokedAt: new Date() }),
        storedKey({
          listingId: LISTING_ID,
          expiresAt: new Date(Date.now() - 1000),
        }),
        storedKey({
          listingId: LISTING_ID,
          listing: { deletedAt: new Date() },
        }),
        storedKey({ agentId: AGENT_ID, agent: { deletedAt: new Date() } }),
      ]) {
        apiKey.findUnique.mockResolvedValue(key);
        const res = await instance.inject({
          method: "GET",
          url: "/v1/resource",
          headers: KEY_AUTH,
        });
        expect(res.statusCode).toBe(401);
      }

      expect(apiListing.findFirst).not.toHaveBeenCalled();
      expect(agent.findFirst).not.toHaveBeenCalled();
      await instance.close();
    });
  });
  describe("projects, environments and scopes", () => {
    it("mints a live key for a production resource with the scopes asked for", async () => {
      const instance = await app();

      const res = await instance.inject({
        method: "POST",
        url: `/me/api-listings/${LISTING_ID}/keys`,
        headers: { ...AUTH, "x-environment": "production" },
        payload: { name: "Production", scopes: ["RESOURCE_READ"] },
      });

      expect(res.statusCode).toBe(201);
      expect(res.json().plaintext).toMatch(/^4mica_sk_live_/);
      expect(apiListing.findFirst.mock.calls[0][0].where).toMatchObject({
        projectId: PROJECT_ID,
        environmentId: PRODUCTION_ENV_ID,
      });
      expect(apiKey.create.mock.calls[0][0].data).toMatchObject({
        projectId: PROJECT_ID,
        environmentId: PRODUCTION_ENV_ID,
        scopes: ["RESOURCE_READ"],
      });
      await instance.close();
    });

    it("404s on a project the caller cannot see", async () => {
      const instance = await app();

      const res = await instance.inject({
        method: "GET",
        url: `/me/api-listings/${LISTING_ID}/keys`,
        headers: { ...AUTH, "x-project-id": OTHER_PROJECT_ID },
      });

      expect(res.statusCode).toBe(404);
      expect(apiListing.findFirst).not.toHaveBeenCalled();
      await instance.close();
    });

    it("lets a viewer list keys but not mint or revoke them", async () => {
      actAs(tenancy, "VIEWER");
      const instance = await app();

      const list = await instance.inject({
        method: "GET",
        url: `/me/api-listings/${LISTING_ID}/keys`,
        headers: AUTH,
      });
      expect(list.statusCode).toBe(200);

      for (const [method, url] of [
        ["POST", `/me/api-listings/${LISTING_ID}/keys`],
        ["POST", `/me/api-listings/${LISTING_ID}/keys/${KEY_ID}/revoke`],
        ["DELETE", `/me/api-listings/${LISTING_ID}/keys/${KEY_ID}`],
      ] as const) {
        const res = await instance.inject({
          method,
          url,
          headers: AUTH,
          ...(method === "POST" ? { payload: { name: "x" } } : {}),
        });
        expect(res.statusCode, `${method} ${url}`).toBe(403);
        expect(res.json().permission).toBe("keys.manage");
      }
      expect(apiKey.create).not.toHaveBeenCalled();
      expect(apiKey.updateMany).not.toHaveBeenCalled();
      expect(apiKey.deleteMany).not.toHaveBeenCalled();
      await instance.close();
    });

    it("refuses a key without the RESOURCE_READ scope", async () => {
      apiKey.findUnique.mockResolvedValue(
        storedKey({
          listingId: LISTING_ID,
          listing: { deletedAt: null },
          scopes: ["PAYMENTS_WRITE"],
        }),
      );
      const instance = await app();

      const res = await instance.inject({
        method: "GET",
        url: "/v1/resource",
        headers: KEY_AUTH,
      });

      expect(res.statusCode).toBe(403);
      expect(res.json()).toMatchObject({
        error: "insufficient_scope",
        scope: "RESOURCE_READ",
      });
      expect(apiListing.findFirst).not.toHaveBeenCalled();
      await instance.close();
    });

    it("reads the resource in the key's project and environment", async () => {
      apiKey.findUnique.mockResolvedValue(
        storedKey({
          listingId: LISTING_ID,
          listing: { deletedAt: null },
          environmentId: PRODUCTION_ENV_ID,
          environment: { kind: "PRODUCTION" },
        }),
      );
      apiListing.findFirst.mockResolvedValue(storedListing());
      const instance = await app();

      await instance.inject({
        method: "GET",
        url: "/v1/resource",
        headers: KEY_AUTH,
      });

      expect(apiListing.findFirst.mock.calls[0][0].where).toEqual({
        id: LISTING_ID,
        organizationId: ORG_ID,
        projectId: PROJECT_ID,
        environmentId: PRODUCTION_ENV_ID,
        deletedAt: null,
      });
      await instance.close();
    });
  });

  describe("governed production keys", () => {
    const create = async (headers: Record<string, string> = {}) => {
      const instance = await app();
      const res = await instance.inject({
        method: "POST",
        url: `/me/api-listings/${LISTING_ID}/keys`,
        headers: { ...AUTH, "x-environment": "production", ...headers },
        payload: { name: "Production", scopes: ["RESOURCE_READ"] },
      });
      await instance.close();
      return res;
    };
    const payload = {
      projectId: PROJECT_ID,
      kind: "listing",
      resourceId: LISTING_ID,
      name: "Production",
      scopes: ["RESOURCE_READ"],
    };

    beforeEach(() => {
      governOn(governance, "api_key.create_production");
    });

    it("asks for approval before minting a production resource key", async () => {
      const res = await create();

      expect(res.statusCode).toBe(202);
      expect(
        governance.approvalRequest.create.mock.calls[0][0].data.payload,
      ).toEqual(payload);
      expect(apiKey.create).not.toHaveBeenCalled();
    });

    it("mints the key with a matching approval", async () => {
      approvedFor(governance, "api_key.create_production", payload);

      const res = await create(APPROVAL_HEADERS);

      expect(res.statusCode).toBe(201);
      expect(apiKey.create).toHaveBeenCalledOnce();
    });

    it("refuses an approval for another resource", async () => {
      approvedFor(governance, "api_key.create_production", {
        ...payload,
        resourceId: AGENT_ID,
      });

      const res = await create(APPROVAL_HEADERS);

      expect(res.statusCode).toBe(409);
      expect(apiKey.create).not.toHaveBeenCalled();
    });
  });
});

import { clearUserCache } from "@auth/user-store";
import { trustRoutes } from "@routes/trust";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { initApp } from "@/server";

const {
  authenticateRequest,
  getUser,
  findUnique,
  upsert,
  apiListing,
  agent,
  resourcePolicy,
  review,
  report,
  faqItem,
} = vi.hoisted(() => ({
  authenticateRequest: vi.fn(),
  getUser: vi.fn(),
  findUnique: vi.fn(),
  upsert: vi.fn(),
  apiListing: { findFirst: vi.fn() },
  agent: { findFirst: vi.fn() },
  resourcePolicy: {
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  review: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
    update: vi.fn(),
    aggregate: vi.fn(),
  },
  report: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
    update: vi.fn(),
  },
  faqItem: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("@clerk/backend", () => ({
  createClerkClient: vi.fn(() => ({ authenticateRequest, users: { getUser } })),
}));

vi.mock("@4mica/db", () => ({
  prisma: {
    user: { findUnique, upsert, update: vi.fn() },
    business: { findUnique: vi.fn(), upsert: vi.fn() },
    apiListing,
    agent,
    resourcePolicy,
    review,
    report,
    faqItem,
    $transaction: vi.fn(async (arg: unknown) =>
      typeof arg === "function"
        ? (arg as (tx: unknown) => unknown)({ review, report, faqItem })
        : Promise.all(arg as Promise<unknown>[]),
    ),
  },
  disconnect: vi.fn(async () => {}),
}));

const USER_ID = "019fce62-0000-7000-8000-000000000000";
const LISTING_ID = "019fce62-3333-7000-8000-000000000000";
const REVIEW_ID = "019fce62-4444-7000-8000-000000000000";
const REPORT_ID = "019fce62-5555-7000-8000-000000000000";

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

const AUTH = { authorization: "Bearer good" };

const app = () => initApp([{ plugin: trustRoutes }]);

beforeEach(() => {
  vi.clearAllMocks();
  clearUserCache();
  authenticateRequest.mockResolvedValue(signedIn());
  findUnique.mockResolvedValue(AUTH_USER);
  upsert.mockResolvedValue(AUTH_USER);
  apiListing.findFirst.mockResolvedValue({ id: LISTING_ID });
  agent.findFirst.mockResolvedValue(null);
});

describe("ownership", () => {
  it("404s when the listing is not yours", async () => {
    apiListing.findFirst.mockResolvedValue(null);
    const instance = await app();

    const response = await instance.inject({
      method: "GET",
      url: `/me/api-listings/${LISTING_ID}/policy`,
      headers: AUTH,
    });

    expect(response.statusCode).toBe(404);
    await instance.close();
  });

  it("scopes the ownership probe to the acting user", async () => {
    const instance = await app();
    resourcePolicy.findFirst.mockResolvedValue(null);

    await instance.inject({
      method: "GET",
      url: `/me/api-listings/${LISTING_ID}/policy`,
      headers: AUTH,
    });

    expect(apiListing.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: LISTING_ID, ownerId: USER_ID, deletedAt: null },
      }),
    );
    await instance.close();
  });

  it("rejects an anonymous caller", async () => {
    authenticateRequest.mockResolvedValue({
      isAuthenticated: false,
      status: "signed-out",
      reason: "session-token-missing",
      toAuth: () => ({ tokenType: null, userId: null }),
    });
    const instance = await app();

    const response = await instance.inject({
      method: "GET",
      url: `/me/api-listings/${LISTING_ID}/policy`,
    });

    expect(response.statusCode).toBe(401);
    await instance.close();
  });
});

describe("policy", () => {
  it("creates a policy when none exists", async () => {
    resourcePolicy.findFirst.mockResolvedValue(null);
    resourcePolicy.create.mockResolvedValue({ id: "p1" });
    const instance = await app();

    const response = await instance.inject({
      method: "PUT",
      url: `/me/api-listings/${LISTING_ID}/policy`,
      headers: AUTH,
      payload: { refundPolicy: "Full refund on a 5xx." },
    });

    expect(response.statusCode).toBe(200);
    expect(resourcePolicy.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          listingId: LISTING_ID,
          refundPolicy: "Full refund on a 5xx.",
        }),
      }),
    );
    await instance.close();
  });

  it("updates the existing policy rather than creating a second", async () => {
    resourcePolicy.findFirst.mockResolvedValue({ id: "p1" });
    resourcePolicy.update.mockResolvedValue({ id: "p1" });
    const instance = await app();

    await instance.inject({
      method: "PUT",
      url: `/me/api-listings/${LISTING_ID}/policy`,
      headers: AUTH,
      payload: { uptimeTarget: "99.9%" },
    });

    expect(resourcePolicy.update).toHaveBeenCalled();
    expect(resourcePolicy.create).not.toHaveBeenCalled();
    await instance.close();
  });

  it("treats an empty string as clearing the field", async () => {
    resourcePolicy.findFirst.mockResolvedValue({ id: "p1" });
    resourcePolicy.update.mockResolvedValue({ id: "p1" });
    const instance = await app();

    await instance.inject({
      method: "PUT",
      url: `/me/api-listings/${LISTING_ID}/policy`,
      headers: AUTH,
      payload: { refundPolicy: "   " },
    });

    expect(resourcePolicy.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ refundPolicy: null }),
      }),
    );
    await instance.close();
  });

  it("rejects a support email that is not an address", async () => {
    const instance = await app();

    const response = await instance.inject({
      method: "PUT",
      url: `/me/api-listings/${LISTING_ID}/policy`,
      headers: AUTH,
      payload: { supportEmail: "not-an-email" },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().issues[0].path).toBe("supportEmail");
    await instance.close();
  });

  it("rejects a javascript: URL in a policy link", async () => {
    const instance = await app();

    const response = await instance.inject({
      method: "PUT",
      url: `/me/api-listings/${LISTING_ID}/policy`,
      headers: AUTH,
      payload: { termsUrl: "javascript:alert(1)" },
    });

    expect(response.statusCode).toBe(400);
    await instance.close();
  });
});

describe("reviews", () => {
  it("lists the reviews on an owned listing", async () => {
    review.count.mockResolvedValue(1);
    review.findMany.mockResolvedValue([{ id: REVIEW_ID, rating: 5 }]);
    const instance = await app();

    const response = await instance.inject({
      method: "GET",
      url: `/me/api-listings/${LISTING_ID}/reviews`,
      headers: AUTH,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().total).toBe(1);
    await instance.close();
  });

  it("lets the owner answer a review", async () => {
    review.findFirst.mockResolvedValue({ id: REVIEW_ID });
    review.update.mockResolvedValue({ id: REVIEW_ID, rating: 2 });
    const instance = await app();

    const response = await instance.inject({
      method: "POST",
      url: `/me/api-listings/${LISTING_ID}/reviews/${REVIEW_ID}/reply`,
      headers: AUTH,
      payload: { reply: "Fixed in v2, thank you." },
    });

    expect(response.statusCode).toBe(200);
    expect(review.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ownerReply: "Fixed in v2, thank you.",
        }),
      }),
    );
    await instance.close();
  });

  it("clears the reply timestamp when the reply is removed", async () => {
    review.findFirst.mockResolvedValue({ id: REVIEW_ID });
    review.update.mockResolvedValue({ id: REVIEW_ID, rating: 2 });
    const instance = await app();

    await instance.inject({
      method: "POST",
      url: `/me/api-listings/${LISTING_ID}/reviews/${REVIEW_ID}/reply`,
      headers: AUTH,
      payload: { reply: null },
    });

    expect(review.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { ownerReply: null, ownerRepliedAt: null },
      }),
    );
    await instance.close();
  });

  it("404s on a review that belongs to another listing", async () => {
    review.findFirst.mockResolvedValue(null);
    const instance = await app();

    const response = await instance.inject({
      method: "POST",
      url: `/me/api-listings/${LISTING_ID}/reviews/${REVIEW_ID}/reply`,
      headers: AUTH,
      payload: { reply: "hello" },
    });

    expect(response.statusCode).toBe(404);
    await instance.close();
  });

  it("exposes no route that edits or deletes a review", async () => {
    const instance = await app();

    for (const method of ["PATCH", "DELETE", "PUT"] as const) {
      const response = await instance.inject({
        method,
        url: `/me/api-listings/${LISTING_ID}/reviews/${REVIEW_ID}`,
        headers: AUTH,
        payload: { rating: 5 },
      });

      expect(response.statusCode).toBe(404);
    }

    await instance.close();
  });
});

describe("reports", () => {
  it("lists reports and can filter by status", async () => {
    report.count.mockResolvedValue(1);
    report.findMany.mockResolvedValue([
      { id: REPORT_ID, reason: "SCAM", status: "OPEN" },
    ]);
    const instance = await app();

    await instance.inject({
      method: "GET",
      url: `/me/api-listings/${LISTING_ID}/reports?status=OPEN`,
      headers: AUTH,
    });

    expect(report.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { listingId: LISTING_ID, status: "OPEN" },
      }),
    );
    await instance.close();
  });

  it("lets the owner acknowledge a report", async () => {
    report.findFirst.mockResolvedValue({ id: REPORT_ID, status: "OPEN" });
    report.update.mockResolvedValue({
      id: REPORT_ID,
      reason: "SCAM",
      status: "ACKNOWLEDGED",
    });
    const instance = await app();

    const response = await instance.inject({
      method: "PATCH",
      url: `/me/api-listings/${LISTING_ID}/reports/${REPORT_ID}`,
      headers: AUTH,
      payload: { status: "ACKNOWLEDGED" },
    });

    expect(response.statusCode).toBe(200);
    await instance.close();
  });

  it("refuses to let an owner dismiss a report against themselves", async () => {
    report.findFirst.mockResolvedValue({ id: REPORT_ID, status: "OPEN" });
    const instance = await app();

    const response = await instance.inject({
      method: "PATCH",
      url: `/me/api-listings/${LISTING_ID}/reports/${REPORT_ID}`,
      headers: AUTH,
      payload: { status: "DISMISSED" },
    });

    expect(response.statusCode).toBe(400);
    expect(report.update).not.toHaveBeenCalled();
    await instance.close();
  });
});

describe("trust summary", () => {
  it("returns the rating spread and the open report count", async () => {
    review.aggregate.mockResolvedValue({ _count: 3, _avg: { rating: 4 } });
    review.count
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(1);
    report.count.mockResolvedValue(1);
    const instance = await app();

    const response = await instance.inject({
      method: "GET",
      url: `/me/api-listings/${LISTING_ID}/trust`,
      headers: AUTH,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      ratingCount: 3,
      ratingAverage: 4,
      distribution: { "1": 0, "2": 1, "5": 2 },
    });
    await instance.close();
  });

  it("counts only unhidden reviews", async () => {
    review.aggregate.mockResolvedValue({ _count: 0, _avg: { rating: null } });
    review.count.mockResolvedValue(0);
    report.count.mockResolvedValue(0);
    const instance = await app();

    await instance.inject({
      method: "GET",
      url: `/me/api-listings/${LISTING_ID}/trust`,
      headers: AUTH,
    });

    expect(review.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { listingId: LISTING_ID, hiddenAt: null },
      }),
    );
    await instance.close();
  });
});

describe("agents share the same surface", () => {
  it("proves ownership against the agent table", async () => {
    agent.findFirst.mockResolvedValue({ id: "agent-1" });
    resourcePolicy.findFirst.mockResolvedValue(null);
    const instance = await app();

    const response = await instance.inject({
      method: "GET",
      url: "/me/agents/agent-1/policy",
      headers: AUTH,
    });

    expect(response.statusCode).toBe(200);
    expect(agent.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "agent-1", ownerId: USER_ID, deletedAt: null },
      }),
    );
    expect(apiListing.findFirst).not.toHaveBeenCalled();
    await instance.close();
  });

  it("writes the policy against agentId, not listingId", async () => {
    agent.findFirst.mockResolvedValue({ id: "agent-1" });
    resourcePolicy.findFirst.mockResolvedValue(null);
    resourcePolicy.create.mockResolvedValue({ id: "p1" });
    const instance = await app();

    await instance.inject({
      method: "PUT",
      url: "/me/agents/agent-1/policy",
      headers: AUTH,
      payload: { uptimeTarget: "99%" },
    });

    expect(resourcePolicy.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ agentId: "agent-1" }),
      }),
    );
    await instance.close();
  });
});

describe("faqs", () => {
  const FAQ_ID = "019fce62-6666-7000-8000-000000000000";

  it("appends a new question after the last one", async () => {
    faqItem.findFirst.mockResolvedValue({ sortOrder: 2 });
    faqItem.create.mockResolvedValue({
      id: FAQ_ID,
      question: "q",
      answer: "a",
    });
    const instance = await app();

    const response = await instance.inject({
      method: "POST",
      url: `/me/api-listings/${LISTING_ID}/faqs`,
      headers: AUTH,
      payload: { question: "Does it rate limit?", answer: "60/min." },
    });

    expect(response.statusCode).toBe(201);
    expect(faqItem.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ listingId: LISTING_ID, sortOrder: 3 }),
      }),
    );
    await instance.close();
  });

  it("starts at zero when there are none", async () => {
    faqItem.findFirst.mockResolvedValue(null);
    faqItem.create.mockResolvedValue({
      id: FAQ_ID,
      question: "q",
      answer: "a",
    });
    const instance = await app();

    await instance.inject({
      method: "POST",
      url: `/me/api-listings/${LISTING_ID}/faqs`,
      headers: AUTH,
      payload: { question: "First?", answer: "Yes." },
    });

    expect(faqItem.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ sortOrder: 0 }),
      }),
    );
    await instance.close();
  });

  it("rejects an empty question", async () => {
    const instance = await app();

    const response = await instance.inject({
      method: "POST",
      url: `/me/api-listings/${LISTING_ID}/faqs`,
      headers: AUTH,
      payload: { question: "   ", answer: "something" },
    });

    expect(response.statusCode).toBe(400);
    await instance.close();
  });

  it("reorders only the questions that belong to this listing", async () => {
    faqItem.findMany
      .mockResolvedValueOnce([{ id: "a" }, { id: "b" }])
      .mockResolvedValueOnce([]);
    faqItem.update.mockResolvedValue({});
    const instance = await app();

    const response = await instance.inject({
      method: "PUT",
      url: `/me/api-listings/${LISTING_ID}/faqs/order`,
      headers: AUTH,
      payload: { ids: ["b", "a", "someone-elses"] },
    });

    expect(response.statusCode).toBe(200);
    expect(faqItem.update).toHaveBeenCalledTimes(2);
    expect(faqItem.update).toHaveBeenNthCalledWith(1, {
      where: { id: "b" },
      data: { sortOrder: 0 },
    });
    await instance.close();
  });

  it("404s when deleting a question from another listing", async () => {
    faqItem.findFirst.mockResolvedValue(null);
    const instance = await app();

    const response = await instance.inject({
      method: "DELETE",
      url: `/me/api-listings/${LISTING_ID}/faqs/${FAQ_ID}`,
      headers: AUTH,
    });

    expect(response.statusCode).toBe(404);
    expect(faqItem.delete).not.toHaveBeenCalled();
    await instance.close();
  });
});

describe("disclosure toggles", () => {
  it("saves the policy and faq switches", async () => {
    resourcePolicy.findFirst.mockResolvedValue({ id: "p1" });
    resourcePolicy.update.mockResolvedValue({ id: "p1" });
    const instance = await app();

    await instance.inject({
      method: "PUT",
      url: `/me/api-listings/${LISTING_ID}/policy`,
      headers: AUTH,
      payload: { policyEnabled: false, faqEnabled: true },
    });

    expect(resourcePolicy.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          policyEnabled: false,
          faqEnabled: true,
        }),
      }),
    );
    await instance.close();
  });
});

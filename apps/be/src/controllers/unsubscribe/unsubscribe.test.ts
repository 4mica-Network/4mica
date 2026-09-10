import { unsubscribeRoutes } from "@routes/unsubscribe";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { initApp } from "@/server";

const { findUnique, update, queueUpdateMany, transaction } = vi.hoisted(() => ({
  findUnique: vi.fn(),
  update: vi.fn(),
  queueUpdateMany: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@clerk/backend", () => ({
  createClerkClient: vi.fn(() => ({
    authenticateRequest: vi.fn(),
    users: { getUser: vi.fn() },
  })),
}));

vi.mock("@4mica/db", () => ({
  prisma: {
    agent: { count: vi.fn() },
    user: { findUnique, update },
    onboardingEmailQueue: { updateMany: queueUpdateMany },
    $transaction: transaction,
  },
  disconnect: vi.fn(async () => {}),
}));

const build = () => initApp([{ plugin: unsubscribeRoutes }]);

const tokenFor = async (userId: string): Promise<string> => {
  const { signUnsubscribeToken } = await import("@services/unsubscribe-token");

  return signUnsubscribeToken(userId) as string;
};

describe("unsubscribe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findUnique.mockResolvedValue({ id: "user-1" });
    transaction.mockResolvedValue([]);
  });

  it("GET does not touch the database", async () => {
    const app = await build();
    const token = await tokenFor("user-1");

    const response = await app.inject({
      method: "GET",
      url: `/unsubscribe?token=${encodeURIComponent(token)}`,
    });

    expect(response.statusCode).toBe(303);
    expect(update).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();

    await app.close();
  });

  it("GET redirects to the dashboard confirm screen carrying the token", async () => {
    const app = await build();
    const token = await tokenFor("user-1");

    const response = await app.inject({
      method: "GET",
      url: `/unsubscribe?token=${encodeURIComponent(token)}`,
    });

    const location = new URL(response.headers.location as string);

    expect(location.pathname).toBe("/settings/notifications");
    expect(location.searchParams.get("unsubscribe")).toBe("confirm");
    expect(location.searchParams.get("token")).toBe(token);
    expect(response.headers["cache-control"]).toBe("no-store");

    await app.close();
  });

  it("GET sends an invalid token to the failure screen", async () => {
    const app = await build();

    const response = await app.inject({
      method: "GET",
      url: "/unsubscribe?token=garbage",
    });

    expect(response.statusCode).toBe(303);
    expect(response.headers.location).toContain("unsubscribe=invalid");
    expect(update).not.toHaveBeenCalled();

    await app.close();
  });

  it("POST opts the user out", async () => {
    const app = await build();
    const token = await tokenFor("user-1");

    const response = await app.inject({
      method: "POST",
      url: "/unsubscribe",
      payload: { token },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ unsubscribed: true });
    expect(update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { allowMarketingOnboardingEmails: false },
    });

    await app.close();
  });

  it("POST accepts the token from the query string for one-click", async () => {
    const app = await build();
    const token = await tokenFor("user-1");

    const response = await app.inject({
      method: "POST",
      url: `/unsubscribe?token=${encodeURIComponent(token)}`,
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: "List-Unsubscribe=One-Click",
    });

    expect(response.statusCode).toBe(200);
    expect(update).toHaveBeenCalled();

    await app.close();
  });

  it("POST with a bad token changes nothing but still answers 200", async () => {
    const app = await build();

    const response = await app.inject({
      method: "POST",
      url: "/unsubscribe",
      payload: { token: "v1.bogus.bogus" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ unsubscribed: true });
    expect(update).not.toHaveBeenCalled();

    await app.close();
  });

  it("POST for a user that no longer exists changes nothing", async () => {
    findUnique.mockResolvedValue(null);
    const app = await build();
    const token = await tokenFor("user-gone");

    const response = await app.inject({
      method: "POST",
      url: "/unsubscribe",
      payload: { token },
    });

    expect(response.statusCode).toBe(200);
    expect(transaction).not.toHaveBeenCalled();

    await app.close();
  });

  it("needs no session", async () => {
    const app = await build();

    const response = await app.inject({ method: "POST", url: "/unsubscribe" });

    expect(response.statusCode).toBe(200);

    await app.close();
  });
});

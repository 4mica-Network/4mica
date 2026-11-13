import { beforeEach, describe, expect, it, vi } from "vitest";

const { auth, warn } = vi.hoisted(() => ({ auth: vi.fn(), warn: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", () => ({ auth }));
vi.mock("@/logger", () => ({ requestLogger: async () => ({ warn }) }));

const STORE = Symbol.for("4mica.playground.writeLimiter");

const { allowWrite, WRITE_LIMIT } = await import("./writeLimit");

describe("allowWrite", () => {
  beforeEach(() => {
    delete (globalThis as Record<symbol, unknown>)[STORE];
    auth.mockReset();
    warn.mockReset();
  });

  it("refuses a signed-in user past the per-minute budget and logs it", async () => {
    auth.mockResolvedValue({ userId: "user_1" });

    for (let i = 0; i < WRITE_LIMIT.limit; i += 1) {
      expect(await allowWrite("submitReview")).toBe(true);
    }

    expect(await allowWrite("submitReview")).toBe(false);
    expect(warn).toHaveBeenCalledWith("write rate limit exceeded", {
      action: "submitReview",
      clerkUserId: "user_1",
    });
  });

  it("budgets each user separately", async () => {
    auth.mockResolvedValue({ userId: "user_1" });
    for (let i = 0; i < WRITE_LIMIT.limit; i += 1) {
      await allowWrite("fileReport");
    }

    auth.mockResolvedValue({ userId: "user_2" });
    expect(await allowWrite("fileReport")).toBe(true);
  });

  it("lets signed-out and unresolvable sessions through to the auth check", async () => {
    auth.mockResolvedValue({ userId: null });
    for (let i = 0; i <= WRITE_LIMIT.limit; i += 1) {
      expect(await allowWrite("submitReview")).toBe(true);
    }

    auth.mockRejectedValue(new Error("clerk down"));
    expect(await allowWrite("submitReview")).toBe(true);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const { auth, warn, env, exec, incr, pexpire, client } = vi.hoisted(() => ({
  auth: vi.fn(),
  warn: vi.fn(),
  env: { VALKEY_URL: "" },
  exec: vi.fn(),
  incr: vi.fn(),
  pexpire: vi.fn(),
  client: { status: "ready" },
}));

vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", () => ({ auth }));
vi.mock("@/logger", () => ({ requestLogger: async () => ({ warn }) }));
vi.mock("@/env.server", () => ({ serverEnv: () => env }));
vi.mock("ioredis", () => ({
  default: class {
    get status() {
      return client.status;
    }
    on() {
      return this;
    }
    multi() {
      const chain = {
        incr: (key: string) => {
          incr(key);
          return chain;
        },
        pexpire: (key: string, ms: number) => {
          pexpire(key, ms);
          return chain;
        },
        exec,
      };
      return chain;
    }
  },
}));

const STORE = Symbol.for("4mica.playground.writeLimiter");

const { allowWrite, WRITE_LIMIT } = await import("./writeLimit");

const reset = (valkeyUrl: string) => {
  delete (globalThis as Record<symbol, unknown>)[STORE];
  env.VALKEY_URL = valkeyUrl;
  client.status = "ready";
  for (const mock of [auth, warn, exec, incr, pexpire]) {
    mock.mockReset();
  }
};

describe("allowWrite without Valkey", () => {
  beforeEach(() => reset(""));

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

describe("allowWrite with Valkey", () => {
  beforeEach(() => {
    reset("redis://valkey:6379");
    auth.mockResolvedValue({ userId: "user_1" });
  });

  it("counts in Valkey per user and window, expiring with the window", async () => {
    exec.mockResolvedValue([
      [null, 3],
      [null, 1],
    ]);

    expect(await allowWrite("submitReview")).toBe(true);

    const window = Math.floor(Date.now() / WRITE_LIMIT.windowMs);
    expect(incr).toHaveBeenCalledWith(`playground:write:user_1:${window}`);
    expect(pexpire).toHaveBeenCalledWith(
      `playground:write:user_1:${window}`,
      WRITE_LIMIT.windowMs,
    );
  });

  it("refuses once the shared count passes the limit", async () => {
    exec.mockResolvedValue([
      [null, WRITE_LIMIT.limit + 1],
      [null, 1],
    ]);

    expect(await allowWrite("submitReview")).toBe(false);
    expect(warn).toHaveBeenCalledWith("write rate limit exceeded", {
      action: "submitReview",
      clerkUserId: "user_1",
    });
  });

  it("falls back to the in-process limit when Valkey fails", async () => {
    exec.mockRejectedValue(new Error("Connection is closed."));

    for (let i = 0; i < WRITE_LIMIT.limit; i += 1) {
      expect(await allowWrite("submitReview")).toBe(true);
    }
    expect(await allowWrite("submitReview")).toBe(false);
    expect(warn).toHaveBeenCalledWith(
      "shared write limit unavailable; using the in-process limit",
      { action: "submitReview", error: "Connection is closed." },
    );
  });

  it("falls back at once, without sending, while Valkey is reconnecting", async () => {
    client.status = "reconnecting";

    expect(await allowWrite("submitReview")).toBe(true);
    expect(exec).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      "shared write limit unavailable; using the in-process limit",
      { action: "submitReview", error: "valkey is reconnecting" },
    );
  });

  it("treats a failed INCR reply as unavailable", async () => {
    exec.mockResolvedValue([[new Error("OOM"), null]]);

    expect(await allowWrite("submitReview")).toBe(true);
    expect(warn).toHaveBeenCalledWith(
      "shared write limit unavailable; using the in-process limit",
      { action: "submitReview", error: "OOM" },
    );
  });
});

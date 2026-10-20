import type { AuthIdentity } from "@4mica/auth";
import {
  CACHE_MAX_ENTRIES,
  clearUserCache,
  invalidateUser,
  loadUser,
} from "@auth/user-store";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { authenticateRequest, getUser, findUnique, upsert } = vi.hoisted(() => ({
  authenticateRequest: vi.fn(),
  getUser: vi.fn(),
  findUnique: vi.fn(),
  upsert: vi.fn(),
}));

vi.mock("@clerk/backend", () => ({
  createClerkClient: vi.fn(() => ({
    authenticateRequest,
    users: { getUser },
  })),
}));

vi.mock("@4mica/db", () => ({
  prisma: { user: { findUnique, upsert } },
  disconnect: vi.fn(async () => {}),
}));

const HANDLE_PATTERN = /^user-[0-9abcdefghjkmnpqrstvwxyz]{8}$/;

const IDENTITY: AuthIdentity = {
  clerkUserId: "user_123",
  sessionId: "sess_123",
  email: "ada@example.com",
  name: "Ada Lovelace",
  avatarUrl: null,
};

const ROW = {
  id: "019fce62-0000-7000-8000-000000000000",
  clerkUserId: IDENTITY.clerkUserId,
  email: IDENTITY.email,
  name: IDENTITY.name,
  avatarUrl: null,
  banned: false,
  locked: false,
  deletedAt: null,
};

const uniqueViolation = (target: string[]) =>
  Object.assign(new Error("unique"), { code: "P2002", meta: { target } });

const createArg = (call: number) => upsert.mock.calls[call][0].create;

describe("loadUser", () => {
  beforeEach(() => {
    for (const m of [authenticateRequest, getUser, findUnique, upsert]) {
      m.mockReset();
    }
    clearUserCache();

    findUnique.mockResolvedValue(null);
    upsert.mockResolvedValue(ROW);
  });

  it("gives a brand-new account a generated handle", async () => {
    const user = await loadUser(IDENTITY);

    expect(user.id).toBe(ROW.id);
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(createArg(0).username).toMatch(HANDLE_PATTERN);
  });

  it("never rewrites the handle of a returning account", async () => {
    findUnique.mockResolvedValue(ROW);

    await loadUser(IDENTITY);

    expect(upsert.mock.calls[0][0].update).not.toHaveProperty("username");
  });

  it("never overwrites a returning user's own name, email or avatar", async () => {
    findUnique.mockResolvedValue({
      ...ROW,
      name: "Ada (edited)",
      email: "ada@edited.example",
      avatarUrl: "https://cdn.example/edited.png",
    });

    await loadUser({ ...IDENTITY, avatarUrl: "https://clerk.example/a.png" });

    const update = upsert.mock.calls[0][0].update;
    expect(update).not.toHaveProperty("name");
    expect(update).not.toHaveProperty("email");
    expect(update).not.toHaveProperty("avatarUrl");
    expect(update).toHaveProperty("lastSeenAt");
  });

  it("fills only the gaps on a returning account", async () => {
    findUnique.mockResolvedValue({
      ...ROW,
      name: "",
      email: null,
      avatarUrl: null,
    });

    await loadUser({ ...IDENTITY, avatarUrl: "https://clerk.example/a.png" });

    expect(upsert.mock.calls[0][0].update).toMatchObject({
      name: IDENTITY.name,
      email: IDENTITY.email,
      avatarUrl: "https://clerk.example/a.png",
    });
  });

  it("copies the profile in full when the account is created", async () => {
    await loadUser(IDENTITY);

    expect(createArg(0)).toMatchObject({
      name: IDENTITY.name,
      email: IDENTITY.email,
    });
    // Nothing to fill if a concurrent request created the row first.
    expect(upsert.mock.calls[0][0].update).not.toHaveProperty("name");
  });

  it("draws a new handle when the generated one is taken", async () => {
    upsert
      .mockRejectedValueOnce(uniqueViolation(["username"]))
      .mockResolvedValueOnce(ROW);

    const user = await loadUser(IDENTITY);

    expect(user.id).toBe(ROW.id);
    expect(upsert).toHaveBeenCalledTimes(2);
    expect(createArg(1).username).toMatch(HANDLE_PATTERN);
    expect(createArg(1).username).not.toBe(createArg(0).username);
    // The email was never the problem, so it is still on the retry.
    expect(createArg(1).email).toBe(IDENTITY.email);
  });

  it("drops a claimed email but keeps the same handle", async () => {
    upsert
      .mockRejectedValueOnce(uniqueViolation(["email"]))
      .mockResolvedValueOnce(ROW);

    const user = await loadUser(IDENTITY);

    expect(user.id).toBe(ROW.id);
    expect(upsert).toHaveBeenCalledTimes(2);
    expect(createArg(1)).not.toHaveProperty("email");
    expect(createArg(1).username).toBe(createArg(0).username);
  });

  it("gives up rather than looping on a persistent collision", async () => {
    upsert.mockRejectedValue(uniqueViolation(["username"]));

    await expect(loadUser(IDENTITY)).rejects.toThrow("unique");
    expect(upsert).toHaveBeenCalledTimes(3);
  });

  it("rethrows anything that is not a unique violation", async () => {
    upsert.mockRejectedValue(new Error("connection refused"));

    await expect(loadUser(IDENTITY)).rejects.toThrow("connection refused");
    expect(upsert).toHaveBeenCalledTimes(1);
  });
});

describe("loadUser cache", () => {
  const withId = (clerkUserId: string): AuthIdentity => ({
    ...IDENTITY,
    clerkUserId,
  });

  beforeEach(() => {
    findUnique.mockReset();
    upsert.mockReset();
    clearUserCache();

    findUnique.mockResolvedValue(ROW);
    upsert.mockResolvedValue(ROW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("serves a repeat request from the cache", async () => {
    await loadUser(IDENTITY);
    await loadUser(IDENTITY);

    expect(upsert).toHaveBeenCalledTimes(1);
  });

  it("reloads once the entry has expired", async () => {
    vi.useFakeTimers();

    await loadUser(IDENTITY);
    vi.advanceTimersByTime(60_001);
    await loadUser(IDENTITY);

    expect(upsert).toHaveBeenCalledTimes(2);
  });

  it("reloads after the user is invalidated", async () => {
    await loadUser(IDENTITY);
    invalidateUser(IDENTITY.clerkUserId);
    await loadUser(IDENTITY);

    expect(upsert).toHaveBeenCalledTimes(2);
  });

  it("evicts the least recently used entry at capacity", async () => {
    for (let i = 0; i < CACHE_MAX_ENTRIES; i += 1) {
      await loadUser(withId(`user_${i}`));
    }
    await loadUser(withId("user_0"));
    await loadUser(withId("user_overflow"));
    upsert.mockClear();

    await loadUser(withId("user_0"));
    expect(upsert).not.toHaveBeenCalled();

    await loadUser(withId("user_1"));
    expect(upsert).toHaveBeenCalledTimes(1);
  });
});

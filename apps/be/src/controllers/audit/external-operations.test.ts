import { beforeEach, describe, expect, it, vi } from "vitest";

const { externalOperation } = vi.hoisted(() => ({
  externalOperation: { create: vi.fn(), update: vi.fn() },
}));

vi.mock("@4mica/db", () => ({
  prisma: { externalOperation },
  disconnect: vi.fn(),
}));

const { clerkOutcome, trackExternalOperation } = await import(
  "./external-operations"
);

const OP = {
  orgId: "org",
  actorUserId: "user",
  kind: "clerk.sessions.revoke",
  targetType: "user",
  targetId: "u1",
};

const statuses = () =>
  externalOperation.update.mock.calls.map(([arg]) => arg.data.status);

describe("trackExternalOperation", () => {
  beforeEach(() => {
    externalOperation.create.mockReset();
    externalOperation.update.mockReset();
    externalOperation.create.mockResolvedValue({ id: "op_1" });
    externalOperation.update.mockResolvedValue({ id: "op_1" });
  });

  it("writes the pending row before the call and settles it after", async () => {
    const run = vi.fn(async () => {
      expect(externalOperation.create).toHaveBeenCalledOnce();
      expect(externalOperation.update).not.toHaveBeenCalled();
      return 3;
    });

    expect(await trackExternalOperation(OP, run)).toBe(3);
    expect(externalOperation.create.mock.calls[0][0].data).toEqual({
      organizationId: "org",
      actorUserId: "user",
      kind: "clerk.sessions.revoke",
      targetType: "user",
      targetId: "u1",
    });
    expect(externalOperation.update.mock.calls[0][0]).toMatchObject({
      where: { id: "op_1" },
      data: { status: "SUCCEEDED", error: null },
    });
  });

  it.each([
    ["a network error", "UNKNOWN", new TypeError("fetch failed")],
    [
      "a Clerk 5xx",
      "UNKNOWN",
      Object.assign(new Error("bad gateway"), { status: 502 }),
    ],
    [
      "a Clerk 4xx",
      "FAILED",
      Object.assign(new Error("forbidden"), { status: 403 }),
    ],
  ])("settles %s as %s and rethrows it", async (_label, status, error) => {
    await expect(
      trackExternalOperation(OP, async () => {
        throw error;
      }),
    ).rejects.toBe(error);
    expect(statuses()).toEqual([status]);
    expect(externalOperation.update.mock.calls[0][0].data.error).toBe(
      error.message,
    );
  });

  it("never calls out when the pending row cannot be written", async () => {
    externalOperation.create.mockRejectedValue(new Error("db down"));
    const run = vi.fn();

    await expect(trackExternalOperation(OP, run)).rejects.toThrow("db down");
    expect(run).not.toHaveBeenCalled();
  });

  it("keeps the caller's result when settling fails, leaving the row PENDING", async () => {
    externalOperation.update.mockRejectedValue(new Error("db down"));

    expect(await trackExternalOperation(OP, async () => "done")).toBe("done");
  });

  it("treats anything without a 4xx status as ambiguous", () => {
    expect(clerkOutcome(undefined)).toBe("UNKNOWN");
    expect(clerkOutcome({ status: 404 })).toBe("FAILED");
    expect(clerkOutcome({ status: 500 })).toBe("UNKNOWN");
  });
});

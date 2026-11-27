import { beforeEach, describe, expect, it, vi } from "vitest";

const { prisma, tx } = vi.hoisted(() => {
  const tx = { report: { findFirst: vi.fn(), create: vi.fn() } };
  return {
    tx,
    prisma: {
      apiListing: { findFirst: vi.fn() },
      agent: { findFirst: vi.fn() },
      review: { upsert: vi.fn() },
      $transaction: vi.fn((run: (client: typeof tx) => unknown) => run(tx)),
    },
  };
});

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), updateTag: vi.fn() }));
vi.mock("@/services/db", () => ({ prisma }));
vi.mock("@/services/trust", () => ({
  hasSettledPayment: vi.fn().mockResolvedValue(true),
  targetOf: (kind: string, id: string) =>
    kind === "listing" ? { listingId: id } : { agentId: id },
}));
vi.mock("@/services/viewer", () => ({
  getViewer: vi.fn().mockResolvedValue({ id: "buyer" }),
}));
vi.mock("@/services/writeLimit", () => ({
  allowWrite: vi.fn().mockResolvedValue(true),
}));

const { fileReport, submitReview } = await import("./trust");
const { PAYABLE_AGENT, PAYABLE_LISTING } = await import("@/services/payable");

const resource = (kind: "listing" | "agent") => ({
  kind,
  id: "019fce62-0000-7000-8000-000000000000",
  username: "ada",
  ref: "weather",
});

const incompleteTarget = {
  ownerId: "seller",
  slug: "weather",
  owner: { username: "ada" },
};

beforeEach(() => {
  vi.clearAllMocks();
  prisma.apiListing.findFirst.mockResolvedValue(incompleteTarget);
  prisma.agent.findFirst.mockResolvedValue(incompleteTarget);
  prisma.review.upsert.mockResolvedValue({});
  tx.report.findFirst.mockResolvedValue(null);
  tx.report.create.mockResolvedValue({});
});

describe.each([
  ["listing", prisma.apiListing, PAYABLE_LISTING],
  ["agent", prisma.agent, PAYABLE_AGENT],
] as const)("a %s that becomes incomplete", (kind, model, complete) => {
  const lookup = () =>
    (model.findFirst.mock.calls[0]?.[0] as { where: Record<string, unknown> })
      .where;

  it("can still be reported", async () => {
    expect(await fileReport(resource(kind), { reason: "SPAM" })).toEqual({
      ok: true,
    });

    expect(tx.report.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ reporterId: "buyer", reason: "SPAM" }),
    });
    for (const field of Object.keys(complete)) {
      expect(lookup()).not.toHaveProperty(field);
    }
  });

  it("can still be reviewed", async () => {
    expect(await submitReview(resource(kind), { rating: 1 })).toEqual({
      ok: true,
    });

    expect(prisma.review.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          authorId: "buyer",
          rating: 1,
          verifiedPurchase: true,
        }),
      }),
    );
    for (const field of Object.keys(complete)) {
      expect(lookup()).not.toHaveProperty(field);
    }
  });

  it("still cannot be reviewed once it is private", async () => {
    model.findFirst.mockResolvedValue(null);

    expect(await submitReview(resource(kind), { rating: 1 })).toEqual({
      ok: false,
      error: "not_found",
    });
    expect(lookup()).toMatchObject({
      visibility: { in: ["PUBLIC", "UNLISTED"] },
    });
    expect(prisma.review.upsert).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const { prisma } = vi.hoisted(() => ({
  prisma: {
    apiListing: { findFirst: vi.fn() },
    agent: { findFirst: vi.fn() },
  },
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), updateTag: vi.fn() }));
vi.mock("@/services/db", () => ({ prisma }));
vi.mock("@/services/trust", () => ({
  hasSettledPayment: vi.fn(),
  targetOf: vi.fn(),
}));
vi.mock("@/services/viewer", () => ({
  getViewer: vi.fn().mockResolvedValue({ id: "viewer" }),
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

beforeEach(() => {
  prisma.apiListing.findFirst.mockReset().mockResolvedValue(null);
  prisma.agent.findFirst.mockReset().mockResolvedValue(null);
});

describe.each([
  ["listing", prisma.apiListing, PAYABLE_LISTING],
  ["agent", prisma.agent, PAYABLE_AGENT],
] as const)("a %s that becomes incomplete", (kind, model, complete) => {
  it.each([
    ["reported", () => fileReport(resource(kind), { reason: "SPAM" })],
    ["reviewed", () => submitReview(resource(kind), { rating: 1 })],
  ])("can still be %s", async (_, call) => {
    await call();

    const { where } = model.findFirst.mock.calls[0]?.[0] as {
      where: Record<string, unknown>;
    };

    expect(where).toMatchObject({
      visibility: { in: ["PUBLIC", "UNLISTED"] },
    });
    for (const field of Object.keys(complete)) {
      expect(where).not.toHaveProperty(field);
    }
  });
});

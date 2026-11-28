import { beforeEach, describe, expect, it, vi } from "vitest";

const { allowWrite, getViewer, findFirst, upsert, hasSettledPayment } =
  vi.hoisted(() => ({
    allowWrite: vi.fn(),
    getViewer: vi.fn(),
    findFirst: vi.fn(),
    upsert: vi.fn(),
    hasSettledPayment: vi.fn(),
  }));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), updateTag: vi.fn() }));
vi.mock("@/services/db", () => ({
  prisma: { apiListing: { findFirst }, review: { upsert } },
}));
vi.mock("@/services/trust", () => ({
  hasSettledPayment,
  targetOf: (_kind: string, id: string) => ({ listingId: id }),
}));
vi.mock("@/services/viewer", () => ({ getViewer }));
vi.mock("@/services/writeLimit", () => ({ allowWrite }));

const { fileReport, submitReview } = await import("./trust");

const ORG_ID = "019fce62-0000-7000-8000-00000000000b";
const OTHER_ORG_ID = "019fce62-0000-7000-8000-00000000000c";

const resource = {
  kind: "listing" as const,
  id: "019fce62-0000-7000-8000-000000000000",
  username: "difference-labs",
  ref: "weather",
};

const viewerIn = (...organizationIds: string[]) => ({
  id: "019fce62-0000-7000-8000-000000000002",
  username: "grace",
  name: "Grace",
  avatarUrl: null,
  organizationIds,
});

describe("trust actions on an organization's resource", () => {
  beforeEach(() => {
    allowWrite.mockResolvedValue(true);
    findFirst.mockReset();
    upsert.mockReset();
    hasSettledPayment.mockReset();
    hasSettledPayment.mockResolvedValue(false);
    findFirst.mockResolvedValue({
      organizationId: ORG_ID,
      slug: "weather",
      organization: { handle: "difference-labs" },
    });
  });

  it("refuses a review or report from a member of the owning organization", async () => {
    getViewer.mockResolvedValue(viewerIn(OTHER_ORG_ID, ORG_ID));

    expect(await submitReview(resource, { rating: 5 })).toEqual({
      ok: false,
      error: "own_resource",
    });
    expect(await fileReport(resource, { reason: "SPAM" })).toEqual({
      ok: false,
      error: "own_resource",
    });
    expect(upsert).not.toHaveBeenCalled();
  });

  it("accepts a review from someone outside the organization", async () => {
    const viewer = viewerIn(OTHER_ORG_ID);
    getViewer.mockResolvedValue(viewer);

    expect(await submitReview(resource, { rating: 5 })).toEqual({ ok: true });
    expect(hasSettledPayment).toHaveBeenCalledWith("listing", resource.id, [
      OTHER_ORG_ID,
    ]);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ authorId: viewer.id }),
      }),
    );
  });
});

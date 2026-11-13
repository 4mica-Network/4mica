import { beforeEach, describe, expect, it, vi } from "vitest";

const { allowWrite, getViewer } = vi.hoisted(() => ({
  allowWrite: vi.fn(),
  getViewer: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), updateTag: vi.fn() }));
vi.mock("@/services/db", () => ({ prisma: {} }));
vi.mock("@/services/trust", () => ({
  hasSettledPayment: vi.fn(),
  targetOf: vi.fn(),
}));
vi.mock("@/services/viewer", () => ({ getViewer }));
vi.mock("@/services/writeLimit", () => ({ allowWrite }));

const { deleteOwnReview, fileReport, submitReview } = await import("./trust");
const { revalidateProfile } = await import("./revalidate");

const resource = {
  kind: "listing" as const,
  id: "019fce62-0000-7000-8000-000000000000",
  username: "ada",
  ref: "weather",
};

describe("server actions under the write limit", () => {
  beforeEach(() => {
    allowWrite.mockReset();
    getViewer.mockReset();
    allowWrite.mockResolvedValue(false);
  });

  it.each([
    ["submitReview", () => submitReview(resource, { rating: 5 })],
    ["deleteOwnReview", () => deleteOwnReview(resource)],
    ["fileReport", () => fileReport(resource, { reason: "SPAM" })],
    ["revalidateProfile", () => revalidateProfile("ada")],
  ])("%s refuses before resolving the viewer", async (name, call) => {
    expect(await call()).toEqual({ ok: false, error: "rate_limited" });
    expect(allowWrite).toHaveBeenCalledWith(name);
    expect(getViewer).not.toHaveBeenCalled();
  });

  it("proceeds to the auth check while under budget", async () => {
    allowWrite.mockResolvedValue(true);
    getViewer.mockResolvedValue(null);

    expect(await submitReview(resource, { rating: 5 })).toEqual({
      ok: false,
      error: "unauthorized",
    });
  });
});

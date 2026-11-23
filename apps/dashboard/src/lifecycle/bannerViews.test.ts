import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  getBanners: vi.fn(async () => []),
  recordBannerInteraction: vi.fn(async () => undefined),
}));

vi.mock("@api/banner", () => api);

const { store } = await import("@stores/index");
const { recordBannerInteraction } = await import("@stores/banner/actions");
const { resetSession } = await import("@stores/session");

describe("banner views", () => {
  beforeEach(() => {
    store.dispatch(resetSession());
    api.recordBannerInteraction.mockClear();
  });

  it("reports a banner as viewed once however often it remounts", () => {
    store.dispatch(recordBannerInteraction("ban_1", "VIEWED"));
    store.dispatch(recordBannerInteraction("ban_1", "VIEWED"));
    store.dispatch(recordBannerInteraction("ban_1", "VIEWED"));

    expect(api.recordBannerInteraction).toHaveBeenCalledTimes(1);
  });

  it("still reports every click", () => {
    store.dispatch(recordBannerInteraction("ban_1", "CLICKED"));
    store.dispatch(recordBannerInteraction("ban_1", "CLICKED"));

    expect(api.recordBannerInteraction).toHaveBeenCalledTimes(2);
  });

  it("reports views again in a new session", () => {
    store.dispatch(recordBannerInteraction("ban_1", "VIEWED"));
    store.dispatch(resetSession());
    store.dispatch(recordBannerInteraction("ban_1", "VIEWED"));

    expect(api.recordBannerInteraction).toHaveBeenCalledTimes(2);
  });
});

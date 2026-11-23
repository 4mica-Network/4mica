import { describe, expect, it } from "vitest";
import { createRateLimiter } from "./rateLimit";

describe("createRateLimiter", () => {
  it("allows up to the limit within a window, then refuses", () => {
    const limiter = createRateLimiter({ limit: 3, windowMs: 1000 });

    expect([0, 1, 2, 3].map(() => limiter.take("a", 0))).toEqual([
      true,
      true,
      true,
      false,
    ]);
  });

  it("starts a fresh window once the old one has expired", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 1000 });

    expect(limiter.take("a", 0)).toBe(true);
    expect(limiter.take("a", 999)).toBe(false);
    expect(limiter.take("a", 1000)).toBe(true);
  });

  it("keeps a separate budget per key", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 1000 });

    expect(limiter.take("a", 0)).toBe(true);
    expect(limiter.take("b", 0)).toBe(true);
    expect(limiter.take("a", 0)).toBe(false);
  });

  it("never tracks more than maxKeys, evicting expired then oldest", () => {
    const limiter = createRateLimiter({
      limit: 1,
      windowMs: 1000,
      maxKeys: 2,
    });

    limiter.take("a", 0);
    limiter.take("b", 500);
    limiter.take("c", 1200);

    expect(limiter.take("b", 1200)).toBe(false);
    expect(limiter.take("a", 1200)).toBe(true);
  });
});

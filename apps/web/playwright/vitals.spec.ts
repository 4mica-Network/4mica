import { expect, test } from "./fixtures";
import { scrollThrough } from "./scroll";

const CLS_BUDGET = 0.1;

test.describe("core web vitals on the home page", () => {
  test.skip(
    ({ browserName }) => browserName !== "chromium",
    "Layout shift and LCP entries are only exposed by Chromium.",
  );

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      const vitals = { cls: 0, lcpInHero: false, lcpSeen: false };
      Object.assign(window, { __vitals: vitals });

      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const shift = entry as PerformanceEntry & {
            value: number;
            hadRecentInput: boolean;
          };
          if (!shift.hadRecentInput) {
            vitals.cls += shift.value;
          }
        }
      }).observe({ type: "layout-shift", buffered: true });

      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const element = (entry as PerformanceEntry & { element?: Element })
            .element;
          vitals.lcpSeen = true;
          vitals.lcpInHero = Boolean(element?.closest(".hero-rise"));
        }
      }).observe({ type: "largest-contentful-paint", buffered: true });
    });
  });

  const readVitals = (page: import("@playwright/test").Page) =>
    page.evaluate(
      () =>
        (
          window as unknown as {
            __vitals: { cls: number; lcpInHero: boolean; lcpSeen: boolean };
          }
        ).__vitals,
    );

  test("the hero text is the largest contentful paint", async ({ page }) => {
    await page.goto("/");
    await expect.poll(async () => (await readVitals(page)).lcpSeen).toBe(true);

    expect((await readVitals(page)).lcpInHero).toBe(true);
  });

  test("scrolling the page stays within the layout shift budget", async ({
    page,
  }) => {
    await page.goto("/");
    await scrollThrough(page);
    await page.waitForLoadState("networkidle");

    expect((await readVitals(page)).cls).toBeLessThan(CLS_BUDGET);
  });
});

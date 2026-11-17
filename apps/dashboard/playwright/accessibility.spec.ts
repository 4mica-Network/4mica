import { axeViolations, forceTheme } from "./axe";
import { expect, test } from "./fixtures";
import { APP_PAGES, SETTINGS_PAGES } from "./pages";

for (const theme of ["dark", "light"] as const) {
  test.describe(`${theme} theme`, () => {
    test.beforeEach(async ({ page }) => {
      await forceTheme(page, theme);
    });

    for (const entry of [...APP_PAGES, ...SETTINGS_PAGES]) {
      test(`${entry.path} has no WCAG 2.2 AA violations`, async ({ page }) => {
        await page.goto(entry.path);
        await expect(
          page.getByRole("heading", { level: 1, name: entry.heading }),
        ).toBeVisible();
        await page.waitForLoadState("networkidle");

        expect(await axeViolations(page)).toEqual([]);
      });
    }
  });
}

test("the skip link moves focus into the main content", async ({ page }) => {
  await page.goto("/payments");
  await expect(
    page.getByRole("heading", { level: 1, name: "Payments" }),
  ).toBeVisible();

  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to content" });
  await expect(skip).toBeFocused();
  await expect(skip).toBeInViewport();

  await page.keyboard.press("Enter");
  await expect(page.getByRole("main")).toBeFocused();
});

test("stays usable at 200% zoom", async ({ page }) => {
  await page.setViewportSize({ width: 640, height: 450 });
  await page.goto("/payments");

  await expect(
    page.getByRole("heading", { level: 1, name: "Payments" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

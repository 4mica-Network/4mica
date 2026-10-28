import { expect, test } from "./fixtures";
import { LEAKED_TEXT, SITE_PATHS } from "./pages";
import { scrollThrough } from "./scroll";

test("the sitemap lists pages", () => {
  expect(SITE_PATHS.length).toBeGreaterThan(0);
  expect(SITE_PATHS).toContain("/");
});

for (const route of SITE_PATHS) {
  test(`renders ${route}`, async ({ page }) => {
    const response = await page.goto(route);

    expect(response?.status()).toBe(200);
    await expect(page).toHaveTitle(/4Mica/);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute(
      "content",
      /.{20,}/,
    );
    await expect(page.locator('link[rel="canonical"]')).toHaveCount(1);

    const headings = page.getByRole("heading", { level: 1 });
    await expect(headings.first()).toBeVisible();
    await expect(headings.first()).not.toHaveText(/^\s*$/);

    await expect(page.locator("header").first()).toBeVisible();
    await expect(page.getByRole("main")).toBeVisible();
    await expect(page.locator("footer").first()).toBeVisible();
    await expect(page.getByRole("navigation").first()).toBeVisible();

    await page.evaluate(() => {
      for (const image of document.images) {
        image.loading = "eager";
      }
    });
    await scrollThrough(page);

    await expect(page.locator("body")).not.toHaveText(LEAKED_TEXT);

    await expect
      .poll(
        () =>
          page.evaluate(() =>
            [...document.images]
              .filter((image) => image.getBoundingClientRect().width > 0)
              .filter((image) => !(image.complete && image.naturalWidth > 0))
              .map((image) => image.currentSrc || image.src),
          ),
        { message: "every visible image decodes" },
      )
      .toEqual([]);

    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(
      overflow.scrollWidth,
      "page must not scroll horizontally",
    ).toBeLessThanOrEqual(overflow.clientWidth);
  });
}

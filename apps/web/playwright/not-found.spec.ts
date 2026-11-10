import { expect, test, WEBKIT_MEDIA_CONTROLS } from "./fixtures";

test.use({
  allowedConsoleErrors: new RegExp(`${WEBKIT_MEDIA_CONTROLS}|status of 404`),
});

for (const route of ["/this-page-does-not-exist", "/blog/no-such-post"]) {
  test(`${route} gets the 404 page`, async ({ page }) => {
    const response = await page.goto(route);

    expect(response?.status()).toBe(404);
    await expect(
      page.getByRole("heading", { level: 1, name: "404" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", {
        level: 2,
        name: "This page has not been generated",
      }),
    ).toBeVisible();
  });
}

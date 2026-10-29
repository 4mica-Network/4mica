import { expect, test } from "./fixtures";
import { loadStoryIndex } from "./index";

const baseURL = "http://localhost:6006";
const entries = await loadStoryIndex(baseURL);

test("the index lists stories", () => {
  expect(entries.length).toBeGreaterThan(0);
});

for (const entry of entries) {
  test(`${entry.type}: ${entry.title} / ${entry.name}`, async ({ page }) => {
    await page.goto(`/iframe.html?id=${entry.id}&viewMode=${entry.type}`);

    const body = page.locator("body");
    await expect(body).toHaveClass(/sb-show-main/);
    await expect(body).not.toHaveClass(/sb-show-errordisplay/);
    await expect(body).not.toHaveClass(/sb-show-nopreview/);

    const root = page.locator(
      entry.type === "docs" ? "#storybook-docs" : "#storybook-root",
    );
    await expect(root.locator(":scope > *")).not.toHaveCount(0);
  });
}

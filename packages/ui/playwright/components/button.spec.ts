import { expect, test } from "../fixtures";
import { openStory } from "../story";

const STORY = "components-button";

test("renders an enabled button that does not submit forms", async ({
  page,
}) => {
  await openStory(page, `${STORY}--primary`);
  const button = page.getByRole("button", { name: "Click me" });

  await expect(button).toBeEnabled();
  await expect(button).toHaveAttribute("type", "button");
  await expect(button).toHaveClass(/btn-primary/);
});

test("can be disabled", async ({ page }) => {
  await openStory(page, `${STORY}--disabled`);

  await expect(page.getByRole("button", { name: "Click me" })).toBeDisabled();
});

test("blocks interaction and hides its label while loading", async ({
  page,
}) => {
  await openStory(page, `${STORY}--loading`);
  const button = page.getByRole("button");

  await expect(button).toBeDisabled();
  await expect(button).toHaveAttribute("aria-busy", "true");
  await expect(button.getByText("Save changes")).toBeHidden();
  await expect(button.locator("svg")).toBeVisible();
});

test("places the icon before or after the label", async ({ page }) => {
  await openStory(page, `${STORY}--with-leading-icon`);
  const leading = page.getByRole("button", { name: "New" });

  await expect(
    leading.locator(":scope > *").first().locator("svg"),
  ).toHaveCount(1);

  await openStory(page, `${STORY}--with-trailing-icon`);
  const trailing = page.getByRole("button", { name: "Continue" });

  await expect(
    trailing.locator(":scope > *").last().locator("svg"),
  ).toHaveCount(1);
});

test("renders its child as the element when asChild is set", async ({
  page,
}) => {
  await openStory(page, `${STORY}--as-link`);
  const link = page.getByRole("link", { name: "Go to site" });

  await expect(link).toHaveAttribute("href", "https://4mica.io");
  await expect(link).toHaveClass(/btn-primary/);
  await expect(page.getByRole("button")).toHaveCount(0);
});

test("stretches to its container when block is set", async ({ page }) => {
  await openStory(page, `${STORY}--block`);
  const button = page.getByRole("button", { name: "Continue" });

  await expect(button).toHaveClass(/w-full/);
  expect((await button.boundingBox())?.width).toBe(320);
});

test("grows through each size step", async ({ page }) => {
  await openStory(page, `${STORY}--sizes`);
  const buttons = page.getByRole("button");

  await expect(buttons).toHaveText(["Small", "Medium", "Large"]);

  const heights = await buttons.evaluateAll((nodes) =>
    nodes.map((node) => node.getBoundingClientRect().height),
  );

  expect(heights[0]).toBeLessThan(heights[1]);
  expect(heights[1]).toBeLessThan(heights[2]);
});

test("is reachable and activatable from the keyboard", async ({ page }) => {
  await openStory(page, `${STORY}--primary`);
  const button = page.getByRole("button", { name: "Click me" });
  await expect(button).toBeVisible();

  await page.keyboard.press("Tab");

  await expect(button).toBeFocused();
});

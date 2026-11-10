import { expect, test } from "../fixtures";
import { openStory } from "../story";

const STORY = "components-spinner";

test("announces itself as a status with the default label", async ({
  page,
}) => {
  await openStory(page, `${STORY}--default`);
  const spinner = page.getByRole("status");

  await expect(spinner).toHaveAttribute("aria-label", "Loading...");
  await expect(spinner.locator("svg title")).toHaveText("Loading...");
});

test("uses the title prop for both the label and the svg title", async ({
  page,
}) => {
  await openStory(page, `${STORY}--custom-title`);
  const spinner = page.getByRole("status", { name: "Fetching credit line" });

  await expect(spinner).toBeVisible();
  await expect(spinner.locator("svg title")).toHaveText("Fetching credit line");
});

test("scales the icon with the size prop", async ({ page }) => {
  await openStory(page, `${STORY}--sizes`);
  const icons = page.getByTestId("spinner-icon");

  await expect(icons).toHaveCount(4);

  const widths = await icons.evaluateAll((nodes) =>
    nodes.map((node) => getComputedStyle(node).width),
  );

  expect(widths).toEqual(["16px", "20px", "24px", "32px"]);
});

test("overrides the size through args", async ({ page }) => {
  await openStory(page, `${STORY}--default`, { size: "xl" });

  const icon = page.getByTestId("spinner-icon");

  await expect(icon).toHaveCSS("width", "32px");
  await expect(icon).toHaveCSS("height", "32px");
});

test("inherits the text colour of its parent", async ({ page }) => {
  await openStory(page, `${STORY}--on-brand-color`);
  const icon = page.getByTestId("spinner-icon");
  const parentColor = await page
    .locator(".text-brand")
    .evaluate((node) => getComputedStyle(node).color);

  await expect(icon).toHaveCSS("color", parentColor);
});

test("keeps spinning inside a disabled button", async ({ page }) => {
  await openStory(page, `${STORY}--inside-button`);
  const button = page.getByRole("button", { name: /Processing/ });

  await expect(button).toBeDisabled();
  await expect(button.getByRole("status")).toBeVisible();
  await expect(button.getByTestId("spinner-icon")).toHaveClass(/animate-spin/);
});

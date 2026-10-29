import { expect, test } from "../fixtures";
import { openStory } from "../story";

const STORY = "components-autostackheight";

test("reserves room for every offset below the tallest card", async ({
  page,
}) => {
  await openStory(page, `${STORY}--default`);
  const container = page.getByTestId("auto-stack");
  const cardHeight = await page
    .getByTestId("auto-stack-card-0")
    .evaluate((node) => (node instanceof HTMLElement ? node.offsetHeight : 0));

  await expect(container).toHaveCSS("visibility", "visible");
  await expect(container).toHaveCSS("height", `${cardHeight + 4 * 8}px`);
  await expect(container).toHaveCSS("width", "220px");
  await expect(page.locator('[data-testid^="auto-stack-card-"]')).toHaveCount(
    5,
  );
});

test("collapses to the card height for a single item", async ({ page }) => {
  await openStory(page, `${STORY}--single-item`);
  const cardHeight = await page
    .getByTestId("auto-stack-card-0")
    .evaluate((node) => (node instanceof HTMLElement ? node.offsetHeight : 0));

  await expect(page.getByTestId("auto-stack")).toHaveCSS(
    "height",
    `${cardHeight}px`,
  );
});

test("renders nothing for an empty list", async ({ page }) => {
  await openStory(page, `${STORY}--empty-list`);

  await expect(page.getByTestId("auto-stack")).toHaveCount(0);
  await expect(page.getByTestId("stack")).toHaveCount(0);
});

test("grows when a card's content gets taller", async ({ page }) => {
  await openStory(page, `${STORY}--resizing-content`);
  const container = page.getByTestId("auto-stack");
  const before = await container.boundingBox();

  await page.getByRole("button", { name: "Toggle card length" }).click();

  await expect
    .poll(async () => (await container.boundingBox())?.height ?? 0)
    .toBeGreaterThan(before?.height ?? 0);

  await page.getByRole("button", { name: "Toggle card length" }).click();

  await expect
    .poll(async () => (await container.boundingBox())?.height ?? 0)
    .toBe(before?.height ?? 0);
});

test("accepts a numeric width", async ({ page }) => {
  await openStory(page, `${STORY}--custom-width`);

  await expect(page.getByTestId("auto-stack")).toHaveCSS("width", "320px");
});

test("pads the top when growing upwards", async ({ page }) => {
  await openStory(page, `${STORY}--growth-up`);

  await expect(page.getByTestId("auto-stack")).toHaveCSS("padding-top", "32px");
  await expect(page.getByTestId("stack")).toHaveAttribute("data-growth", "up");
});

test("prefixes every test id with the one it is given", async ({ page }) => {
  await openStory(page, `${STORY}--test-ids`);

  await expect(page.getByTestId("promo-auto-stack")).toBeVisible();
  await expect(page.getByTestId("promo-stack")).toBeAttached();
  await expect(page.getByTestId("promo-auto-stack-card-0")).toBeVisible();
  await expect(page.getByTestId("promo-stack-item-4")).toBeAttached();
});

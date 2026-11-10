import { expect, test } from "../fixtures";
import { openStory } from "../story";

const STORY = "components-stack";

const transformOf = async (
  page: import("@playwright/test").Page,
  index: number,
) =>
  page
    .getByTestId(`stack-item-${index}`)
    .evaluate((node) => node.style.transform);

test("layers children with the last one on top by default", async ({
  page,
}) => {
  await openStory(page, `${STORY}--default`);
  const stack = page.getByTestId("stack");

  await expect(stack).toHaveAttribute("data-direction", "top");
  await expect(stack).toHaveAttribute("data-growth", "down");
  await expect(page.getByTestId("stack-item-0")).toHaveText("Card 3");
  await expect(page.getByTestId("stack-item-2")).toHaveText("Card 1");
  await expect(page.getByTestId("stack-item-0")).toHaveCSS("z-index", "3");
  await expect(page.getByTestId("stack-item-2")).toHaveCSS("z-index", "1");
});

test("offsets and shrinks each deeper item", async ({ page }) => {
  await openStory(page, `${STORY}--default`);

  expect(await transformOf(page, 0)).toBe("translateY(0px) scale(1)");
  expect(await transformOf(page, 1)).toBe("translateY(8px) scale(0.98)");
  expect(await transformOf(page, 2)).toBe("translateY(16px) scale(0.96)");
});

test("keeps source order when direction is bottom", async ({ page }) => {
  await openStory(page, `${STORY}--direction-bottom`);

  await expect(page.getByTestId("stack")).toHaveAttribute(
    "data-direction",
    "bottom",
  );
  await expect(page.getByTestId("stack-item-0")).toHaveText("Card 1");
  await expect(page.getByTestId("stack-item-2")).toHaveText("Card 3");
});

test("grows upwards with negative offsets", async ({ page }) => {
  await openStory(page, `${STORY}--growth-up`);

  await expect(page.getByTestId("stack")).toHaveAttribute("data-growth", "up");
  expect(await transformOf(page, 1)).toBe("translateY(-8px) scale(0.98)");
  expect(await transformOf(page, 2)).toBe("translateY(-16px) scale(0.96)");
});

test("honours a custom offset", async ({ page }) => {
  await openStory(page, `${STORY}--custom-offset`);

  expect(await transformOf(page, 1)).toBe("translateY(16px) scale(0.98)");
  expect(await transformOf(page, 2)).toBe("translateY(32px) scale(0.96)");
});

test("never scales below minScale", async ({ page }) => {
  await openStory(page, `${STORY}--min-scale-clamp`);

  await expect(page.getByTestId("stack-item-39")).toBeAttached();
  expect(await transformOf(page, 39)).toBe("translateY(312px) scale(0.8)");
  expect(await transformOf(page, 10)).toBe("translateY(80px) scale(0.8)");
});

test("renders a single child without any offset", async ({ page }) => {
  await openStory(page, `${STORY}--single-child`);

  await expect(page.locator('[data-testid^="stack-item-"]')).toHaveCount(1);
  expect(await transformOf(page, 0)).toBe("translateY(0px) scale(1)");
});

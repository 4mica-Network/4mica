import { expect, test } from "../fixtures";
import { openStory } from "../story";

const STORY = "components-stars";

const filledStars = (page: import("@playwright/test").Page) =>
  page.getByRole("img").locator("svg.fill-warning");

test("rounds the value to whole filled stars", async ({ page }) => {
  await openStory(page, `${STORY}--default`);
  const stars = page.getByRole("img", { name: "3.6 out of 5" });

  await expect(stars).toBeVisible();
  await expect(stars.locator("svg")).toHaveCount(5);
  await expect(filledStars(page)).toHaveCount(4);
});

test("rounds half values up", async ({ page }) => {
  await openStory(page, `${STORY}--default`, { value: 2.5 });

  await expect(page.getByRole("img", { name: "2.5 out of 5" })).toBeVisible();
  await expect(filledStars(page)).toHaveCount(3);
});

test("rounds values below a half down", async ({ page }) => {
  await openStory(page, `${STORY}--default`, { value: 2.4 });

  await expect(page.getByRole("img", { name: "2.4 out of 5" })).toBeVisible();
  await expect(filledStars(page)).toHaveCount(2);
});

test("fills nothing at zero and everything at the maximum", async ({
  page,
}) => {
  await openStory(page, `${STORY}--default`, { value: 0 });
  await expect(filledStars(page)).toHaveCount(0);

  await openStory(page, `${STORY}--default`, { value: 5 });
  await expect(filledStars(page)).toHaveCount(5);
});

test("renders as many stars as max", async ({ page }) => {
  await openStory(page, `${STORY}--default`, { max: 10, value: 7 });
  const stars = page.getByRole("img", { name: "7.0 out of 10" });

  await expect(stars.locator("svg")).toHaveCount(10);
  await expect(filledStars(page)).toHaveCount(7);
});

test("prefers an explicit label", async ({ page }) => {
  await openStory(page, `${STORY}--default`, { label: "Rated by buyers" });

  await expect(
    page.getByRole("img", { name: "Rated by buyers" }),
  ).toBeVisible();
});

test("hides the individual stars from assistive tech", async ({ page }) => {
  await openStory(page, `${STORY}--default`);

  await expect(
    page.getByRole("img").locator('svg[aria-hidden="true"]'),
  ).toHaveCount(5);
});

test("draws bigger stars at the medium size", async ({ page }) => {
  await openStory(page, `${STORY}--medium`);
  const star = page
    .getByRole("img", { name: "4.2 out of 5" })
    .locator("svg")
    .first();

  const box = await star.boundingBox();
  expect(box?.width).toBe(16);
  await expect(filledStars(page)).toHaveCount(4);
});

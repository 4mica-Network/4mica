import { expect, test } from "../fixtures";
import { openStory } from "../story";

const STORY = "components-pagination";

const prev = (page: Parameters<typeof openStory>[0]) =>
  page.getByRole("button", { name: "Previous page" });
const next = (page: Parameters<typeof openStory>[0]) =>
  page.getByRole("button", { name: "Next page" });

test("disables previous on the first page", async ({ page }) => {
  await openStory(page, `${STORY}--first-page`);

  await expect(page.getByTestId("pagination-range")).toHaveText("1-20 of 43");
  await expect(prev(page)).toBeDisabled();
  await expect(next(page)).toBeEnabled();
});

test("disables next on the last page", async ({ page }) => {
  await openStory(page, `${STORY}--last-page`);

  await expect(page.getByTestId("pagination-range")).toHaveText("41-43 of 43");
  await expect(prev(page)).toBeEnabled();
  await expect(next(page)).toBeDisabled();
});

test("disables both controls when there is nothing to page", async ({
  page,
}) => {
  await openStory(page, `${STORY}--empty`);
  await expect(page.getByTestId("pagination-range")).toHaveText("0-0 of 0");
  await expect(prev(page)).toBeDisabled();
  await expect(next(page)).toBeDisabled();

  await openStory(page, `${STORY}--single-page`);
  await expect(page.getByTestId("pagination-range")).toHaveText("1-7 of 7");
  await expect(prev(page)).toBeDisabled();
  await expect(next(page)).toBeDisabled();
});

test("walks forward and back through the pages", async ({ page }) => {
  await openStory(page, `${STORY}--interactive`);
  const range = page.getByTestId("pagination-range");

  await next(page).click();
  await expect(range).toHaveText("21-40 of 43");
  await expect(prev(page)).toBeEnabled();

  await next(page).click();
  await expect(range).toHaveText("41-43 of 43");
  await expect(next(page)).toBeDisabled();

  await prev(page).click();
  await expect(range).toHaveText("21-40 of 43");

  await prev(page).click();
  await expect(range).toHaveText("1-20 of 43");
  await expect(prev(page)).toBeDisabled();
});

test("moves pages from the keyboard", async ({ page }) => {
  await openStory(page, `${STORY}--interactive`);

  await next(page).focus();
  await page.keyboard.press("Enter");

  await expect(page.getByTestId("pagination-range")).toHaveText("21-40 of 43");
});

test("recomputes the range from args", async ({ page }) => {
  await openStory(page, `${STORY}--default`, {
    page: 2,
    perPage: 10,
    total: 25,
  });

  await expect(page.getByTestId("pagination-range")).toHaveText("11-20 of 25");
  await expect(prev(page)).toBeEnabled();
  await expect(next(page)).toBeEnabled();
});

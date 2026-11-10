import { expect, test } from "../fixtures";
import { openStory } from "../story";

const STORY = "components-tag";

const VARIANTS = [
  ["default", "Active"],
  ["neutral", "Draft"],
  ["success", "Settled"],
  ["warning", "Pending review"],
  ["error", "Declined"],
] as const;

for (const [variant, label] of VARIANTS) {
  test(`renders the ${variant} variant`, async ({ page }) => {
    const story = variant === "error" ? "error-variant" : variant;
    await openStory(page, `${STORY}--${story}`);
    const tag = page.getByTestId("tag");

    await expect(tag).toHaveText(label);
    await expect(tag).toHaveAttribute("data-variant", variant);
    await expect(tag).toHaveAttribute("data-has-close", "false");
    await expect(tag.getByRole("button")).toHaveCount(0);
  });
}

test("shows a remove button only with both hasClose and onClose", async ({
  page,
}) => {
  await openStory(page, `${STORY}--closable`);
  const tag = page.getByTestId("tag");

  await expect(tag).toHaveAttribute("data-has-close", "true");
  await expect(tag.getByRole("button", { name: "Remove" })).toBeVisible();
  await expect(page.getByTestId("tag-close")).toBeEnabled();

  await openStory(page, `${STORY}--default`, { hasClose: true });

  await expect(page.getByTestId("tag")).toHaveAttribute(
    "data-has-close",
    "true",
  );
  await expect(page.getByRole("button", { name: "Remove" })).toBeVisible();
});

test("keeps the remove button clickable", async ({ page }) => {
  await openStory(page, `${STORY}--closable`);
  const remove = page.getByRole("button", { name: "Remove" });

  await remove.click();

  await expect(remove).toBeVisible();
  await expect(page.getByTestId("tag")).toHaveText("usd-credit-line");
});

test("tints a custom colour at ten percent for the background", async ({
  page,
}) => {
  await openStory(page, `${STORY}--custom-color`);
  const tag = page.getByTestId("tag");

  await expect(tag).toHaveCSS("color", "rgb(123, 203, 255)");
  await expect(tag).toHaveCSS("background-color", "rgba(123, 203, 255, 0.1)");
  await expect(tag.locator("svg")).toHaveCount(1);
});

test("renders the icon before the label", async ({ page }) => {
  await openStory(page, `${STORY}--with-icon`);
  const tag = page.getByTestId("tag");
  const icon = await tag.locator("svg").boundingBox();
  const label = await tag.getByText("Live").boundingBox();

  expect(icon?.x).toBeLessThan(label?.x ?? 0);
});

test("truncates a label that overflows its container", async ({ page }) => {
  await openStory(page, `${STORY}--truncated`);
  const label = page
    .getByTestId("tag")
    .getByText("a-very-long-tag-label-that-overflows");

  await expect(label).toHaveCSS("text-overflow", "ellipsis");
  const overflow = await label.evaluate(
    (node) => node.scrollWidth > node.clientWidth,
  );
  expect(overflow).toBe(true);
});

test("grows with the size prop", async ({ page }) => {
  await openStory(page, `${STORY}--sizes`);
  const tags = page.getByTestId("tag");

  await expect(tags).toHaveCount(3);
  await expect(tags.nth(0)).toHaveAttribute("data-size", "sm");
  await expect(tags.nth(2)).toHaveAttribute("data-size", "lg");

  const heights = await Promise.all(
    (await tags.all()).map(
      async (tag) => (await tag.boundingBox())?.height ?? 0,
    ),
  );

  expect(heights[0]).toBeLessThan(heights[1]);
  expect(heights[1]).toBeLessThan(heights[2]);
});

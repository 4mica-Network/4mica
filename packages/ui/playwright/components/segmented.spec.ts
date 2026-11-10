import { expect, test } from "../fixtures";
import { openStory } from "../story";

const STORY = "components-segmented";

test("exposes the group by its label", async ({ page }) => {
  await openStory(page, `${STORY}--default`);

  const group = page.getByRole("group", { name: "Range" });
  await expect(group).toBeVisible();
  await expect(group.getByRole("button")).toHaveText(["7D", "30D", "90D"]);
});

test("presses only the current value", async ({ page }) => {
  await openStory(page, `${STORY}--default`);

  await expect(page.getByRole("button", { name: "30D" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByRole("button", { pressed: true })).toHaveCount(1);
});

test("moves the selection on click", async ({ page }) => {
  await openStory(page, `${STORY}--default`);
  const seven = page.getByRole("button", { name: "7D" });
  const thirty = page.getByRole("button", { name: "30D" });

  await seven.click();

  await expect(seven).toHaveAttribute("aria-pressed", "true");
  await expect(thirty).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByRole("button", { pressed: true })).toHaveCount(1);
});

test("keeps the selection when the same segment is clicked", async ({
  page,
}) => {
  await openStory(page, `${STORY}--default`);
  const thirty = page.getByRole("button", { name: "30D" });

  await thirty.click();

  await expect(thirty).toHaveAttribute("aria-pressed", "true");
});

test("selects from the keyboard", async ({ page }) => {
  await openStory(page, `${STORY}--default`);
  const ninety = page.getByRole("button", { name: "90D" });

  await page.getByRole("button", { name: "7D" }).focus();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await expect(ninety).toBeFocused();
  await page.keyboard.press("Space");

  await expect(ninety).toHaveAttribute("aria-pressed", "true");
});

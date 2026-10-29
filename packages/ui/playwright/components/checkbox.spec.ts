import { expect, test } from "../fixtures";
import { openStory } from "../story";

const STORY = "components-checkbox";
const LABEL = "Auto-settle on delivery";

test("toggles on click and shows the check mark", async ({ page }) => {
  await openStory(page, `${STORY}--interactive`);
  const checkbox = page.getByRole("checkbox", { name: LABEL });

  await expect(checkbox).toHaveAttribute("aria-checked", "false");
  await expect(page.getByTestId("checkbox-icon")).toHaveCount(0);

  await checkbox.click();

  await expect(checkbox).toHaveAttribute("aria-checked", "true");
  await expect(page.getByTestId("checkbox-icon")).toBeVisible();

  await checkbox.click();

  await expect(checkbox).toHaveAttribute("aria-checked", "false");
  await expect(page.getByTestId("checkbox-icon")).toHaveCount(0);
});

test("toggles with the space key", async ({ page }) => {
  await openStory(page, `${STORY}--interactive`);
  const checkbox = page.getByRole("checkbox", { name: LABEL });

  await checkbox.focus();
  await page.keyboard.press("Space");

  await expect(checkbox).toHaveAttribute("aria-checked", "true");
});

test("is controlled: without an owner the state never changes", async ({
  page,
}) => {
  await openStory(page, `${STORY}--checked`);
  const checkbox = page.getByRole("checkbox", { name: LABEL });

  await expect(checkbox).toHaveAttribute("aria-checked", "true");
  await checkbox.click();

  await expect(checkbox).toHaveAttribute("aria-checked", "true");
});

test("cannot be toggled while disabled", async ({ page }) => {
  await openStory(page, `${STORY}--disabled`);
  const checkbox = page.getByRole("checkbox", { name: LABEL });

  await expect(checkbox).toBeDisabled();
  await checkbox.click({ force: true });

  await expect(checkbox).toHaveAttribute("aria-checked", "false");
});

test("renders without a label", async ({ page }) => {
  await openStory(page, `${STORY}--without-label`);

  await expect(page.getByRole("checkbox")).toBeVisible();
  await expect(page.getByTestId("checkbox-label")).toHaveCount(0);
});

test("uses a rounded or square box", async ({ page }) => {
  await openStory(page, `${STORY}--rounded`);
  await expect(page.getByTestId("checkbox-box")).toHaveClass(/rounded-full/);

  await openStory(page, `${STORY}--square`);
  await expect(page.getByTestId("checkbox-box")).toHaveClass(/rounded-md/);
});

test("exposes mixed states in a group", async ({ page }) => {
  await openStory(page, `${STORY}--all-variants`);
  const checkboxes = page.getByRole("checkbox");

  await expect(checkboxes).toHaveCount(6);
  await expect(
    page.getByRole("checkbox", { name: "Unchecked", exact: true }),
  ).toHaveCount(2);
  await expect(
    page.getByRole("checkbox", { name: "Disabled", exact: true }).first(),
  ).toBeDisabled();
  await expect(
    page.getByRole("checkbox", { name: "Checked", exact: true }).first(),
  ).toHaveAttribute("aria-checked", "true");
});

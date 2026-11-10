import { expect, test } from "../fixtures";
import { openStory } from "../story";

const STORY = "components-popupconfirm";

test("opens on the trigger and closes on cancel", async ({ page }) => {
  await openStory(page, `${STORY}--default`);
  const trigger = page.getByRole("button", { name: "Remove customer" });
  const dialog = page.getByRole("alertdialog");

  await expect(dialog).toHaveCount(0);
  await trigger.click();

  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAccessibleName("Remove this customer?");
  await expect(dialog).toHaveAccessibleDescription(
    "Their payments stay on your ledger.",
  );
  await expect(dialog).toHaveAttribute("aria-modal", "false");

  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toHaveCount(0);
});

test("closes on confirm", async ({ page }) => {
  await openStory(page, `${STORY}--default`);

  await page.getByRole("button", { name: "Remove customer" }).click();
  await page.getByRole("button", { name: "Remove", exact: true }).click();

  await expect(page.getByRole("alertdialog")).toHaveCount(0);
});

test("focuses the cancel button when opened", async ({ page }) => {
  await openStory(page, `${STORY}--default`);

  await page.getByRole("button", { name: "Remove customer" }).click();

  await expect(page.getByRole("button", { name: "Cancel" })).toBeFocused();
});

test("closes on Escape and returns focus to the trigger", async ({ page }) => {
  await openStory(page, `${STORY}--default`);
  const trigger = page.getByRole("button", { name: "Remove customer" });

  await trigger.click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page.keyboard.press("Escape");

  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("closes when clicking outside", async ({ page }) => {
  await openStory(page, `${STORY}--default`);

  await page.getByRole("button", { name: "Remove customer" }).click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page.mouse.click(5, 5);

  await expect(page.getByRole("alertdialog")).toHaveCount(0);
});

test("toggles closed when the trigger is clicked again", async ({ page }) => {
  await openStory(page, `${STORY}--default`);
  const trigger = page.getByRole("button", { name: "Remove customer" });

  await trigger.click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await trigger.click();

  await expect(page.getByRole("alertdialog")).toHaveCount(0);
});

test("stays open on outside click when configured", async ({ page }) => {
  await openStory(page, `${STORY}--stays-open-on-outside-click`);

  await page.getByRole("button", { name: "Remove customer" }).click();
  await page.mouse.click(5, 5);
  await expect(page.getByRole("alertdialog")).toBeVisible();

  await page.getByRole("button", { name: "Cancel" }).focus();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
});

test("omits the description when only a title is given", async ({ page }) => {
  await openStory(page, `${STORY}--title-only`);

  await page.getByRole("button", { name: "Remove customer" }).click();
  const dialog = page.getByRole("alertdialog");

  await expect(dialog).toHaveAccessibleName("Remove this customer?");
  await expect(dialog).not.toHaveAttribute("aria-describedby", /.+/);
  await expect(
    page.getByTestId("popup-confirm-confirm-popup-description"),
  ).toHaveCount(0);
});

test("can be driven from outside through ConfirmPopup", async ({ page }) => {
  await openStory(page, `${STORY}--controlled`);
  const toggle = page.getByRole("button", { name: "Toggle from outside" });

  await toggle.click();
  await expect(page.getByRole("alertdialog")).toBeVisible();

  await page.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);

  await toggle.click();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
});

import { expect, test } from "../fixtures";
import { openStory } from "../story";

const STORY = "components-modal";

test("opens as a labelled modal dialog and focuses its first control", async ({
  page,
}) => {
  await openStory(page, `${STORY}--interactive`);
  const dialog = page.getByRole("dialog");

  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "Open modal" }).click();

  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute("aria-modal", "true");
  await expect(dialog).toHaveAccessibleName("Connect a payout account");
  await expect(dialog).toHaveAccessibleDescription(
    "We use this to settle your agent's earnings.",
  );
  await expect(dialog.getByRole("button", { name: "Close" })).toBeFocused();
});

test("closes from the close button", async ({ page }) => {
  await openStory(page, `${STORY}--interactive`);

  await page.getByRole("button", { name: "Open modal" }).click();
  await page.getByRole("button", { name: "Close" }).click();

  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("closes on Escape and restores focus to the opener", async ({ page }) => {
  await openStory(page, `${STORY}--interactive`);
  const opener = page.getByRole("button", { name: "Open modal" });

  await opener.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");

  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(opener).toBeFocused();
});

test("closes when the overlay is clicked", async ({ page }) => {
  await openStory(page, `${STORY}--interactive`);

  await page.getByRole("button", { name: "Open modal" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByTestId("modal-overlay").click({ position: { x: 5, y: 5 } });

  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("locks body scroll while open and restores it on close", async ({
  page,
}) => {
  await openStory(page, `${STORY}--interactive`);
  const body = page.locator("body");

  await page.getByRole("button", { name: "Open modal" }).click();
  await expect(body).toHaveCSS("overflow", "hidden");

  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(body).not.toHaveCSS("overflow", "hidden");
});

test("traps Tab inside the panel", async ({ page }) => {
  await openStory(page, `${STORY}--with-footer`);
  const close = page.getByRole("button", { name: "Close" });
  const cancel = page.getByRole("button", { name: "Cancel" });
  const next = page.getByRole("button", { name: "Continue" });

  await expect(close).toBeFocused();

  await page.keyboard.press("Shift+Tab");
  await expect(next).toBeFocused();

  await page.keyboard.press("Tab");
  await expect(close).toBeFocused();

  await page.keyboard.press("Tab");
  await expect(cancel).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(next).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(close).toBeFocused();
});

test("a blocking modal ignores Escape and overlay clicks", async ({ page }) => {
  await openStory(page, `${STORY}--blocking-interactive`);
  const dialog = page.getByRole("dialog");

  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Close" })).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "Continue" })).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();

  await page.getByTestId("modal-overlay").click({ position: { x: 5, y: 5 } });
  await expect(dialog).toBeVisible();
});

test("scrolls long content inside the body only", async ({ page }) => {
  await openStory(page, `${STORY}--long-content`);
  const body = page.getByTestId("modal-body");

  await expect(page.getByTestId("modal-footer")).toBeInViewport();
  const overflow = await body.evaluate(
    (element) => element.scrollHeight > element.clientHeight,
  );
  expect(overflow).toBe(true);
});

test("sizes the panel from the size prop", async ({ page }) => {
  await openStory(page, `${STORY}--small`);
  await expect(page.getByTestId("modal-panel")).toHaveCSS("width", "400px");

  await openStory(page, `${STORY}--large`);
  await expect(page.getByTestId("modal-panel")).toHaveCSS("width", "640px");
});

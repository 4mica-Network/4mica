import { expect, test } from "../fixtures";
import { openStory } from "../story";

const STORY = "components-card";

test("renders static content in a plain container", async ({ page }) => {
  const root = await openStory(page, `${STORY}--default`);

  await expect(root.getByText("Acme Robotics")).toBeVisible();
  await expect(root.getByText("Credit line · $50,000")).toBeVisible();
  await expect(root.getByRole("button")).toHaveCount(0);
});

test("becomes a button when it has an onClick", async ({ page }) => {
  await openStory(page, `${STORY}--clickable`);
  const card = page.getByRole("button");

  await expect(card).toHaveAttribute("type", "button");
  await expect(card).toContainText("Acme Robotics");
  await expect(card).toHaveCSS("cursor", "pointer");
});

test("a clickable card is keyboard focusable", async ({ page }) => {
  await openStory(page, `${STORY}--clickable`);
  const card = page.getByRole("button");

  await card.focus();

  await expect(card).toBeFocused();
  expect(await card.evaluate((node) => node.tabIndex)).toBe(0);
});

test("a static card is not in the tab order", async ({ page }) => {
  const root = await openStory(page, `${STORY}--default`);
  const card = root.getByText("Acme Robotics").locator("..");

  expect(await card.evaluate((node) => node.tagName)).toBe("DIV");
  expect(await card.evaluate((node) => node.tabIndex)).toBe(-1);
});

test("merges extra classes onto the container", async ({ page }) => {
  const root = await openStory(page, `${STORY}--default`, {
    className: "custom-card-class",
  });

  await expect(root.locator(".custom-card-class")).toContainText(
    "Acme Robotics",
  );
});

test("lays out rich content inside", async ({ page }) => {
  const root = await openStory(page, `${STORY}--with-rich-content`);

  await expect(root.getByText("INV-2048")).toBeVisible();
  await expect(root.getByText("Settled")).toBeVisible();
  await expect(root.getByText("$4,120.00")).toBeVisible();
});

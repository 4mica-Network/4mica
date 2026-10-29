import { expect, test } from "../fixtures";
import { openStory } from "../story";

const STORY = "components-copybutton";
const VALUE = "sk_live_4mica_example";

test.use({ permissions: ["clipboard-read", "clipboard-write"] });

test("copies the value and confirms, then resets", async ({ page }) => {
  await openStory(page, `${STORY}--default`, { resetAfterMs: 500 });
  const button = page.getByRole("button", { name: "Copy" });

  await expect(button).toHaveText("Copy");
  await button.click();

  await expect(page.getByRole("button", { name: "Copied" })).toHaveText(
    "Copied",
  );
  await expect(page.getByRole("button")).toHaveAttribute("data-copied", "true");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(VALUE);

  await expect(page.getByRole("button", { name: "Copy" })).toHaveText("Copy");
  await expect(page.getByRole("button")).not.toHaveAttribute("data-copied");
});

test("copies a different value when the arg changes", async ({ page }) => {
  await openStory(page, `${STORY}--default`, { value: "hello-world" });

  await page.getByRole("button", { name: "Copy" }).click();

  await expect(page.getByRole("button", { name: "Copied" })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    "hello-world",
  );
});

test("keeps an accessible name when the label is hidden", async ({ page }) => {
  await openStory(page, `${STORY}--icon-only`);
  const button = page.getByRole("button", { name: "Copy" });

  await expect(button).toHaveText("");
  await button.click();

  await expect(page.getByRole("button", { name: "Copied" })).toHaveText("");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(VALUE);
});

test("copies from the keyboard", async ({ page }) => {
  await openStory(page, `${STORY}--default`);
  const button = page.getByRole("button", { name: "Copy" });

  await button.focus();
  await page.keyboard.press("Enter");

  await expect(page.getByRole("button", { name: "Copied" })).toBeVisible();
});

test("works inside a code surface", async ({ page }) => {
  await openStory(page, `${STORY}--on-code-surface`);

  await expect(page.getByText(VALUE)).toBeVisible();
  await page.getByRole("button", { name: "Copy" }).click();

  await expect(page.getByRole("button", { name: "Copied" })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(VALUE);
});

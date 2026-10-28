import { expect, test } from "../fixtures";
import { openStory } from "../story";

const STORY = "components-switch";

test("starts off and toggles on when clicked", async ({ page }) => {
  await openStory(page, `${STORY}--off`);
  const control = page.getByRole("switch");

  await expect(control).toHaveAttribute("aria-checked", "false");
  await expect(control).toHaveAttribute("data-state", "off");

  await control.click();

  await expect(control).toHaveAttribute("aria-checked", "true");
  await expect(control).toHaveAttribute("data-state", "on");

  await control.click();

  await expect(control).toHaveAttribute("aria-checked", "false");
});

test("seeds its state from initialState", async ({ page }) => {
  await openStory(page, `${STORY}--on`);

  await expect(page.getByRole("switch")).toHaveAttribute(
    "aria-checked",
    "true",
  );
});

test("toggles with the keyboard", async ({ page }) => {
  await openStory(page, `${STORY}--off`);
  const control = page.getByRole("switch");

  await control.focus();
  await page.keyboard.press("Space");

  await expect(control).toHaveAttribute("aria-checked", "true");
});

test("ignores clicks while disabled", async ({ page }) => {
  await openStory(page, `${STORY}--disabled-on`);
  const control = page.getByRole("switch");

  await expect(control).toBeDisabled();
  await control.click({ force: true });

  await expect(control).toHaveAttribute("aria-checked", "true");
});

test("moves the thumb when turned on", async ({ page }) => {
  await openStory(page, `${STORY}--off`);
  const control = page.getByRole("switch");
  const thumb = page.getByTestId("switch-thumb");
  const before = await thumb.boundingBox();

  await control.click();
  await expect(control).toHaveAttribute("data-state", "on");
  await expect
    .poll(async () => (await thumb.boundingBox())?.x ?? 0)
    .toBeGreaterThan(before?.x ?? 0);
});

test("applies custom colours", async ({ page }) => {
  await openStory(page, `${STORY}--custom-colors`);

  await expect(page.getByRole("switch")).toHaveCSS(
    "background-color",
    "rgb(72, 201, 176)",
  );
});

test("exposes each switch in a group by its label", async ({ page }) => {
  await openStory(page, `${STORY}--group`);

  const sandbox = page.getByRole("switch", { name: "Sandbox mode" });
  const alerts = page.getByRole("switch", { name: "Credit-limit alerts" });

  await expect(sandbox).toHaveAttribute("aria-checked", "false");
  await expect(alerts).toHaveAttribute("aria-checked", "true");

  await sandbox.click();

  await expect(sandbox).toHaveAttribute("aria-checked", "true");
  await expect(alerts).toHaveAttribute("aria-checked", "true");
});

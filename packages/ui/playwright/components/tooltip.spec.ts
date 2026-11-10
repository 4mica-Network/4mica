import { expect, test } from "../fixtures";
import { openStory } from "../story";

const STORY = "components-tooltip";
const TITLE = "Available credit refreshes every 24 hours.";

test("opens on hover after the delay and closes on leave", async ({ page }) => {
  await openStory(page, `${STORY}--default`);
  const trigger = page.getByRole("button", { name: "Hover me" });
  const tooltip = page.getByRole("tooltip");

  await expect(tooltip).toHaveCount(0);

  await trigger.hover();

  await expect(tooltip).toHaveText(TITLE);
  const id = await tooltip.getAttribute("id");
  await expect(trigger).toHaveAttribute("aria-describedby", id ?? "");

  await page.mouse.move(0, 0);

  await expect(tooltip).toHaveCount(0);
  await expect(trigger).not.toHaveAttribute("aria-describedby", /.+/);
});

test("opens on focus and closes on blur", async ({ page }) => {
  await openStory(page, `${STORY}--no-delay`);
  const trigger = page.getByRole("button", { name: "Hover me" });

  await trigger.focus();
  await expect(page.getByRole("tooltip")).toBeVisible();

  await trigger.blur();
  await expect(page.getByRole("tooltip")).toHaveCount(0);
});

test("closes on Escape", async ({ page }) => {
  await openStory(page, `${STORY}--no-delay`);

  await page.getByRole("button", { name: "Hover me" }).hover();
  await expect(page.getByRole("tooltip")).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.getByRole("tooltip")).toHaveCount(0);
});

test("waits for a long delay before opening", async ({ page }) => {
  await openStory(page, `${STORY}--long-delay`);

  await page.getByRole("button", { name: "Hover me" }).hover();

  await expect(page.getByRole("tooltip")).toHaveCount(0);
  await expect(page.getByRole("tooltip")).toBeVisible({ timeout: 3_000 });
});

test("renders rich content instead of the title", async ({ page }) => {
  await openStory(page, `${STORY}--with-rich-content`);

  await page.getByText("Utilisation").hover();
  const tooltip = page.getByRole("tooltip");

  await expect(tooltip).toContainText("Credit utilisation");
  await expect(tooltip).not.toContainText(TITLE);
});

test("never opens while disabled", async ({ page }) => {
  await openStory(page, `${STORY}--disabled`);
  const trigger = page.getByRole("button", { name: "Hover me" });

  await expect(trigger).toHaveAttribute("aria-disabled", "true");
  await expect(trigger).toHaveAttribute("tabindex", "-1");

  await trigger.hover();
  await trigger.focus();

  await expect(page.getByRole("tooltip")).toHaveCount(0);
});

test("wraps a disabled button in a focusable anchor", async ({ page }) => {
  await openStory(page, `${STORY}--disabled-button-child`);
  const button = page.getByRole("button", { name: "Draw funds" });
  const wrapper = page.locator('span[tabindex="0"]', { has: button });

  await expect(button).toBeDisabled();
  await expect(wrapper).toHaveCount(1);

  await wrapper.hover();

  await expect(page.getByRole("tooltip")).toHaveText(
    "Raise your limit to enable this.",
  );
});

test("stays open while the pointer is inside an interactive bubble", async ({
  page,
}) => {
  await openStory(page, `${STORY}--interactive`);
  const tooltip = page.getByRole("tooltip");

  await page.getByRole("button", { name: "Hover me" }).hover();
  await expect(tooltip).toBeVisible();

  await tooltip.getByRole("link", { name: "credit policy" }).hover();

  await expect(tooltip).toBeVisible();
  await expect(tooltip).toHaveCSS("pointer-events", "auto");

  await page.mouse.move(0, 0);

  await expect(tooltip).toHaveCount(0);
});

test("ignores hover and follows open with a manual trigger", async ({
  page,
}) => {
  await openStory(page, `${STORY}--manual-trigger`);
  const toggle = page.getByRole("button", { name: "Show tooltip" });
  const tooltip = page.getByRole("tooltip");

  await page.getByText("Anchor element").hover();
  await expect(tooltip).toHaveCount(0);

  await toggle.click();
  await expect(tooltip).toHaveText(TITLE);
  await expect(
    page.getByRole("button", { name: "Hide tooltip" }),
  ).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(tooltip).toBeVisible();

  await page.getByRole("button", { name: "Hide tooltip" }).click();
  await expect(tooltip).toHaveCount(0);
});

test("positions each placement on its own side of the anchor", async ({
  page,
}) => {
  await openStory(page, `${STORY}--placements`);

  const exact = (name: string) => new RegExp(`^${name}$`);
  const anchorOf = (name: string) =>
    page.locator("span.btn", { hasText: exact(name) });
  const tipOf = (name: string) =>
    page.getByRole("tooltip").filter({ hasText: exact(name) });

  await expect(page.getByRole("tooltip")).toHaveCount(9);

  const top = await anchorOf("top").boundingBox();
  const topTip = await tipOf("top").boundingBox();
  expect((topTip?.y ?? 0) + (topTip?.height ?? 0)).toBeLessThan(top?.y ?? 0);

  const bottom = await anchorOf("bottom").boundingBox();
  const bottomTip = await tipOf("bottom").boundingBox();
  expect(bottomTip?.y ?? 0).toBeGreaterThan(
    (bottom?.y ?? 0) + (bottom?.height ?? 0),
  );

  const left = await anchorOf("left").boundingBox();
  const leftTip = await tipOf("left").boundingBox();
  expect((leftTip?.x ?? 0) + (leftTip?.width ?? 0)).toBeLessThan(left?.x ?? 0);

  const right = await anchorOf("right").boundingBox();
  const rightTip = await tipOf("right").boundingBox();
  expect(rightTip?.x ?? 0).toBeGreaterThan(
    (right?.x ?? 0) + (right?.width ?? 0),
  );
});

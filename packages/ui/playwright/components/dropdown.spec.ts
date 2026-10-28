import { expect, test } from "../fixtures";
import { openStory } from "../story";

const STORY = "components-dropdown";

test("toggles from its anchor", async ({ page }) => {
  await openStory(page, `${STORY}--default`);
  const anchor = page.getByRole("button", { name: "Toggle dropdown" });
  const panel = page.getByTestId("dropdown");

  await expect(panel).toBeVisible();
  await expect(panel.getByRole("button")).toHaveText([
    "Profile",
    "Billing",
    "Settings",
  ]);

  await anchor.click();
  await expect(panel).toHaveCount(0);

  await anchor.click();
  await expect(panel).toBeVisible();
});

test("renders nothing while closed", async ({ page }) => {
  await openStory(page, `${STORY}--closed-state`);
  const panel = page.getByTestId("dropdown");

  await expect(panel).toHaveCount(0);

  await page.getByRole("button", { name: "Toggle dropdown" }).click();

  await expect(panel).toBeVisible();
});

test("closes when clicking outside", async ({ page }) => {
  await openStory(page, `${STORY}--default`);
  const panel = page.getByTestId("dropdown");
  await expect(panel).toBeVisible();

  await page.mouse.click(5, 5);

  await expect(panel).toHaveCount(0);
});

test("closes on Escape and returns focus to the anchor", async ({ page }) => {
  await openStory(page, `${STORY}--default`);
  const panel = page.getByTestId("dropdown");

  await panel.getByRole("button", { name: "Billing" }).focus();
  await page.keyboard.press("Escape");

  await expect(panel).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Toggle dropdown" }),
  ).toBeFocused();
});

test("tabbing past the last item dismisses it", async ({ page }) => {
  await openStory(page, `${STORY}--default`);
  const panel = page.getByTestId("dropdown");

  await panel.getByRole("button", { name: "Settings" }).focus();
  await page.keyboard.press("Tab");

  await expect(panel).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Toggle dropdown" }),
  ).toBeFocused();
});

test("sits below the anchor by default", async ({ page }) => {
  await openStory(page, `${STORY}--default`);
  const anchor = await page
    .getByRole("button", { name: "Toggle dropdown" })
    .boundingBox();
  const panel = await page.getByTestId("dropdown").boundingBox();

  expect(panel?.y).toBeCloseTo((anchor?.y ?? 0) + (anchor?.height ?? 0) + 8, 0);
});

test("matches the anchor width when asked", async ({ page }) => {
  await openStory(page, `${STORY}--match-anchor-width`);
  const anchor = await page
    .getByRole("button", { name: "Toggle dropdown" })
    .boundingBox();
  const panel = await page.getByTestId("dropdown").boundingBox();

  expect(panel?.width).toBeCloseTo(anchor?.width ?? 0, 0);
  expect(panel?.x).toBeCloseTo(anchor?.x ?? 0, 0);
});

test("applies placement offsets", async ({ page }) => {
  await openStory(page, `${STORY}--with-offset`);
  const anchor = await page
    .getByRole("button", { name: "Toggle dropdown" })
    .boundingBox();
  const panel = await page.getByTestId("dropdown").boundingBox();

  expect(panel?.x).toBeCloseTo((anchor?.x ?? 0) - 24, 0);
  expect(panel?.y).toBeCloseTo(
    (anchor?.y ?? 0) + (anchor?.height ?? 0) + 24,
    0,
  );
});

test("honours each placement when flipping is off", async ({ page }) => {
  await openStory(page, `${STORY}--placements`);

  const boxFor = async (placement: string) => {
    const anchor = await page
      .getByRole("button", { name: placement, exact: true })
      .boundingBox();
    const panel = await page
      .getByTestId("dropdown")
      .filter({ has: page.getByText(placement, { exact: true }) })
      .boundingBox();
    return { anchor, panel };
  };

  const top = await boxFor("top");
  expect((top.panel?.y ?? 0) + (top.panel?.height ?? 0)).toBeLessThan(
    top.anchor?.y ?? 0,
  );

  const bottom = await boxFor("bottom");
  expect(bottom.panel?.y ?? 0).toBeGreaterThan(
    (bottom.anchor?.y ?? 0) + (bottom.anchor?.height ?? 0),
  );

  const left = await boxFor("left");
  expect((left.panel?.x ?? 0) + (left.panel?.width ?? 0)).toBeLessThanOrEqual(
    left.anchor?.x ?? 0,
  );

  const right = await boxFor("right");
  expect(right.panel?.x ?? 0).toBeGreaterThanOrEqual(
    (right.anchor?.x ?? 0) + (right.anchor?.width ?? 0),
  );
});

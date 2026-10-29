import { expect, test } from "../fixtures";
import { openStory } from "../story";

const STORY = "components-tabgroup";

test("activates the clicked tab", async ({ page }) => {
  await openStory(page, `${STORY}--default`);
  const overview = page.getByRole("tab", { name: "Overview" });
  const details = page.getByRole("tab", { name: "Details" });

  await expect(overview).toHaveAttribute("aria-selected", "true");
  await expect(details).toHaveAttribute("aria-selected", "false");

  await details.click();

  await expect(details).toHaveAttribute("aria-selected", "true");
  await expect(details).toHaveAttribute("data-state", "active");
  await expect(overview).toHaveAttribute("aria-selected", "false");
  await expect(overview).toHaveAttribute("data-state", "inactive");
});

test("activates a focused tab with Enter and Space", async ({ page }) => {
  await openStory(page, `${STORY}--default`);
  const details = page.getByRole("tab", { name: "Details" });
  const settings = page.getByRole("tab", { name: "Settings" });

  await details.focus();
  await page.keyboard.press("Enter");
  await expect(details).toHaveAttribute("aria-selected", "true");

  await settings.focus();
  await page.keyboard.press("Space");
  await expect(settings).toHaveAttribute("aria-selected", "true");
  await expect(details).toHaveAttribute("aria-selected", "false");
});

test("wires each tab to its panel id", async ({ page }) => {
  await openStory(page, `${STORY}--default`);
  const tablist = page.getByRole("tablist");

  await expect(tablist).toHaveAttribute("aria-orientation", "horizontal");
  await expect(page.getByRole("tab", { name: "Details" })).toHaveAttribute(
    "aria-controls",
    "panel-details",
  );
  await expect(page.getByRole("tab", { name: "Details" })).toHaveAttribute(
    "id",
    "tab-details",
  );
});

test("skips a disabled tab for the initial selection and on click", async ({
  page,
}) => {
  await openStory(page, `${STORY}--with-disabled`);
  const billing = page.getByRole("tab", { name: "Billing" });

  await expect(page.getByRole("tab", { name: "Overview" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(billing).toBeDisabled();
  await expect(billing).toHaveAttribute("aria-disabled", "true");
  await expect(billing).toHaveAttribute("tabindex", "-1");
  await expect(billing).toHaveAttribute("title", "Unavailable");

  await billing.click({ force: true });

  await expect(billing).toHaveAttribute("aria-selected", "false");
  await expect(page.getByRole("tab", { name: "Overview" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
});

test("renders only the active panel when controlled", async ({ page }) => {
  await openStory(page, `${STORY}--controlled`);
  const panel = page.getByRole("tabpanel");

  await expect(page.getByRole("tab", { name: "Details" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(panel).toHaveCount(1);
  await expect(panel).toHaveText("Here are the details.");
  await expect(panel).toHaveAttribute("aria-labelledby", "tab-details");

  await page.getByRole("tab", { name: "Settings" }).click();

  await expect(panel).toHaveCount(1);
  await expect(panel).toHaveText("Adjust your preferences here.");
  await expect(panel).toHaveAttribute("id", "panel-settings");
});

test("renders no panel when uncontrolled", async ({ page }) => {
  await openStory(page, `${STORY}--default`);

  await expect(page.getByRole("tabpanel")).toHaveCount(0);
});

test("shows a scroll arrow only on the overflowing side", async ({ page }) => {
  await openStory(page, `${STORY}--scrollable`);
  const right = page.getByRole("button", { name: "Scroll tabs right" });
  const left = page.getByRole("button", { name: "Scroll tabs left" });

  await expect(right).toBeVisible();
  await expect(left).toHaveCount(0);

  await right.click();

  await expect(left).toBeVisible();

  await page.getByRole("tab", { name: "Workspace 12" }).click();

  await expect(
    page.getByRole("tab", { name: "Workspace 12" }),
  ).toBeInViewport();
  await expect(right).toHaveCount(0);
});

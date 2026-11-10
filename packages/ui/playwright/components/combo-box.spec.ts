import { expect, test } from "../fixtures";
import { openStory } from "../story";

const STORY = "components-combobox";

test("opens on click and focuses the search field", async ({ page }) => {
  await openStory(page, `${STORY}--default`);
  const trigger = page.getByRole("button", { name: "Select options" });

  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByTestId("dropdown")).toHaveCount(0);

  await trigger.click();

  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByTestId("dropdown")).toBeVisible();
  await expect(
    page.getByRole("searchbox", { name: "Search..." }),
  ).toBeFocused();
  await expect(page.getByRole("checkbox")).toHaveCount(6);
});

test("selects and deselects options, summarising the count", async ({
  page,
}) => {
  await openStory(page, `${STORY}--default`);
  const trigger = page.locator("button[aria-haspopup='dialog']");
  await trigger.click();

  const germany = page.getByRole("checkbox", { name: "Germany" });
  const france = page.getByRole("checkbox", { name: "France" });

  await germany.click();
  await expect(germany).toHaveAttribute("aria-checked", "true");
  await expect(trigger).toHaveText("1 selected");

  await france.click();
  await expect(trigger).toHaveText("2 selected");

  await germany.click();
  await expect(germany).toHaveAttribute("aria-checked", "false");
  await expect(trigger).toHaveText("1 selected");
});

test("filters options by the search text", async ({ page }) => {
  await openStory(page, `${STORY}--default`);
  await page.getByRole("button", { name: "Select options" }).click();
  const search = page.getByRole("searchbox", { name: "Search..." });

  await search.fill("uni");

  await expect(page.getByRole("checkbox")).toHaveText([
    "United States",
    "United Kingdom",
  ]);

  await search.fill("zzz");

  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await expect(page.getByText("No results")).toBeVisible();

  await search.fill("");

  await expect(page.getByRole("checkbox")).toHaveCount(6);
});

test("reflects a preselected set", async ({ page }) => {
  await openStory(page, `${STORY}--with-selection`);
  const trigger = page.getByLabel("Supported regions");

  await expect(trigger).toHaveText("2 selected");
  await trigger.click();

  await expect(
    page.getByRole("checkbox", { name: "United States" }),
  ).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("checkbox", { name: "Germany" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await expect(page.getByRole("checkbox", { name: "France" })).toHaveAttribute(
    "aria-checked",
    "false",
  );
});

test("opens from the keyboard and closes on Escape", async ({ page }) => {
  await openStory(page, `${STORY}--with-label`);
  const trigger = page.getByLabel("Supported regions");

  await trigger.focus();
  await page.keyboard.press("ArrowDown");

  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("searchbox")).toBeFocused();

  await page.keyboard.press("Escape");

  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByTestId("dropdown")).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("moves through options with the arrow keys", async ({ page }) => {
  await openStory(page, `${STORY}--default`);
  await page.getByRole("button", { name: "Select options" }).click();

  await page.keyboard.press("ArrowDown");
  await expect(
    page.getByRole("checkbox", { name: "United States" }),
  ).toBeFocused();

  await page.keyboard.press("ArrowDown");
  await expect(
    page.getByRole("checkbox", { name: "United Kingdom" }),
  ).toBeFocused();

  await page.keyboard.press("End");
  await expect(page.getByRole("checkbox", { name: "Japan" })).toBeFocused();

  await page.keyboard.press("Space");
  await expect(page.getByRole("checkbox", { name: "Japan" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
});

test("closes when clicking outside", async ({ page }) => {
  await openStory(page, `${STORY}--default`);
  const trigger = page.getByRole("button", { name: "Select options" });
  await trigger.click();
  await expect(page.getByTestId("dropdown")).toBeVisible();

  await page.mouse.click(5, 5);

  await expect(page.getByTestId("dropdown")).toHaveCount(0);
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
});

test("does not open while disabled", async ({ page }) => {
  await openStory(page, `${STORY}--disabled`);
  const trigger = page.getByLabel("Supported regions");

  await expect(trigger).toBeDisabled();
  await expect(trigger).toHaveText("1 selected");
  await trigger.click({ force: true });

  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByTestId("dropdown")).toHaveCount(0);
});

test("uses custom placeholders", async ({ page }) => {
  await openStory(page, `${STORY}--custom-placeholders`);
  const trigger = page.getByLabel("Supported regions");

  await expect(trigger).toHaveText("Choose regions");
  await trigger.click();

  await expect(
    page.getByRole("searchbox", { name: "Filter regions…" }),
  ).toBeVisible();
});

import { expect, test } from "../fixtures";
import { openStory } from "../story";

const STORY = "components-select";

test("opens a listbox from the trigger and selects an option", async ({
  page,
}) => {
  await openStory(page, `${STORY}--default`);
  const trigger = page.getByTestId("select-trigger");

  await expect(trigger).toHaveAccessibleName("Select payment terms");
  await expect(trigger).toHaveAttribute("aria-haspopup", "listbox");
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("listbox")).toHaveCount(0);

  await trigger.click();
  const listbox = page.getByRole("listbox");
  await expect(listbox).toBeVisible();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await expect(trigger).toHaveAttribute(
    "aria-controls",
    (await listbox.getAttribute("id")) ?? "",
  );
  await expect(listbox.getByRole("option")).toHaveCount(5);

  await listbox.getByRole("option", { name: "Net 30" }).click();

  await expect(listbox).toHaveCount(0);
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(trigger).toHaveAccessibleName("Net 30");
  await expect(page.getByTestId("select-selected")).toHaveText("Net 30");

  await trigger.click();
  await expect(page.getByRole("option", { name: "Net 30" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByRole("option", { selected: true })).toHaveCount(1);
});

test("is fully keyboard operable", async ({ page }) => {
  await openStory(page, `${STORY}--with-label`);
  const trigger = page.getByRole("button", { name: "Payment terms" });

  await trigger.focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("listbox")).toBeVisible();
  await expect(page.getByRole("option", { name: "Net 15" })).toBeFocused();

  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("option", { name: "Net 45" })).toBeFocused();

  await page.keyboard.press("End");
  await expect(
    page.getByRole("option", { name: "Due on receipt" }),
  ).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("option", { name: "Net 15" })).toBeFocused();

  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await expect(page.getByTestId("select-selected")).toHaveText(
    "Due on receipt",
  );
});

test("closes on Escape and on outside click", async ({ page }) => {
  await openStory(page, `${STORY}--default`);
  const trigger = page.getByRole("button", { name: "Select payment terms" });

  await trigger.click();
  await expect(page.getByRole("listbox")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await expect(trigger).toBeFocused();

  await trigger.click();
  await expect(page.getByRole("listbox")).toBeVisible();
  await page.mouse.click(5, 5);
  await expect(page.getByRole("listbox")).toHaveCount(0);
});

test("labels the listbox from the field label", async ({ page }) => {
  await openStory(page, `${STORY}--preselected`);
  const trigger = page.getByRole("button", { name: "Payment terms" });

  await expect(page.getByTestId("select-selected")).toHaveText("Net 30");
  await expect(trigger).toHaveAccessibleName("Payment terms");

  await page.getByTestId("select-label").click();
  const option = page.getByRole("option", { name: "Net 30" });
  await expect(
    page.getByRole("listbox", { name: "Payment terms" }),
  ).toBeVisible();
  await expect(option).toHaveAttribute("aria-selected", "true");
  await expect(option).toBeFocused();
});

test("filters options through the search box", async ({ page }) => {
  await openStory(page, `${STORY}--with-search`);
  const search = page.getByRole("searchbox", { name: "Search..." });

  await expect(search).toBeFocused();
  await search.fill("net 6");
  await expect(page.getByRole("option")).toHaveText(["Net 60"]);

  await search.fill("zzz");
  await expect(page.getByRole("option")).toHaveCount(0);
  await expect(page.getByText("No matching results")).toBeVisible();

  await search.fill("");
  await expect(page.getByRole("option")).toHaveCount(5);
});

test("clears the selection through the empty row", async ({ page }) => {
  await openStory(page, `${STORY}--with-empty-value`);
  const clear = page.getByTestId("select-clear");

  await expect(page.getByTestId("select-selected")).toHaveText("Net 15");
  await expect(clear).toHaveText("-");

  await clear.click();

  await expect(page.getByTestId("select-selected")).toHaveText(
    "Select payment terms",
  );
  await expect(clear).toHaveCount(0);
});

test("reports the selection to a controlling parent", async ({ page }) => {
  await openStory(page, `${STORY}--controlled`);
  const trigger = page.getByRole("button", { name: "Payment terms" });

  await expect(page.getByText("Selected value: net15")).toBeVisible();

  await trigger.click();
  await page.getByRole("option", { name: "Net 45" }).click();
  await expect(page.getByText("Selected value: net45")).toBeVisible();
  await expect(page.getByTestId("select-selected")).toHaveText("Net 45");

  await trigger.click();
  await page.getByTestId("select-clear").click();
  await expect(page.getByText("Selected value: none")).toBeVisible();
});

test("stays inert while disabled", async ({ page }) => {
  await openStory(page, `${STORY}--disabled`);
  const trigger = page.getByRole("button", { name: "Payment terms" });

  await expect(trigger).toBeDisabled();
  await expect(page.getByTestId("select-selected")).toHaveText("Net 45");
  await trigger.click({ force: true });
  await expect(page.getByRole("listbox")).toHaveCount(0);
});

test("shows loading, empty and error states", async ({ page }) => {
  await openStory(page, `${STORY}--loading`);
  await expect(page.getByTestId("select-loading")).toBeVisible();
  await expect(page.getByRole("option")).toHaveCount(0);

  await openStory(page, `${STORY}--no-data`);
  await expect(page.getByText("No Data")).toBeVisible();

  await openStory(page, `${STORY}--with-error`);
  const trigger = page.getByRole("button", { name: "Payment terms" });
  const error = page.getByText("Choose the terms for this credit line.");
  await expect(trigger).toHaveAttribute("aria-invalid", "true");
  await expect(error).toBeVisible();
  await expect(error).toHaveAttribute(
    "id",
    (await trigger.getAttribute("aria-describedby")) ?? "",
  );
});

test("can hide the trigger and run from the panel alone", async ({ page }) => {
  await openStory(page, `${STORY}--input-hidden`);

  await expect(page.getByTestId("select-trigger")).toHaveCount(0);
  await expect(
    page.getByRole("listbox", { name: "Select payment terms" }),
  ).toBeVisible();
  await expect(page.getByRole("option")).toHaveCount(5);
});

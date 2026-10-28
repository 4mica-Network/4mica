import { expect, test } from "../fixtures";
import { openStory } from "../story";

const STORY = "components-inputfield";

test("focuses the input from its label and accepts typing", async ({
  page,
}) => {
  await openStory(page, `${STORY}--with-label`);

  await page.getByText("Work email").click();
  const input = page.getByLabel("Work email");
  await expect(input).toBeFocused();

  await input.fill("ops@acme.com");
  await expect(input).toHaveValue("ops@acme.com");
});

test("marks a required field", async ({ page }) => {
  await openStory(page, `${STORY}--required`);

  await expect(page.getByLabel("Work email")).toHaveAttribute(
    "aria-required",
    "true",
  );
  await expect(page.locator("label svg[aria-hidden='true']")).toHaveCount(1);
});

test("wires the error message to the input", async ({ page }) => {
  await openStory(page, `${STORY}--with-error`);

  const input = page.getByLabel("Work email");
  const message = page.getByText("Enter a valid work email address.");

  await expect(input).toHaveAttribute("aria-invalid", "true");
  await expect(message).toBeVisible();
  await expect(message).toHaveAttribute("aria-live", "polite");

  const describedBy = await input.getAttribute("aria-describedby");
  await expect(message).toHaveAttribute("id", describedBy ?? "");
});

test("formats every keystroke to uppercase", async ({ page }) => {
  await openStory(page, `${STORY}--uppercase-format`);

  const input = page.getByLabel("Invoice reference");
  await input.pressSequentially("inv-2048");

  await expect(input).toHaveValue("INV-2048");
});

test("blocks input while disabled or read-only", async ({ page }) => {
  await openStory(page, `${STORY}--disabled`);
  await expect(page.getByLabel("Account ID")).toBeDisabled();
  await expect(page.getByLabel("Account ID")).toHaveValue("acct_9f2c41");

  await openStory(page, `${STORY}--read-only`);
  const readOnly = page.getByLabel("API key");
  await expect(readOnly).toHaveAttribute("readonly", "");
  await readOnly.press("x");
  await expect(readOnly).toHaveValue("sk_live_4m1ca_…");
});

test("renders the prefix addon beside the input", async ({ page }) => {
  await openStory(page, `${STORY}--with-prefix`);

  await expect(page.getByText("https://")).toBeVisible();
  await expect(page.getByLabel("Webhook URL")).toHaveAttribute(
    "placeholder",
    "api.acme.com/4mica",
  );
});

test("passes number constraints through", async ({ page }) => {
  await openStory(page, `${STORY}--number-input`);

  const input = page.getByLabel("Credit limit");
  await expect(input).toHaveAttribute("type", "number");
  await expect(input).toHaveAttribute("inputmode", "numeric");
  await expect(input).toHaveAttribute("min", "0");
  await expect(input).toHaveAttribute("max", "100000");
});

test("masks a password field", async ({ page }) => {
  await openStory(page, `${STORY}--with-trailing-icon`);

  await expect(page.getByLabel("Password")).toHaveAttribute("type", "password");
});

test("grows the textarea with its content", async ({ page }) => {
  await openStory(page, `${STORY}--text-area-auto-grow`);

  const textarea = page.getByLabel("Memo");
  const before = (await textarea.boundingBox())?.height ?? 0;

  await textarea.fill("one\ntwo\nthree\nfour\nfive\nsix");

  await expect
    .poll(async () => (await textarea.boundingBox())?.height ?? 0)
    .toBeGreaterThan(before);
});

test("applies register attributes", async ({ page }) => {
  await openStory(page, `${STORY}--with-register`);

  const input = page.getByLabel("Company name");
  await expect(input).toHaveAttribute("name", "companyName");
  await expect(input).toHaveAttribute("id", "input-companyName");
  await expect(input).toHaveAttribute("maxlength", "64");
  await expect(input).toHaveAttribute("aria-required", "true");
});

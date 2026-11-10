import { expect, test } from "../fixtures";
import { openStory } from "../story";

const STORY = "components-typography";

const tagOf = (locator: import("@playwright/test").Locator) =>
  locator.evaluate((node) => node.tagName.toLowerCase());

test("renders a paragraph by default", async ({ page }) => {
  await openStory(page, `${STORY}--default`);
  const text = page.getByTestId("typography");

  expect(await tagOf(text)).toBe("p");
  await expect(text).toHaveAttribute("data-variant", "default");
  await expect(text).toHaveText("The credit layer for the agentic economy.");
});

test("renders headings as h3 unless told otherwise", async ({ page }) => {
  await openStory(page, `${STORY}--heading`);
  const heading = page.getByRole("heading", { level: 3, name: "Balances" });

  await expect(heading).toBeVisible();
  await expect(heading).toHaveAttribute("data-variant", "heading");
  await expect(heading).toHaveAttribute("data-size", "lg");
});

test("uses the element given by as", async ({ page }) => {
  await openStory(page, `${STORY}--heading-levels`);

  for (const level of [1, 2, 3, 4] as const) {
    await expect(
      page.getByRole("heading", { level, name: `as="h${level}"` }),
    ).toBeVisible();
  }
});

test("renders inline text as a span inside copy", async ({ page }) => {
  await openStory(page, `${STORY}--inline-in-copy`);
  const strong = page.getByText("Payouts land the next business day");

  expect(await tagOf(strong)).toBe("span");
  await expect(strong).toHaveCSS("font-weight", "600");
  await expect(
    page.getByRole("link", { name: "track them here" }),
  ).toHaveAttribute("href", "https://4mica.io");
});

test("renders the link variant as an anchor", async ({ page }) => {
  await openStory(page, `${STORY}--link-story`);
  const link = page.getByRole("link", { name: "Read the docs" });

  await expect(link).toHaveAttribute("href", "https://4mica.io");
  await expect(link).toHaveAttribute("data-variant", "link");
  await expect(link).not.toHaveAttribute("target", /.+/);
  await expect(link).toHaveClass(/link-accent/);
});

test("switches a muted link to the muted tone", async ({ page }) => {
  await openStory(page, `${STORY}--muted-link`);
  const link = page.getByRole("link", { name: "Learn more" });

  await expect(link).toHaveClass(/link-muted/);
  await expect(link).not.toHaveClass(/link-accent/);
});

test("opens external links in a new tab with an icon", async ({ page }) => {
  await openStory(page, `${STORY}--external-link-story`);
  const link = page.getByRole("link", { name: "Open the dashboard" });

  await expect(link).toHaveAttribute("target", "_blank");
  await expect(link).toHaveAttribute("rel", "noreferrer noopener");
  await expect(link.locator("svg")).toHaveCount(1);

  const iconIsLast = await link.evaluate(
    (node) => node.lastElementChild?.querySelector("svg") !== null,
  );
  expect(iconIsLast).toBe(true);
});

test("scales the font with size and weight", async ({ page }) => {
  await openStory(page, `${STORY}--sizes`);
  const sizes = page.getByTestId("typography");
  await expect(sizes).toHaveCount(8);
  const fontSizes = await Promise.all(
    (await sizes.all()).map((node) =>
      node.evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize)),
    ),
  );

  expect(fontSizes).toHaveLength(8);
  for (let index = 1; index < fontSizes.length; index += 1) {
    expect(fontSizes[index]).toBeGreaterThan(fontSizes[index - 1]);
  }

  await openStory(page, `${STORY}--weights`);
  const weights = page.getByTestId("typography");
  await expect(weights).toHaveCount(4);

  await expect(weights.nth(0)).toHaveCSS("font-weight", "400");
  await expect(weights.nth(3)).toHaveCSS("font-weight", "700");
});

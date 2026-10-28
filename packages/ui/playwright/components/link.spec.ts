import { expect, test } from "../fixtures";
import { openStory } from "../story";

const STORY = "components-link";

test("renders a plain anchor by default", async ({ page }) => {
  await openStory(page, `${STORY}--accent`);

  const link = page.getByRole("link", { name: "Read the docs" });
  await expect(link).toHaveAttribute("href", "#");
  await expect(link).not.toHaveAttribute("target", "_blank");
  await expect(link).not.toHaveAttribute("rel", /.+/);
  await expect(link).toHaveClass(/link-accent/);
});

test("opens external links in a new tab safely", async ({ page }) => {
  await openStory(page, `${STORY}--external`);

  const link = page.getByRole("link", { name: "Visit 4mica.io" });
  await expect(link).toHaveAttribute("href", "https://4mica.io");
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(link).toHaveAttribute("rel", "noreferrer noopener");
});

test("switches to the muted variant", async ({ page }) => {
  await openStory(page, `${STORY}--muted`);

  const link = page.getByRole("link", { name: "Back to home" });
  await expect(link).toHaveClass(/link-muted/);
  await expect(link).not.toHaveClass(/link-accent/);
});

test("places the icon after the text by default", async ({ page }) => {
  await openStory(page, `${STORY}--with-icon`);

  const link = page.getByRole("link", { name: "Learn more" });
  await expect(link.locator("svg")).toHaveCount(1);
  await expect(link.locator("span")).toHaveClass(/ml-1/);
  await expect(link).toHaveJSProperty("lastElementChild.tagName", "SPAN");
});

test("places the icon before the text when asked", async ({ page }) => {
  await openStory(page, `${STORY}--with-icon`, { iconPosition: "left" });

  const link = page.getByRole("link", { name: "Learn more" });
  await expect(link.locator("span")).toHaveClass(/mr-1/);
  await expect(link).toHaveJSProperty("firstElementChild.tagName", "SPAN");
});

test("navigates to its href when clicked", async ({ page }) => {
  await openStory(page, `${STORY}--accent`);

  await page.getByRole("link", { name: "Read the docs" }).click();

  await expect(page).toHaveURL(/#$/);
});

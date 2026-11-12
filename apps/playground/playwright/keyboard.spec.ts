import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { AGENT, API, PROFILE_PATH } from "./profile";

const PAGES = [
  PROFILE_PATH,
  `${PROFILE_PATH}/agents/${AGENT.slug}`,
  `${PROFILE_PATH}/api/${API.slug}`,
];

const MAX_TABS = 30;

const focusIndicator = (page: Page) =>
  page.evaluate(() => {
    const active = document.activeElement;
    if (!active || active === document.body) {
      return { tag: "body", visible: false };
    }
    let node: Element | null = active;
    for (let depth = 0; node && depth < 4; depth += 1) {
      const style = getComputedStyle(node);
      if (style.outlineStyle !== "none" && style.outlineWidth !== "0px") {
        return { tag: active.outerHTML.slice(0, 120), visible: true };
      }
      node = node.parentElement;
    }
    return { tag: active.outerHTML.slice(0, 120), visible: false };
  });

for (const path of PAGES) {
  test(`every focus stop on ${path} shows an outline`, async ({ page }) => {
    await page.goto(path);
    await page.locator("h1").first().waitFor();

    const seen = new Set<string>();
    for (let i = 0; i < MAX_TABS; i += 1) {
      await page.keyboard.press("Tab");
      const { tag, visible } = await focusIndicator(page);
      if (tag === "body" || seen.has(tag)) {
        break;
      }
      seen.add(tag);
      expect(visible, `no visible focus on ${tag}`).toBe(true);
    }

    expect(seen.size).toBeGreaterThan(1);
  });
}

test("the skip link moves focus into the main landmark", async ({ page }) => {
  await page.goto(PROFILE_PATH);
  await page.locator("h1").first().waitFor();

  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to content" });
  await expect(skip).toBeFocused();
  await expect(skip).toBeVisible();

  await page.keyboard.press("Enter");
  await expect(page.getByRole("main")).toBeFocused();
});

test("profile tabs follow the arrow keys", async ({ page }) => {
  await page.goto(PROFILE_PATH);

  const agents = page.getByRole("tab", { name: /Agents/ });
  const apis = page.getByRole("tab", { name: /APIs/ });
  await agents.focus();

  await page.keyboard.press("ArrowRight");
  await expect(apis).toBeFocused();
  await expect(apis).toHaveAttribute("aria-selected", "true");

  await page.keyboard.press("Home");
  await expect(agents).toBeFocused();
  await expect(agents).toHaveAttribute("aria-selected", "true");
});

test("the mobile step sheet traps focus and restores it on Escape", async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, "the step sheet only exists below the md breakpoint");

  await page.goto(`${PROFILE_PATH}/api/${API.slug}`);

  const trigger = page.getByRole("button", { name: /^All steps/ });
  await trigger.focus();
  await page.keyboard.press("Enter");

  const sheet = page.getByRole("dialog");
  await expect(sheet).toBeVisible();

  for (let i = 0; i < 12; i += 1) {
    await page.keyboard.press("Tab");
    expect(
      await sheet.evaluate((node) => node.contains(document.activeElement)),
    ).toBe(true);
  }

  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(trigger).toBeFocused();
});

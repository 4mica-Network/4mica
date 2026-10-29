import { expect, test } from "./fixtures";

test.describe("theme", () => {
  test("starts dark, toggles to light and remembers it", async ({ page }) => {
    await page.goto("/about");
    const html = page.locator("html");

    await expect(html).toHaveClass(/dark/);

    const toggle = page.getByRole("button", { name: "Switch to light mode" });
    await toggle.scrollIntoViewIfNeeded();
    await toggle.click();

    await expect(html).not.toHaveClass(/dark/);
    await expect(
      page.getByRole("button", { name: "Switch to dark mode" }),
    ).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem("theme"))).toBe(
      "light",
    );

    await page.waitForLoadState("networkidle");
    await page.reload();

    await expect(html).not.toHaveClass(/dark/);
  });
});

test.describe("header navigation", () => {
  test("desktop dropdowns reveal their links on hover", async ({
    page,
    isMobile,
    hasTouch,
  }) => {
    test.skip(
      isMobile || hasTouch,
      "hover menus need a pointer that can hover",
    );
    await page.goto("/");

    const nav = page.getByRole("navigation").first();
    await nav.getByRole("button", { name: "Solutions" }).hover();

    const facilitators = nav.getByRole("link", { name: /Facilitators/ });
    await expect(facilitators).toBeVisible();
    await expect(facilitators).toHaveAttribute(
      "href",
      "/solutions/facilitators",
    );

    await nav.getByRole("button", { name: "Developers" }).hover();

    const docs = nav.getByRole("link", { name: "Documentation" });
    await expect(docs).toBeVisible();
    await expect(docs).toHaveAttribute("target", "_blank");
    await expect(docs).toHaveAttribute("rel", /noreferrer/);

    await expect(nav.getByRole("link", { name: "Pricing" })).toHaveAttribute(
      "href",
      "/pricing",
    );
  });

  test("desktop dropdowns open on click or tap and close on Escape", async ({
    page,
    viewport,
  }) => {
    test.skip(
      (viewport?.width ?? 0) < 768,
      "the desktop nav is hidden below md",
    );
    await page.goto("/");

    const nav = page.getByRole("navigation").first();
    const solutions = nav.getByRole("button", { name: "Solutions" });
    await expect(solutions).toHaveAttribute("aria-expanded", "false");

    await solutions.click();

    await expect(solutions).toHaveAttribute("aria-expanded", "true");
    await expect(nav.getByRole("link", { name: /Facilitators/ })).toBeVisible();

    await page.keyboard.press("Escape");

    await expect(solutions).toHaveAttribute("aria-expanded", "false");

    await solutions.focus();
    await page.keyboard.press("Enter");

    await expect(solutions).toHaveAttribute("aria-expanded", "true");

    await page.mouse.click(5, 400);

    await expect(solutions).toHaveAttribute("aria-expanded", "false");
  });

  test("the mobile menu opens, lists sections, and closes on Escape", async ({
    page,
    viewport,
  }) => {
    test.skip(
      (viewport?.width ?? 0) >= 768,
      "the hamburger is hidden from md up",
    );
    await page.goto("/");

    const toggle = page.getByRole("button", { name: "Toggle mobile menu" });
    const menu = page.locator("#mobile-menu");

    await expect(menu).toBeHidden();
    await toggle.click();

    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(menu).toBeVisible();
    await expect(menu.getByRole("button", { name: "Solutions" })).toBeVisible();
    await expect(menu.getByRole("link", { name: "Pricing" })).toBeVisible();

    await menu.getByRole("button", { name: "Solutions" }).click();
    await expect(
      menu.getByRole("link", { name: /Facilitators/ }).first(),
    ).toBeVisible();

    await page.keyboard.press("Escape");

    await expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  test("the mobile menu navigates and closes", async ({ page, viewport }) => {
    test.skip(
      (viewport?.width ?? 0) >= 768,
      "the hamburger is hidden from md up",
    );
    await page.goto("/");

    await page.getByRole("button", { name: "Toggle mobile menu" }).click();
    await page
      .locator("#mobile-menu")
      .getByRole("link", { name: "Pricing" })
      .click();

    await expect(page).toHaveURL("/pricing");
    await expect(
      page.getByRole("heading", { level: 1, name: /0\.5%/ }),
    ).toBeVisible();
  });
});

test.describe("home", () => {
  test("FAQ answers expand and collapse", async ({ page }) => {
    await page.goto("/");
    const faq = page.locator("#faq");
    await faq.scrollIntoViewIfNeeded();

    const question = faq.getByRole("button").first();
    await expect(question).toHaveAttribute("aria-expanded", "false");

    await question.click();
    await expect(question).toHaveAttribute("aria-expanded", "true");

    await question.click();
    await expect(question).toHaveAttribute("aria-expanded", "false");
  });

  test("the scroll-to-top button appears after scrolling", async ({ page }) => {
    await page.goto("/");
    const button = page.getByRole("button", { name: "Scroll to top" });

    await expect(button).toHaveCSS("opacity", "0");

    await page.evaluate(() => window.scrollTo(0, window.innerHeight * 2));
    await expect(button).toHaveCSS("opacity", "1");

    await button.click();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  });
});

test.describe("blog", () => {
  test("category filters narrow the post list", async ({ page }) => {
    await page.goto("/blog");

    const all = page.getByRole("button", { name: "All articles" });
    await expect(all).toHaveAttribute("aria-pressed", "true");

    const filters = all
      .locator("xpath=..")
      .getByRole("button", { pressed: false });
    const count = await filters.count();
    expect(count).toBeGreaterThan(0);

    const articleLinks = page.getByRole("main").locator('a[href^="/blog/"]');
    const total = await articleLinks.count();

    await filters.first().click();

    await expect(all).toHaveAttribute("aria-pressed", "false");
    await expect.poll(() => articleLinks.count()).toBeLessThanOrEqual(total);
    expect(await articleLinks.count()).toBeGreaterThan(0);
  });

  test("a post opens from the list and shows its title", async ({ page }) => {
    await page.goto("/blog");

    const first = page.getByRole("main").locator('a[href^="/blog/"]').first();
    const href = await first.getAttribute("href");
    await first.click();

    await expect(page).toHaveURL(href ?? "/blog/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page).toHaveTitle(/\| 4Mica Blog$/);
    await expect(page.locator("article")).toBeVisible();
  });
});

test.describe("pricing", () => {
  test("the savings calculator reacts to its sliders", async ({ page }) => {
    await page.goto("/pricing");

    const sliders = page.locator('input[type="range"]');
    await expect(sliders.first()).toBeAttached();
    await sliders.first().scrollIntoViewIfNeeded();

    const results = page.locator("main");
    const before = await results.innerText();

    const slider = sliders.first();
    const max = await slider.getAttribute("max");
    await slider.fill(max ?? "100");
    await slider.dispatchEvent("input");
    await slider.dispatchEvent("change");

    await expect.poll(() => results.innerText()).not.toBe(before);
  });

  test("FAQ entries open as native disclosures", async ({ page }) => {
    await page.goto("/pricing");

    const details = page.locator("details").first();
    await details.scrollIntoViewIfNeeded();
    await expect(details).not.toHaveAttribute("open", "");

    await details.locator("summary").click();

    await expect(details).toHaveAttribute("open", "");
  });
});

test.describe("solutions", () => {
  test("footer links reach every solution page", async ({ page }) => {
    await page.goto("/");

    const footer = page.locator("footer").first();
    const hrefs = await footer
      .locator('a[href^="/solutions/"]')
      .evaluateAll((anchors) =>
        anchors.map((anchor) => anchor.getAttribute("href")),
      );

    expect(hrefs.length).toBe(10);

    await footer.locator('a[href="/solutions/startups"]').click();

    await expect(page).toHaveURL("/solutions/startups");
    await expect(
      page.getByRole("heading", { level: 1, name: /Start small/ }),
    ).toBeVisible();
  });
});

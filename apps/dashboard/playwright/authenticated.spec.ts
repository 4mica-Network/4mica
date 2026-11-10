import { expect, test } from "./fixtures";
import {
  APP_PAGES,
  DETAIL_PAGES,
  ORG,
  REDIRECTS,
  SETTINGS_PAGES,
} from "./pages";

for (const entry of [...APP_PAGES, ...SETTINGS_PAGES]) {
  test(`renders ${entry.path}`, async ({ page }) => {
    await page.goto(entry.path);

    await expect(page).toHaveURL(entry.path);
    await expect(
      page
        .getByRole("heading", {
          level: entry.level,
          name: entry.heading,
          exact: true,
        })
        .first(),
    ).toBeVisible();

    if (entry.titled) {
      await expect(page).toHaveTitle(`${entry.heading} - ${ORG}`);
    }

    await expect(page.getByTestId("onboarding")).toHaveCount(0);
    await expect(page.locator('[data-testid$="-error"]')).toHaveCount(0);
  });
}

for (const [from, to] of REDIRECTS) {
  test(`redirects ${from} to ${to}`, async ({ page }) => {
    await page.goto(from);

    await expect(page).toHaveURL(to);
  });
}

for (const entry of DETAIL_PAGES) {
  test(`opens the first row on ${entry.list}`, async ({ page }) => {
    await page.goto(entry.list);

    const row = page.locator(`[data-testid^="${entry.rowPrefix}"]`).first();
    await expect(row).toBeVisible();
    await row.getByRole("link").first().click();

    await expect(page).toHaveURL(new RegExp(`${entry.list}/[^/]+$`));
    await expect(page).toHaveTitle(new RegExp(` · ${entry.kind} - ${ORG}$`));
    await expect(page.locator('[data-testid$="-error"]')).toHaveCount(0);
  });

  test(`shows a not-found message on ${entry.unknownId}`, async ({ page }) => {
    await page.goto(entry.unknownId);

    await expect(page.getByText(entry.notFound)).toBeVisible();
  });
}

test("renders the advanced page of the first agent", async ({ page }) => {
  await page.goto("/agents");

  const row = page.locator('[data-testid^="agent-row-"]').first();
  await row.getByRole("link").first().click();
  await expect(page).toHaveURL(/\/agents\/[^/]+$/);

  await page.goto(`${new URL(page.url()).pathname}/advanced`);

  await expect(
    page.getByRole("heading", { level: 1, name: "Advanced" }),
  ).toBeVisible();
  await expect(page).toHaveTitle(`Advanced - ${ORG}`);
});

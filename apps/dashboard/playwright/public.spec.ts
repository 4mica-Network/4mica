import { expect, test } from "./fixtures";

test("sign-in page renders and Clerk loads", async ({ page }) => {
  await page.goto("/sign-in");

  await expect(
    page.getByRole("heading", { level: 1, name: "Sign in to 4Mica" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Continue with Google" }),
  ).toBeEnabled();
  await expect(page).toHaveTitle("4Mica Dashboard");
});

test("sso-callback page is served", async ({ page }) => {
  const response = await page.goto("/sso-callback");

  expect(response?.status()).toBe(200);
});

test("protected routes redirect to sign-in", async ({ page }) => {
  await page.goto("/agents");

  await expect(page).toHaveURL("/sign-in?redirect_url=%2Fagents");
});

test("unknown routes redirect to sign-in", async ({ page }) => {
  await page.goto("/this-page-does-not-exist");

  await expect(page).toHaveURL(
    "/sign-in?redirect_url=%2Fthis-page-does-not-exist",
  );
});

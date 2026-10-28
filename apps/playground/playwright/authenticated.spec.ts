import { expect, test } from "./fixtures";
import { DASHBOARD_LINK, PROFILE_NAME, PROFILE_PATH } from "./profile";

test("signed-in viewer sees the dashboard link on a profile", async ({
  page,
}) => {
  await page.goto(PROFILE_PATH);

  await expect(
    page.getByRole("heading", { level: 1, name: PROFILE_NAME }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: DASHBOARD_LINK })).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in" })).toHaveCount(0);
});

test("sign-in page sends a signed-in viewer to the redirect target", async ({
  page,
}) => {
  await page.goto(`/sign-in?redirect_url=${encodeURIComponent(PROFILE_PATH)}`);

  await expect(page).toHaveURL(PROFILE_PATH);
});

import path from "node:path";
import { clerk, clerkSetup } from "@clerk/testing/playwright";
import { expect, test as setup } from "@playwright/test";
import { DASHBOARD_LINK, PROFILE_PATH } from "./profile";

setup.describe.configure({ mode: "serial" });

setup("configure the Clerk testing token", async () => {
  await clerkSetup();
});

setup("sign in and save the storage state", async ({ page }) => {
  const emailAddress = process.env.E2E_CLERK_USER_EMAIL;

  if (!emailAddress) {
    throw new Error(
      "E2E_CLERK_USER_EMAIL is not set. Add it to apps/playground/.env along with CLERK_SECRET_KEY.",
    );
  }

  await page.goto(`/sign-in?redirect_url=${encodeURIComponent(PROFILE_PATH)}`);
  await clerk.signIn({ page, emailAddress });
  await page.goto(PROFILE_PATH);

  await expect(page.getByRole("link", { name: DASHBOARD_LINK })).toBeVisible();

  await page.context().storageState({
    path: path.join(setup.info().config.rootDir, ".clerk/user.json"),
  });
});

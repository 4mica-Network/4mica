import path from "node:path";
import { clerk, clerkSetup } from "@clerk/testing/playwright";
import { expect, test as setup } from "@playwright/test";

setup.describe.configure({ mode: "serial" });

setup("configure the Clerk testing token", async () => {
  await clerkSetup();
});

setup("sign in and save the storage state", async ({ page }) => {
  const emailAddress = process.env.E2E_CLERK_USER_EMAIL;

  if (!emailAddress) {
    throw new Error(
      "E2E_CLERK_USER_EMAIL is not set. Add it to apps/dashboard/.env along with CLERK_SECRET_KEY.",
    );
  }

  await page.goto("/sign-in");
  await clerk.signIn({ page, emailAddress });
  await page.goto("/");

  await expect(
    page.getByRole("heading", { level: 1, name: "Overview" }),
  ).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("onboarding")).toHaveCount(0);

  await page.context().storageState({
    path: path.join(setup.info().config.rootDir, ".clerk/user.json"),
  });
});

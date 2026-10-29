import { defineConfig, devices } from "@playwright/test";

const port = 6006;
const baseURL = `http://localhost:${port}`;

export default defineConfig({
  testDir: "./playwright",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  webServer: {
    command: `pnpm storybook --ci -p ${port}`,
    url: `${baseURL}/index.json`,
    reuseExistingServer: true,
    timeout: 180_000,
  },
  projects: [
    {
      name: "storybook",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});

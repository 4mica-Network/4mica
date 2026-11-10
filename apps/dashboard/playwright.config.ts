import { defineConfig, devices } from "@playwright/test";

try {
  process.loadEnvFile(".env");
} catch {}

process.env.CLERK_PUBLISHABLE_KEY ??= process.env.VITE_CLERK_PUBLISHABLE_KEY;

const port = 4173;
const baseURL = `http://localhost:${port}`;
const apiUrl = process.env.VITE_API_URL ?? "http://localhost:4000";
const authFile = "playwright/.clerk/user.json";

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
  webServer: [
    {
      command: "pnpm --filter @4mica/be dev",
      url: `${apiUrl}/health`,
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: `pnpm dev --strictPort --port ${port}`,
      url: `${baseURL}/sign-in`,
      reuseExistingServer: true,
    },
  ],
  projects: [
    { name: "setup", testMatch: /global\.setup\.ts/ },
    {
      name: "public",
      testMatch: /public\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "authenticated",
      testMatch: /authenticated\.spec\.ts/,
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"], storageState: authFile },
    },
  ],
});

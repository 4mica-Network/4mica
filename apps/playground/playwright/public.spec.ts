import { expect, test } from "./fixtures";
import {
  AGENT,
  API,
  HANDLE,
  PROFILE_NAME,
  PROFILE_PATH,
  UNCLAIMED_HANDLE,
} from "./profile";

test("health reports the database as reachable", async ({ request }) => {
  const response = await request.get("/api/health");

  expect(
    response.status(),
    "Postgres must be up and seeded: pnpm db:up && pnpm db:seed",
  ).toBe(200);
  expect(await response.json()).toMatchObject({ status: "ok", db: "ok" });
});

test("root redirects to the marketing site", async ({ request }) => {
  const response = await request.get("/", { maxRedirects: 0 });

  expect(response.status()).toBe(308);
  expect(response.headers().location).toMatch(/^https:\/\/4mica\.io/);
});

test("sign-in page renders and Clerk loads", async ({ page }) => {
  await page.goto("/sign-in");

  await expect(
    page.getByRole("heading", { level: 1, name: "Welcome back" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Continue with Google" }),
  ).toBeEnabled();
  await expect(page).toHaveTitle(/Welcome back/);
});

test("sign-up page renders", async ({ page }) => {
  await page.goto("/sign-up");

  await expect(
    page.getByRole("heading", { level: 1, name: "Join 4Mica" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Continue with Google" }),
  ).toBeEnabled();
});

test("sso-callback page is served", async ({ page }) => {
  const response = await page.goto("/sso-callback");

  expect(response?.status()).toBe(200);
});

test("renders the seeded profile", async ({ page }) => {
  const response = await page.goto(PROFILE_PATH);

  expect(response?.status()).toBe(200);
  await expect(
    page.getByRole("heading", { level: 1, name: PROFILE_NAME }),
  ).toBeVisible();
  await expect(page).toHaveTitle(`${PROFILE_NAME} (@${HANDLE}) · 4Mica`);

  const tabs = page.getByRole("tablist");
  await expect(tabs.getByRole("tab", { name: /Agents/ })).toBeVisible();
  await expect(tabs.getByRole("tab", { name: /APIs/ })).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
});

test("renders the seeded agent", async ({ page }) => {
  const response = await page.goto(`${PROFILE_PATH}/agents/${AGENT.slug}`);

  expect(response?.status()).toBe(200);
  await expect(
    page.getByRole("heading", { level: 1, name: AGENT.name }),
  ).toBeVisible();
  await expect(page).toHaveTitle(`${AGENT.name} · @${HANDLE} · 4Mica`);
});

test("renders the seeded API listing", async ({ page }) => {
  const response = await page.goto(`${PROFILE_PATH}/api/${API.slug}`);

  expect(response?.status()).toBe(200);
  await expect(
    page.getByRole("heading", { level: 1, name: API.name }),
  ).toBeVisible();
  await expect(page).toHaveTitle(`${API.name} · @${HANDLE} · 4Mica`);
});

const MACHINE_ROUTES = [
  `${PROFILE_PATH}/llms.txt`,
  `${PROFILE_PATH}/agents/${AGENT.slug}/x402.json`,
  `${PROFILE_PATH}/api/${API.slug}/x402.json`,
  "/.well-known/x402",
  "/sitemap-profiles.xml",
  "/manifest.webmanifest",
];

for (const route of MACHINE_ROUTES) {
  test(`serves ${route}`, async ({ request }) => {
    const response = await request.get(route);

    expect(response.status()).toBe(200);
  });
}

const HANDLE_REDIRECTS = [`/@${HANDLE}`, `/${HANDLE.toUpperCase()}`];

for (const route of HANDLE_REDIRECTS) {
  test(`redirects ${route} to ${PROFILE_PATH}`, async ({ request }) => {
    const response = await request.get(route, { maxRedirects: 0 });

    expect(response.status()).toBe(308);
    expect(response.headers().location).toMatch(new RegExp(`${PROFILE_PATH}$`));
  });
}

test("offers an unclaimed handle on its 404 page", async ({ page }) => {
  const response = await page.goto(`/${UNCLAIMED_HANDLE}`);

  expect(response?.status()).toBe(404);
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "This profile does not exist… yet.",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: new RegExp(`^Claim /${UNCLAIMED_HANDLE}`) }),
  ).toHaveAttribute("href", "/sign-up");
});

const GENERIC_404_ROUTES = [
  "/admin",
  `${PROFILE_PATH}/nope`,
  `${PROFILE_PATH}/agents/nope`,
  `${PROFILE_PATH}/api/nope`,
];

for (const route of GENERIC_404_ROUTES) {
  test(`shows the generic 404 page for ${route}`, async ({ page }) => {
    const response = await page.goto(route);

    expect(response?.status()).toBe(404);
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "This page does not exist.",
      }),
    ).toBeVisible();
  });
}

test("returns 404 for llms.txt of a missing profile", async ({ request }) => {
  const response = await request.get(`/${UNCLAIMED_HANDLE}/llms.txt`);

  expect(response.status()).toBe(404);
  expect(await response.text()).toContain("Not found");
});

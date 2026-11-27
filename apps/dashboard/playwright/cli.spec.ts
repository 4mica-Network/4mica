import type { APIRequestContext } from "@playwright/test";
import { expect, test } from "./fixtures";

const API = process.env.VITE_API_URL ?? "http://localhost:4000";
const GRANT = "urn:ietf:params:oauth:grant-type:device_code";

interface DeviceCode {
  device_code: string;
  user_code: string;
  verification_uri_complete: string;
}

const startLogin = async (request: APIRequestContext, name: string) => {
  const response = await request.post(`${API}/v1/cli/device/code`, {
    data: { client_name: name },
  });
  expect(response.status()).toBe(200);
  return (await response.json()) as DeviceCode;
};

const poll = (request: APIRequestContext, deviceCode: string) =>
  request.post(`${API}/v1/cli/device/token`, {
    data: { grant_type: GRANT, device_code: deviceCode },
  });

test.describe.configure({ mode: "serial" });

test("approving a CLI sign-in gives that terminal a session, which can be revoked", async ({
  page,
  request,
}) => {
  const name = `e2e-terminal-${Date.now()}`;
  const login = await startLogin(request, name);

  expect((await (await poll(request, login.device_code)).json()).error).toBe(
    "authorization_pending",
  );

  expect(login.verification_uri_complete).toMatch(
    new RegExp(`/cli/authorize\\?code=${login.user_code}$`),
  );
  await page.goto(`/cli/authorize?code=${login.user_code}`);
  await expect(
    page.getByRole("heading", { level: 1, name: "Sign in to the 4Mica CLI" }),
  ).toBeVisible();
  await expect(page.getByTestId("cli-user-code")).toHaveText(login.user_code);
  await expect(page.getByText(name)).toBeVisible();

  await page.getByRole("button", { name: "Approve" }).click();
  await expect(
    page.getByRole("heading", { name: "The CLI is signed in" }),
  ).toBeVisible();

  await page.waitForTimeout(5500);
  const granted = await poll(request, login.device_code);
  expect(granted.status()).toBe(200);
  const token = (await granted.json()).access_token as string;
  expect(token).toMatch(/^4mica_cli_/);

  const whoAmI = await request.get(`${API}/v1/cli/session`, {
    headers: { authorization: `Bearer ${token}` },
  });
  expect(whoAmI.status()).toBe(200);
  expect((await whoAmI.json()).session.name).toBe(name);

  await page.getByRole("link", { name: "Manage CLI sessions" }).click();
  await expect(page).toHaveURL(/\/settings\/developer/);
  const row = page.getByTestId("cli-session").filter({ hasText: name });
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Revoke" }).click();
  await page.getByRole("button", { name: "Revoke" }).last().click();
  await expect(page.getByText(name)).toHaveCount(0);

  const afterRevoke = await request.get(`${API}/v1/cli/session`, {
    headers: { authorization: `Bearer ${token}` },
  });
  expect(afterRevoke.status()).toBe(401);
});

test("denying a CLI sign-in gives the terminal nothing", async ({
  page,
  request,
}) => {
  const login = await startLogin(request, `e2e-denied-${Date.now()}`);

  await page.goto(`/cli/authorize?code=${login.user_code}`);
  await page.getByRole("button", { name: "Deny" }).click();
  await expect(
    page.getByRole("heading", { name: "Sign-in denied" }),
  ).toBeVisible();

  const response = await poll(request, login.device_code);
  expect(response.status()).toBe(400);
  expect((await response.json()).error).toBe("access_denied");
});

test("a code nobody is waiting on is refused, and another can be typed", async ({
  page,
  request,
}) => {
  await page.goto("/cli/authorize?code=BBBB-BBBB");
  await expect(
    page.getByRole("heading", {
      name: "Code not found",
    }),
  ).toBeVisible();

  const login = await startLogin(request, `e2e-typed-${Date.now()}`);
  await page.getByRole("button", { name: "Enter another code" }).click();
  await page
    .getByRole("textbox", { name: "One-time code" })
    .fill(login.user_code.toLowerCase().replace("-", " "));
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByTestId("cli-user-code")).toHaveText(login.user_code);
  await page.getByRole("button", { name: "Deny" }).click();
});

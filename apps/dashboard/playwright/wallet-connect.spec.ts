import path from "node:path";
import type { Page } from "@playwright/test";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { expect, test } from "./fixtures";

interface FakeWallet {
  id: string;
  name?: string;
  legacy?: boolean;
  late?: boolean;
  accounts?: string[];
  onConnect?: string[];
  connect?: "ok" | "empty" | "reject" | "fail";
  permissions?: "reject" | "unsupported" | string[];
  chainId?: number;
  sign?: "ok" | "reject";
}

interface WalletHandle {
  calls: string[];
  announce: () => void;
  setAccounts: (accounts: string[]) => void;
}

type WalletWindow = Window & {
  ethereum?: unknown;
  __wallets: Record<string, WalletHandle>;
  __walletSign: (address: string, message: string) => Promise<string>;
};

const signers = new Map<string, ReturnType<typeof privateKeyToAccount>>();

const newAccount = () => {
  const account = privateKeyToAccount(generatePrivateKey());
  signers.set(account.address.toLowerCase(), account);
  return account.address;
};

const shotDir = process.env.WALLET_SHOT_DIR;

const shot = async (page: Page, name: string) => {
  if (shotDir) {
    await page
      .getByTestId("create-wallet-panel")
      .screenshot({ path: path.join(shotDir, `${name}.png`) });
  }
};

const installWallets = async (page: Page, wallets: FakeWallet[]) => {
  await page.exposeFunction(
    "__walletSign",
    (address: string, message: string) => {
      const signer = signers.get(address.toLowerCase());
      if (!signer) {
        throw new Error(`No test key for ${address}`);
      }
      return signer.signMessage({ message: { raw: message as `0x${string}` } });
    },
  );

  await page.addInitScript((configs: FakeWallet[]) => {
    const scope = window as unknown as WalletWindow;
    const rpcError = (code: number, message: string) =>
      Object.assign(new Error(message), { code });
    scope.__wallets = {};

    for (const config of configs) {
      const listeners: Record<string, ((payload: unknown) => void)[]> = {};
      const calls: string[] = [];
      let accounts = (config.accounts ?? []).map((a) => a.toLowerCase());
      let chainId = config.chainId ?? 84532;

      const emit = (event: string, payload: unknown) => {
        for (const listener of listeners[event] ?? []) {
          listener(payload);
        }
      };

      const provider = {
        async request({
          method,
          params,
        }: {
          method: string;
          params?: unknown[];
        }) {
          calls.push(method);
          switch (method) {
            case "eth_accounts":
              return accounts;
            case "eth_chainId":
              return `0x${chainId.toString(16)}`;
            case "eth_requestAccounts":
              if (config.connect === "reject") {
                throw rpcError(4001, "User rejected the request.");
              }
              if (config.connect === "fail") {
                throw rpcError(-32000, "Wallet is busy.");
              }
              if (config.connect === "empty") {
                return [];
              }
              if (accounts.length === 0) {
                accounts = (config.onConnect ?? []).map((a) => a.toLowerCase());
              }
              return accounts;
            case "wallet_requestPermissions":
              if (config.permissions === "reject") {
                throw rpcError(4001, "User rejected the request.");
              }
              if (config.permissions === "unsupported") {
                throw rpcError(-32601, "Method not found.");
              }
              if (Array.isArray(config.permissions)) {
                accounts = config.permissions.map((a) => a.toLowerCase());
              }
              return [{ parentCapability: "eth_accounts" }];
            case "wallet_switchEthereumChain": {
              const [target] = params as [{ chainId: string }];
              chainId = Number.parseInt(target.chainId, 16);
              emit("chainChanged", target.chainId);
              return null;
            }
            case "personal_sign": {
              if (config.sign === "reject") {
                throw rpcError(4001, "User denied message signature.");
              }
              const [message, address] = params as [string, string];
              return scope.__walletSign(address, message);
            }
            default:
              throw rpcError(-32601, `Unsupported method ${method}`);
          }
        },
        on(event: string, listener: (payload: unknown) => void) {
          listeners[event] = [...(listeners[event] ?? []), listener];
        },
        removeListener(event: string, listener: (payload: unknown) => void) {
          listeners[event] = (listeners[event] ?? []).filter(
            (entry) => entry !== listener,
          );
        },
      };

      const announce = () => {
        window.dispatchEvent(
          new CustomEvent("eip6963:announceProvider", {
            detail: Object.freeze({
              info: {
                uuid: `uuid-${config.id}`,
                rdns: config.id,
                name: config.name,
                icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 8 8'%3E%3Crect width='8' height='8' fill='%23f60'/%3E%3C/svg%3E",
              },
              provider,
            }),
          }),
        );
      };

      scope.__wallets[config.id] = {
        calls,
        announce,
        setAccounts: (next) => {
          accounts = next.map((a) => a.toLowerCase());
          emit("accountsChanged", accounts);
        },
      };

      if (config.legacy) {
        scope.ethereum = provider;
      }
      if (config.name && !config.late) {
        window.addEventListener("eip6963:requestProvider", announce);
        announce();
      }
    }
  }, wallets);
};

const openModal = async (page: Page) => {
  await page.goto("/wallet");
  await page
    .getByTestId("wallet-create-button")
    .or(page.getByTestId("wallet-empty-create"))
    .first()
    .click();
  await expect(page.getByTestId("create-wallet-panel")).toBeVisible();
};

const callsOf = (page: Page, id: string) =>
  page.evaluate(
    (walletId) => (window as unknown as WalletWindow).__wallets[walletId].calls,
    id,
  );

const connectButtons = (page: Page) =>
  page.getByTestId("create-wallet-connect");
const shownAddress = (page: Page) => page.getByTestId("create-wallet-address");
const continueButton = (page: Page) =>
  page.getByTestId("create-wallet-continue");
const alerts = (page: Page) =>
  page.getByTestId("create-wallet-panel").getByRole("alert");

const removeWallet = async (page: Page, id: string) => {
  await page.getByTestId(`wallet-more-${id}`).click();
  await page.getByTestId(`wallet-delete-${id}`).click();
  await page.getByTestId("delete-wallet-confirm-popup-confirm").click();
  await expect(page.getByTestId(`wallet-row-${id}`)).toHaveCount(0);
};

const finishLinking = async (page: Page) => {
  await continueButton(page).click();
  await expect(page.getByLabel("Name")).not.toHaveValue("");

  const created = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname.endsWith("/me/wallets"),
  );
  await page.getByTestId("create-wallet-submit").click();
  return created;
};

test.describe("add a wallet: connecting", () => {
  test("with no wallet installed it offers install links instead of a connect button", async ({
    page,
  }) => {
    await openModal(page);

    await expect(
      page.getByText("No browser wallet detected. Install one to continue."),
    ).toBeVisible();
    await expect(connectButtons(page)).toHaveCount(0);
    await expect(page.getByRole("link", { name: "MetaMask" })).toHaveAttribute(
      "href",
      "https://metamask.io/download",
    );
    await expect(page.getByRole("link", { name: "Rabby" })).toHaveAttribute(
      "href",
      "https://rabby.io",
    );
    await expect(continueButton(page)).toBeDisabled();
    await shot(page, "01-no-wallet");
  });

  test("an injected provider that shares no account is not reported as a dismissal", async ({
    page,
  }) => {
    await installWallets(page, [
      { id: "legacy", legacy: true, connect: "empty" },
    ]);
    await openModal(page);

    await expect(connectButtons(page)).toHaveCount(1);
    await expect(connectButtons(page)).toHaveText("Connect wallet");
    await expect(connectButtons(page)).toHaveClass(/btn-invert/);
    await connectButtons(page).click();

    await expect(alerts(page)).toHaveText(
      "Your wallet didn't share an account. Unlock it or finish setting it up, then try again.",
    );
    await expect(page.getByText("You dismissed the request")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "MetaMask" })).toBeVisible();
    await expect(continueButton(page)).toBeDisabled();
    await expect(connectButtons(page)).toBeEnabled();
    await shot(page, "02-no-accounts");
  });

  test("rejecting the connection says so and lets the user retry", async ({
    page,
  }) => {
    await installWallets(page, [
      { id: "legacy", legacy: true, connect: "reject" },
    ]);
    await openModal(page);
    await connectButtons(page).click();

    await expect(alerts(page)).toHaveText(
      "You dismissed the request, so nothing was added.",
    );
    await expect(connectButtons(page)).toBeEnabled();
    await expect(continueButton(page)).toBeDisabled();
  });

  test("an unexpected wallet error is reported as unreachable", async ({
    page,
  }) => {
    await installWallets(page, [
      { id: "legacy", legacy: true, connect: "fail" },
    ]);
    await openModal(page);
    await connectButtons(page).click();

    await expect(alerts(page)).toHaveText(
      "Couldn't reach your wallet. Try again.",
    );
    await expect(connectButtons(page)).toBeEnabled();
  });

  test("a single announced wallet is offered by name and connects", async ({
    page,
  }) => {
    const address = newAccount();
    await installWallets(page, [
      {
        id: "io.rabby",
        name: "Rabby Wallet",
        legacy: true,
        onConnect: [address],
      },
    ]);
    await openModal(page);

    await expect(connectButtons(page)).toHaveCount(1);
    await expect(connectButtons(page)).toHaveText("Connect Rabby Wallet");
    await expect(connectButtons(page).locator("img")).toBeVisible();
    await shot(page, "05-one-wallet");

    const [buttonColor, continueColor] = await Promise.all([
      connectButtons(page).evaluate(
        (node) => getComputedStyle(node).backgroundColor,
      ),
      continueButton(page).evaluate(
        (node) => getComputedStyle(node).backgroundColor,
      ),
    ]);
    expect(buttonColor).toBe(continueColor);

    await connectButtons(page).click();

    await expect(shownAddress(page)).toHaveText(address);
    await expect(
      page.getByTestId("create-wallet-body").getByText("Base Sepolia").first(),
    ).toBeVisible();
    await expect(continueButton(page)).toBeEnabled();
    await expect(alerts(page)).toHaveCount(0);
    await shot(page, "05-connected");
  });

  test("with several wallets each gets a button and the picked one is used", async ({
    page,
  }) => {
    const first = newAccount();
    const second = newAccount();
    await installWallets(page, [
      { id: "io.metamask", name: "MetaMask", legacy: true, onConnect: [first] },
      { id: "app.phantom", name: "Phantom", onConnect: [second] },
    ]);
    await openModal(page);

    await expect(connectButtons(page)).toHaveCount(2);
    await expect(connectButtons(page).nth(0)).toHaveText("Connect MetaMask");
    await expect(connectButtons(page).nth(1)).toHaveText("Connect Phantom");
    await shot(page, "06-two-wallets");

    await connectButtons(page).nth(1).click();

    await expect(shownAddress(page)).toHaveText(second);
    expect(await callsOf(page, "io.metamask")).not.toContain(
      "eth_requestAccounts",
    );
  });

  test("a wallet that announces after the modal opened still shows up", async ({
    page,
  }) => {
    const address = newAccount();
    await installWallets(page, [
      { id: "io.late", name: "Latecomer", late: true, onConnect: [address] },
    ]);
    await openModal(page);
    await expect(connectButtons(page)).toHaveCount(0);

    await page.evaluate(() =>
      (window as unknown as WalletWindow).__wallets["io.late"].announce(),
    );

    await expect(connectButtons(page)).toHaveText("Connect Latecomer");
    await connectButtons(page).click();
    await expect(shownAddress(page)).toHaveText(address);
  });

  test("an account the site may already see is adopted without a click", async ({
    page,
  }) => {
    const address = newAccount();
    await installWallets(page, [
      {
        id: "io.rabby",
        name: "Rabby Wallet",
        legacy: true,
        accounts: [address],
      },
    ]);
    await openModal(page);

    await expect(shownAddress(page)).toHaveText(address);
    await expect(connectButtons(page)).toHaveCount(0);
    expect(await callsOf(page, "io.rabby")).not.toContain(
      "eth_requestAccounts",
    );
  });

  test("reopening the modal starts clean after a failed attempt", async ({
    page,
  }) => {
    await installWallets(page, [
      { id: "legacy", legacy: true, connect: "reject" },
    ]);
    await openModal(page);
    await connectButtons(page).click();
    await expect(alerts(page)).toHaveCount(1);

    await page.getByTestId("create-wallet-close").click();
    await expect(page.getByTestId("create-wallet-panel")).toHaveCount(0);
    await page
      .getByTestId("wallet-create-button")
      .or(page.getByTestId("wallet-empty-create"))
      .first()
      .click();

    await expect(page.getByTestId("create-wallet-panel")).toBeVisible();
    await expect(alerts(page)).toHaveCount(0);
  });
});

test.describe("add a wallet: switching account and network", () => {
  test("switch account moves to the newly shared account and offers both", async ({
    page,
  }) => {
    const first = newAccount();
    const second = newAccount();
    await installWallets(page, [
      {
        id: "io.metamask",
        name: "MetaMask",
        legacy: true,
        accounts: [first],
        // Like MetaMask: the previously selected account stays first.
        permissions: [first, second],
      },
    ]);
    await openModal(page);
    await expect(shownAddress(page)).toHaveText(first);

    await page.getByTestId("create-wallet-switch-account").click();

    await expect(shownAddress(page)).toHaveText(second);
    await expect(
      page.getByTestId(`create-wallet-account-${second}`),
    ).toHaveAttribute("aria-pressed", "true");
    await shot(page, "10-switched-account");

    await page.getByTestId(`create-wallet-account-${first}`).click();
    await expect(shownAddress(page)).toHaveText(first);
    await expect(continueButton(page)).toBeEnabled();
  });

  test("switch account explains itself when the wallet stays put, then follows the wallet", async ({
    page,
  }) => {
    const first = newAccount();
    const second = newAccount();
    await installWallets(page, [
      // Like Rabby: the permission request changes nothing.
      { id: "io.rabby", name: "Rabby Wallet", legacy: true, accounts: [first] },
    ]);
    await openModal(page);
    await expect(shownAddress(page)).toHaveText(first);

    await page.getByTestId("create-wallet-switch-account").click();

    await expect(page.getByTestId("create-wallet-same-account")).toHaveText(
      "Your wallet is still on this account. Choose another account in your wallet extension and it will update here.",
    );
    await expect(shownAddress(page)).toHaveText(first);
    await shot(page, "11-same-account");

    await page.evaluate(
      (next) =>
        (window as unknown as WalletWindow).__wallets["io.rabby"].setAccounts([
          next,
        ]),
      second,
    );

    await expect(shownAddress(page)).toHaveText(second);
    await expect(page.getByTestId("create-wallet-same-account")).toHaveCount(0);
  });

  test("switch account works when the wallet has no permission prompt", async ({
    page,
  }) => {
    const first = newAccount();
    await installWallets(page, [
      {
        id: "legacy",
        legacy: true,
        accounts: [first],
        permissions: "unsupported",
      },
    ]);
    await openModal(page);
    await expect(shownAddress(page)).toHaveText(first);

    await page.getByTestId("create-wallet-switch-account").click();

    await expect(page.getByTestId("create-wallet-same-account")).toBeVisible();
    await expect(alerts(page)).toHaveCount(0);
  });

  test("rejecting the account switch keeps the current account", async ({
    page,
  }) => {
    const first = newAccount();
    await installWallets(page, [
      { id: "legacy", legacy: true, accounts: [first], permissions: "reject" },
    ]);
    await openModal(page);
    await expect(shownAddress(page)).toHaveText(first);

    await page.getByTestId("create-wallet-switch-account").click();

    await expect(alerts(page)).toHaveText(
      "You dismissed the request, so nothing was added.",
    );
    await expect(shownAddress(page)).toHaveText(first);
    await expect(continueButton(page)).toBeEnabled();
  });

  test("the wallet disconnecting returns to the connect button", async ({
    page,
  }) => {
    const first = newAccount();
    await installWallets(page, [
      { id: "io.rabby", name: "Rabby Wallet", legacy: true, accounts: [first] },
    ]);
    await openModal(page);
    await expect(shownAddress(page)).toHaveText(first);

    await page.evaluate(() =>
      (window as unknown as WalletWindow).__wallets["io.rabby"].setAccounts([]),
    );

    await expect(shownAddress(page)).toHaveCount(0);
    await expect(connectButtons(page)).toHaveText("Connect Rabby Wallet");
    await expect(continueButton(page)).toBeDisabled();
  });

  test("an unsupported network is flagged and can be switched", async ({
    page,
  }) => {
    const address = newAccount();
    await installWallets(page, [
      {
        id: "io.rabby",
        name: "Rabby Wallet",
        legacy: true,
        accounts: [address],
        chainId: 137,
      },
    ]);
    await openModal(page);

    await expect(page.getByText("Unsupported network")).toBeVisible();
    await shot(page, "14-unsupported-network");

    await page.getByTestId("create-wallet-network-BASE").click();

    await expect(page.getByText("Unsupported network")).toHaveCount(0);
    await expect(
      page.getByTestId("create-wallet-network-BASE"),
    ).toHaveAttribute("aria-pressed", "true");
    expect(await callsOf(page, "io.rabby")).toContain(
      "wallet_switchEthereumChain",
    );
  });
});

test.describe("add a wallet: signing", () => {
  test("links a wallet end to end through the wallet that was picked", async ({
    page,
  }) => {
    const other = newAccount();
    const address = newAccount();
    await installWallets(page, [
      { id: "io.metamask", name: "MetaMask", legacy: true, onConnect: [other] },
      { id: "app.phantom", name: "Phantom", onConnect: [address] },
    ]);
    await openModal(page);
    await connectButtons(page).nth(1).click();
    await expect(shownAddress(page)).toHaveText(address);

    const response = await finishLinking(page);

    expect(response.status()).toBe(201);
    const { id } = (await response.json()) as { id: string };
    await expect(page.getByTestId("create-wallet-panel")).toHaveCount(0);
    await expect(page.getByTestId(`wallet-row-${id}`)).toBeVisible();
    expect(await callsOf(page, "app.phantom")).toContain("personal_sign");
    expect(await callsOf(page, "io.metamask")).not.toContain("personal_sign");

    await removeWallet(page, id);
  });

  test("links the account chosen here even when it is not the wallet's first", async ({
    page,
  }) => {
    const first = newAccount();
    const second = newAccount();
    await installWallets(page, [
      {
        id: "io.metamask",
        name: "MetaMask",
        legacy: true,
        accounts: [first],
        permissions: [first, second],
      },
    ]);
    await openModal(page);
    await page.getByTestId("create-wallet-switch-account").click();
    await expect(shownAddress(page)).toHaveText(second);

    const response = await finishLinking(page);

    expect(response.status()).toBe(201);
    const body = (await response.json()) as { id: string; address: string };
    expect(body.address.toLowerCase()).toBe(second.toLowerCase());
    await expect(page.getByTestId(`wallet-row-${body.id}`)).toBeVisible();

    await removeWallet(page, body.id);
  });

  test("rejecting the signature adds nothing and keeps the modal open", async ({
    page,
  }) => {
    const address = newAccount();
    await installWallets(page, [
      {
        id: "io.rabby",
        name: "Rabby Wallet",
        legacy: true,
        accounts: [address],
        sign: "reject",
      },
    ]);
    let created = false;
    page.on("response", (response) => {
      if (
        response.request().method() === "POST" &&
        new URL(response.url()).pathname.endsWith("/me/wallets")
      ) {
        created = true;
      }
    });
    await openModal(page);
    await expect(shownAddress(page)).toHaveText(address);

    await continueButton(page).click();
    await page.getByTestId("create-wallet-submit").click();

    await expect(alerts(page)).toHaveText(
      "You dismissed the signature request, so nothing was linked.",
    );
    await expect(page.getByTestId("create-wallet-panel")).toBeVisible();
    await expect(page.getByTestId("create-wallet-submit")).toBeEnabled();
    expect(created).toBe(false);
    await shot(page, "17-signature-rejected");
  });

  test("refuses to sign when the wallet moved to another account mid-flow", async ({
    page,
  }) => {
    const address = newAccount();
    const elsewhere = newAccount();
    await installWallets(page, [
      { id: "legacy", legacy: true, accounts: [address] },
    ]);
    await openModal(page);
    await expect(shownAddress(page)).toHaveText(address);
    await continueButton(page).click();
    await expect(page.getByTestId("create-wallet-submit")).toBeVisible();

    // The wallet changes account without telling the page.
    await page.evaluate((next) => {
      const scope = window as unknown as WalletWindow & {
        ethereum: { request: (args: { method: string }) => Promise<unknown> };
      };
      const original = scope.ethereum.request.bind(scope.ethereum);
      scope.ethereum.request = (args) =>
        args.method === "eth_accounts"
          ? Promise.resolve([next.toLowerCase()])
          : original(args);
    }, elsewhere);

    await page.getByTestId("create-wallet-submit").click();

    await expect(alerts(page)).toContainText("different account");
    expect(await callsOf(page, "legacy")).not.toContain("personal_sign");
  });
});

import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { privateKeyToAccount } from "viem/accounts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runScript } from "../core/runner.js";
import { EXIT } from "../errors.js";
import { runCommand } from "../test/run.js";
import { pinJson } from "../test/shape.js";
import Balance from "./balance.js";
import ConfigGet from "./config/get.js";
import ConfigSet from "./config/set.js";
import Cycles from "./cycles/index.js";
import Dashboard from "./dashboard.js";
import Dev from "./dev.js";
import GuaranteesVerify from "./guarantees/verify.js";
import Help from "./help.js";
import Networks from "./networks.js";
import Payments from "./payments.js";
import Status from "./status.js";
import Tokens from "./tokens.js";

// The commands that only read: what they print, what they return with
// --json, and how they fail.

const USDC = {
  symbol: "USDC",
  address: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  decimals: 6,
};
const WALLET = "0x00000000000000000000000000000000000000AA";
const usdc = {
  asset: USDC,
  total: "10",
  locked: "2.5",
  available: "7.5",
  raw: { total: 10_000_000n, locked: 2_500_000n, available: 7_500_000n },
};
const received = [
  {
    userAddress: "0x00000000000000000000000000000000000000B1",
    amount: 100_000n,
    verified: true,
    finalized: false,
    failed: false,
    createdAt: 1_767_225_600_000,
    txHash: "0xolder",
  },
  {
    userAddress: "0x00000000000000000000000000000000000000B2",
    amount: 250_000n,
    verified: true,
    finalized: true,
    failed: false,
    createdAt: 1_767_229_200_000,
    txHash: "0xnewer",
  },
];

const held = { native: 10n ** 18n, usdc: 5_000_000n };
const payment = {
  listReceived: vi.fn(),
  activeCycle: vi.fn(),
  checkpointBatch: vi.fn(),
};
const client = {
  address: WALLET,
  balance: vi.fn(),
  close: vi.fn(),
  lowLevel: async () => ({
    payment,
    tokens: { supported: async () => ({ tokens: [USDC] }) },
    ctx: {
      gateway: async () => ({
        nativeBalance: async () => held.native,
        erc20Balance: async () => held.usdc,
      }),
    },
  }),
};

vi.mock("../core/session.js", async (original) => ({
  ...(await original<typeof import("../core/session.js")>()),
  withSession: (_settings: unknown, use: (c: typeof client) => unknown) =>
    use(client),
  connect: async () => client,
}));
vi.mock("../core/runner.js", async (original) => ({
  ...(await original<typeof import("../core/runner.js")>()),
  openBrowser: vi.fn(),
  runScript: vi.fn(),
}));

/** Core and the facilitator, as far as these commands ask them. */
const answers: Record<string, () => Response> = {};
const net = vi.fn<typeof fetch>(async (input) => {
  const { pathname } = new URL(String(input));
  const answer = answers[pathname];
  return answer
    ? answer()
    : new Response(JSON.stringify({ error: `no route ${pathname}` }), {
        status: 404,
      });
});
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
const refused = () =>
  Object.assign(new TypeError("fetch failed"), {
    cause: { code: "ECONNREFUSED" },
  });

/** A key file for the commands that say more with a wallet in use. */
async function keyFile(): Promise<string> {
  const path = join(await mkdtemp(join(tmpdir(), "4mica-key-")), "w.key");
  await writeFile(path, `0x${"11".repeat(32)}`, { mode: 0o600 });
  return path;
}

beforeEach(() => {
  process.exitCode = undefined;
  Object.assign(held, { native: 10n ** 18n, usdc: 5_000_000n });
  for (const path of Object.keys(answers)) delete answers[path];
  answers["/core/health"] = () => json({ status: "ok" });
  answers["/health"] = () => json({ status: "ok" });
  answers["/supported"] = () =>
    json({ kinds: [{ scheme: "4mica-credit", network: "eip155:84532" }] });
  answers["/core/tokens"] = () => json({ chain_id: 84532, tokens: [USDC] });
  globalThis.fetch = net;
  client.balance.mockImplementation(async (asset?: string) =>
    asset ? usdc : { USDC: usdc },
  );
  payment.listReceived.mockResolvedValue(received);
  payment.activeCycle.mockResolvedValue({
    cycleIdText: `${USDC.address.toLowerCase()}:1767225600`,
    cycleId: `0x${"ab".repeat(32)}`,
    periodStart: 1_767_225_600,
    periodEnd: 1_767_312_000,
  });
  payment.checkpointBatch.mockResolvedValue({
    authorizations: [{}, {}],
    maxUncheckpointed: 50,
  });
});
afterEach(() => {
  process.exitCode = undefined;
  vi.clearAllMocks();
});

describe("networks", () => {
  it("lists every network and says which is the default", async () => {
    const { stderr, json: networks } = await runCommand(Networks, ["--json"]);
    expect(stderr).toContain("default: base-sepolia");
    const list = networks as { name: string; default: boolean }[];
    expect(list.filter((n) => n.default).map((n) => n.name)).toEqual([
      "base-sepolia",
    ]);
    expect(net).not.toHaveBeenCalled();
    pinJson("networks", networks);
  });

  it("prints one line a network, with its kind", async () => {
    const { stdout } = await runCommand(Networks, []);
    const [header, ...rows] = stdout.split("\n");
    expect(header).toMatch(/^NAME\s+CHAIN\s+KIND/);
    expect(rows.find((row) => row.startsWith("base "))).toContain("mainnet");
  });
});

describe("tokens", () => {
  it("lists what core accepts, without a wallet", async () => {
    const { stdout } = await runCommand(Tokens, []);
    expect(stdout).toContain(`USDC    ${USDC.address}  6`);
    const { json: tokens } = await runCommand(Tokens, ["--json"]);
    expect(tokens).toMatchObject({
      network: "base-sepolia",
      chainId: 84532,
      tokens: [USDC],
    });
    pinJson("tokens", tokens);
  });

  it("reports a core that does not answer, by host", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw refused();
    });
    const { error } = await runCommand(Tokens, []);
    expect(error).toMatchObject({
      code: "UNREACHABLE",
      oclif: { exit: EXIT.failure },
    });
    expect(error?.message).toContain("https://base.sepolia.api.4mica.io");
  });
});

describe("balance", () => {
  it("shows every asset, and names the network", async () => {
    const { stdout, stderr } = await runCommand(Balance, []);
    expect(stdout).toMatch(/USDC\s+10\s+2\.5\s+7\.5/);
    expect(stderr).toContain("network: base-sepolia");
    const { json: balances } = await runCommand(Balance, ["--json"]);
    expect(balances).toMatchObject([
      { asset: USDC, available: "7.5", network: "base-sepolia" },
    ]);
    pinJson("balance", balances);
  });

  it("returns a list for one asset too", async () => {
    const { json: balances } = await runCommand(Balance, ["USDC", "--json"]);
    expect(client.balance).toHaveBeenCalledWith("USDC");
    expect(balances).toHaveLength(1);
  });

  it("says so when the wallet has no collateral", async () => {
    client.balance.mockResolvedValue({});
    const { stderr, json: balances } = await runCommand(Balance, ["--json"]);
    expect(balances).toEqual([]);
    expect(stderr).toContain("no collateral on base-sepolia");
  });
});

describe("payments", () => {
  it("lists what the wallet was paid, newest first", async () => {
    const { json: payments } = await runCommand(Payments, ["--json"]);
    expect((payments as { txHash: string }[]).map((p) => p.txHash)).toEqual([
      "0xnewer",
      "0xolder",
    ]);
    expect(payments).toMatchObject([
      // Core's time is in milliseconds: this is 2026, not the year 57983.
      {
        state: "finalized",
        amountRaw: "250000",
        createdAt: "2026-01-01T01:00:00.000Z",
      },
      { state: "verified", amountRaw: "100000" },
    ]);
    pinJson("payments", payments);
  });

  it("filters by state and keeps the newest n", async () => {
    const verified = await runCommand(Payments, [
      "--state",
      "verified",
      "--json",
    ]);
    expect(verified.json).toMatchObject([{ txHash: "0xolder" }]);
    const one = await runCommand(Payments, ["--limit", "1", "--json"]);
    expect(one.json).toMatchObject([{ txHash: "0xnewer" }]);
  });

  it("refuses a state there is no such thing as", async () => {
    const { error } = await runCommand(Payments, ["--state", "paid"]);
    expect(error).toMatchObject({
      code: "BAD_FLAG_VALUE",
      oclif: { exit: EXIT.usage },
    });
    expect(payment.listReceived).not.toHaveBeenCalled();
  });
});

describe("cycles", () => {
  it("shows the open cycle of each asset and what is unconfirmed", async () => {
    const { stdout } = await runCommand(Cycles, ["--asset", "USDC"]);
    expect(stdout).toContain("2 of 50");
    const { json: cycles } = await runCommand(Cycles, [
      "--asset",
      "USDC",
      "--json",
    ]);
    expect(cycles).toMatchObject([
      { asset: "USDC", unconfirmed: 2, unconfirmedLimit: 50 },
    ]);
    pinJson("cycles", cycles);
  });
});

describe("status", () => {
  it("reports core and the facilitator up, and what the facilitator takes", async () => {
    const { stdout } = await runCommand(Status, []);
    expect(stdout).toMatch(/core\s+\S+\s+up/);
    expect(stdout).toMatch(/facilitator\s+\S+\s+up\s+4mica-credit on/);
    const { json: status } = await runCommand(Status, ["--json"]);
    expect(process.exitCode).toBeUndefined();
    expect(status).toMatchObject({
      network: "base-sepolia",
      core: { up: true },
      facilitator: { up: true, schemes: ["4mica-credit on eip155:84532"] },
    });
    // No wallet in use, so nothing was asked about one.
    expect((status as { wallet?: unknown }).wallet).toBeUndefined();
    pinJson("status", status);
  });

  it("exits 1 when core does not answer, and still prints the table", async () => {
    globalThis.fetch = vi.fn(async (input) => {
      if (String(input).includes("/core/health")) throw refused();
      return net(input);
    });
    const { stdout, error } = await runCommand(Status, []);
    expect(error).toBeUndefined();
    expect(process.exitCode).toBe(EXIT.failure);
    expect(stdout).toMatch(/core\s+\S+\s+down\s+ECONNREFUSED/);
    const { json: status } = await runCommand(Status, ["--json"]);
    expect(status).toMatchObject({
      core: { up: false, detail: "ECONNREFUSED" },
    });
  });

  it("says whether the wallet in use is funded and has collateral", async () => {
    const { json: status } = await runCommand(Status, [
      "--key-file",
      await keyFile(),
      "--json",
    ]);
    expect(status).toMatchObject({
      wallet: {
        address: WALLET,
        holds: ["1 ETH", "5 USDC"],
        collateral: ["7.5 USDC"],
      },
      local: expect.arrayContaining([
        expect.objectContaining({ check: "key file", ok: true }),
      ]),
    });
    expect(process.exitCode).toBeUndefined();
    pinJson("status", status, "with a wallet");
  });

  it("flags a key file other users can read, without failing", async () => {
    const path = join(await mkdtemp(join(tmpdir(), "4mica-key-")), "w.key");
    await writeFile(path, `0x${"11".repeat(32)}`, { mode: 0o644 });
    const { json: status } = await runCommand(Status, [
      "--key-file",
      path,
      "--json",
    ]);
    expect(status).toMatchObject({
      local: expect.arrayContaining([
        expect.objectContaining({ check: "key file", ok: false }),
      ]),
    });
    expect(process.exitCode).toBeUndefined();
  });
});

describe("guarantees verify", () => {
  // The operator that signs receipts, and the registry it signs for.
  const operator = privateKeyToAccount(`0x${"24".repeat(32)}`);
  const registry = "0x0000000000000000000000000000000000065E61";
  const params = (signer: string | null = operator.address) => ({
    guarantee_signer: signer,
    contract_address: "0x00000000000000000000000000000000C04E4a1c",
    guarantee_registry_address: signer && registry,
    clearing_house_address: "0x00000000000000000000000000000000C1ea4111",
    eip712_name: "4micaClearingHouse",
    eip712_version: "1",
    chain_id: 84532,
    supported_payment_payload_versions: [1],
    validators: [],
  });

  /** A receipt signed by `signer`, in a file, as a seller would hold it. */
  async function receiptFile(signer = operator): Promise<string> {
    const { Guarantee, GuaranteeReceipt, guaranteeRegistryDomain } =
      await import("@4mica/sdk");
    const guarantee = new Guarantee({
      cycleId: 7n,
      reqId: 42n,
      client: "0x00000000000000000000000000000000000000B1",
      recipient: WALLET,
      amount: 100_000n,
      asset: USDC.address,
      timestamp: 1_767_225_600,
    });
    const signature = await signer.sign({
      hash: guarantee.signingDigest(guaranteeRegistryDomain(84532, registry)),
    });
    const receipt = GuaranteeReceipt.new(guarantee, signature);
    const path = join(await mkdtemp(join(tmpdir(), "4mica-rcpt-")), "r.json");
    await writeFile(path, JSON.stringify(receipt));
    return path;
  }

  it("accepts a receipt the network's signer signed, without a wallet", async () => {
    answers["/core/public-params"] = () => json(params());
    const receipt = await receiptFile();
    const { stdout } = await runCommand(GuaranteesVerify, [receipt]);
    expect(stdout).toContain(`genuine: yes, signed by ${operator.address}`);
    const { json: checked } = await runCommand(GuaranteesVerify, [
      receipt,
      "--json",
    ]);
    expect(checked).toMatchObject({
      genuine: true,
      recipient: WALLET,
      amountRaw: "100000",
      reqId: "42",
    });
    pinJson("guarantees verify", checked);
  });

  it("exits 1 for a receipt someone else signed", async () => {
    answers["/core/public-params"] = () => json(params());
    const forger = privateKeyToAccount(`0x${"25".repeat(32)}`);
    const { error } = await runCommand(GuaranteesVerify, [
      await receiptFile(forger),
    ]);
    expect(error).toMatchObject({ oclif: { exit: EXIT.failure } });
    expect(error?.code).toMatch(/RECEIPT|SIGNER/);
  });

  it("refuses a file that is not JSON before asking core anything", async () => {
    const path = join(await mkdtemp(join(tmpdir(), "4mica-rcpt-")), "r.json");
    await writeFile(path, "not json");
    const { error } = await runCommand(GuaranteesVerify, [path]);
    expect(error).toMatchObject({
      code: "BAD_RECEIPT",
      oclif: { exit: EXIT.usage },
    });
    expect(net).not.toHaveBeenCalled();
  });

  it("says so when the network publishes no signer", async () => {
    answers["/core/public-params"] = () => json(params(null));
    const { error } = await runCommand(GuaranteesVerify, [await receiptFile()]);
    expect(error).toMatchObject({ code: "NO_GUARANTEE_SIGNER" });
  });
});

describe("config get", () => {
  it("prints a setting that is in the file", async () => {
    const home = await mkdtemp(join(tmpdir(), "4mica-cli-"));
    await runCommand(ConfigSet, ["asset", "USDC"], home);
    const { stdout } = await runCommand(ConfigGet, ["asset"], home);
    expect(stdout).toBe("USDC");
    const { json: got } = await runCommand(
      ConfigGet,
      ["asset", "--json"],
      home,
    );
    expect(got).toEqual({ key: "asset", value: "USDC" });
    pinJson("config get", got);
  });

  it("exits 1 for a setting that is not in the file", async () => {
    const { error } = await runCommand(ConfigGet, ["asset"]);
    expect(error).toMatchObject({
      code: "SETTING_NOT_SET",
      oclif: { exit: EXIT.failure },
    });
  });

  it("exits 2 for a setting there is no such thing as", async () => {
    const { error } = await runCommand(ConfigGet, ["colour"]);
    expect(error).toMatchObject({
      code: "UNKNOWN_SETTING",
      oclif: { exit: EXIT.usage },
    });
  });
});

describe("dashboard", () => {
  it("prints the address, and opens nothing with --no-open", async () => {
    const { openBrowser } = await import("../core/runner.js");
    const { stdout } = await runCommand(Dashboard, ["--no-open"]);
    expect(stdout).toBe("https://app.4mica.io");
    const { json: opened } = await runCommand(Dashboard, [
      "--no-open",
      "--json",
    ]);
    expect(opened).toEqual({ url: "https://app.4mica.io" });
    expect(openBrowser).not.toHaveBeenCalled();
    pinJson("dashboard", opened);
  });

  it("opens it otherwise", async () => {
    const { openBrowser } = await import("../core/runner.js");
    await runCommand(Dashboard, []);
    expect(openBrowser).toHaveBeenCalledWith("https://app.4mica.io");
  });
});

describe("dev", () => {
  it("runs the project's dev script", async () => {
    const project = await mkdtemp(join(tmpdir(), "4mica-proj-"));
    await writeFile(join(project, "package.json"), "{}");
    const { error } = await runCommand(Dev, [], project);
    expect(error).toBeUndefined();
    expect(runScript).toHaveBeenCalledWith(expect.any(String), "dev", project);
  });

  it("says there is no project where there is no package.json", async () => {
    const { error } = await runCommand(Dev, []);
    expect(error).toMatchObject({
      code: "NO_PROJECT",
      oclif: { exit: EXIT.usage },
    });
    expect(runScript).not.toHaveBeenCalled();
  });
});

describe("help", () => {
  it("prints a command's usage, examples and flags", async () => {
    const { stdout, error } = await runCommand(Help, ["deposit"]);
    expect(error).toBeUndefined();
    expect(stdout).toMatch(/USAGE\s+\$ 4mica deposit AMOUNT/);
    expect(stdout.indexOf("EXAMPLES")).toBeLessThan(stdout.indexOf("FLAGS"));
  });

  it("takes a two-word command", async () => {
    const { stdout } = await runCommand(Help, ["withdrawals", "request"]);
    expect(stdout).toContain("4mica withdrawals request AMOUNT");
  });

  it("lists the commands by what they are for, with none given", async () => {
    const { stdout } = await runCommand(Help, []);
    for (const heading of ["PROJECT", "WALLET", "PAY", "SELL", "EXAMPLES"]) {
      expect(stdout).toContain(heading);
    }
  });
});

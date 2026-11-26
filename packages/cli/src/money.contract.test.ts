/**
 * A transaction sent by the wallet itself, through the built binary and the
 * real SDK, against a stand-in core and a stand-in chain node. Nothing here
 * mocks the session: this is the path from `4mica deposit` to
 * `eth_sendRawTransaction`.
 *
 * What it pins is what the user is told when the node's answer to the
 * broadcast is lost. The SDK reports that as an ordinary failed write; the
 * CLI must not, because the transaction may be in the node's pool.
 */
import { mkdtemp, writeFile } from "node:fs/promises";
import type { IncomingMessage } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  type MockServer,
  mockServer,
  parseJson,
  spawnCli,
} from "./test/spawn.js";

// Every test here starts the real binary, which loads the SDK and viem: a
// second on a laptop, several on a shared CI runner. Vitest's five seconds
// is for tests that run in-process.
vi.setConfig({ testTimeout: 60_000 });

const CHAIN_ID = 1337;
// anvil's account #0: a key everyone knows, on a chain that does not exist.
const KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const HASH = `0x${"cd".repeat(32)}`;

const body = async (req: IncomingMessage): Promise<string> => {
  let text = "";
  for await (const chunk of req) text += chunk;
  return text;
};

/** What the node does with a broadcast. */
let onBroadcast: "drop" | "refuse" | "accept";
/** The JSON-RPC methods the node was asked, in order. */
const asked: string[] = [];

let core: MockServer;
let chain: MockServer;
let keyFile: string;

beforeAll(async () => {
  core = await mockServer((req, res) => {
    const reply = (json: unknown) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(json));
    };
    const path = (req.url ?? "").split("?")[0];
    if (path === "/core/public-params") {
      return reply({
        guarantee_signer: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
        contract_address: "0x00000000000000000000000000000000C04E4a1c",
        guarantee_registry_address:
          "0x0000000000000000000000000000000000065E61",
        clearing_house_address: "0x00000000000000000000000000000000C1ea4111",
        eip712_name: "4micaClearingHouse",
        eip712_version: "1",
        chain_id: CHAIN_ID,
        supported_payment_payload_versions: [1],
        validators: [],
      });
    }
    if (path === "/core/tokens") {
      return reply({ chain_id: CHAIN_ID, tokens: [] });
    }
    // The wallet's collateral before the deposit: core has none on record.
    if (path.startsWith("/core/users/")) return reply(null);
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: `no route ${path}` }));
  });

  chain = await mockServer(async (req, res) => {
    const call = JSON.parse(await body(req)) as {
      id: number;
      method: string;
    };
    asked.push(call.method);
    const result = (value: unknown) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ jsonrpc: "2.0", id: call.id, result: value }));
    };
    switch (call.method) {
      case "eth_chainId":
        return result(`0x${CHAIN_ID.toString(16)}`);
      case "eth_getBalance":
        return result(`0x${(10n ** 19n).toString(16)}`);
      case "eth_getTransactionCount":
        return result("0x0");
      case "eth_estimateGas":
        return result("0x186a0");
      case "eth_blockNumber":
        return result("0x1");
      case "eth_sendRawTransaction":
        if (onBroadcast === "accept") return result(HASH);
        if (onBroadcast === "refuse") {
          res.writeHead(200, { "content-type": "application/json" });
          return res.end(
            JSON.stringify({
              jsonrpc: "2.0",
              id: call.id,
              error: { code: -32000, message: "nonce too low" },
            }),
          );
        }
        // Taken off the wire, and never answered.
        return req.socket.destroy();
      default:
        // No receipt, no code, nothing else: the node knows of none.
        return result(null);
    }
  });

  keyFile = join(await mkdtemp(join(tmpdir(), "4mica-key-")), "w.key");
  await writeFile(keyFile, KEY, { mode: 0o600 });
});
afterAll(async () => {
  await core.close();
  await chain.close();
});
beforeEach(() => {
  asked.length = 0;
});

const deposit = (...argv: string[]) =>
  spawnCli(
    [
      "deposit",
      "0.01",
      "--asset",
      "ETH",
      "--gas",
      "self",
      "--wait",
      "mined",
      "--rpc-url",
      core.url,
      "--key-file",
      keyFile,
      "--request-timeout",
      "5",
      ...argv,
    ],
    {
      env: {
        // Skips the sign-in, which this is not about.
        FOURMICA_BEARER_TOKEN: "test-token",
        FOURMICA_ETHEREUM_HTTP_RPC_URL: chain.url,
      },
      timeout: 60_000,
    },
  );

interface Failure {
  error: { code: string; message: string; suggestions?: string[] };
}

describe("a deposit the wallet sends itself", () => {
  it("checks everything on a dry run and broadcasts nothing", async () => {
    onBroadcast = "accept";
    const run = await deposit("--dry-run", "--json");
    expect(run.code).toBe(0);
    expect(parseJson(run)).toMatchObject({ dryRun: true, ready: true });
    expect(asked).not.toContain("eth_sendRawTransaction");
  });

  it("is an unknown outcome when the node never answers the broadcast", async () => {
    onBroadcast = "drop";
    const run = await deposit("--yes", "--json");
    expect(asked).toContain("eth_sendRawTransaction");
    expect(run.code).toBe(1);
    const { error } = parseJson(run) as Failure;
    expect(error.code).toBe("OUTCOME_UNKNOWN");
    expect(error.message).toBe(
      "the deposit of 0.01 ETH was sent, and the chain's node gave no usable answer; it may or may not have been accepted",
    );
    const advice = (error.suggestions ?? []).join(" ");
    expect(advice).toContain("do not run it again yet");
    expect(advice).toContain("4mica balance");
    expect(`${error.message} ${advice}`).not.toMatch(/try again/i);
  }, 60_000);

  it("is a plain failure when the node refuses the transaction", async () => {
    onBroadcast = "refuse";
    const run = await deposit("--yes", "--json");
    expect(run.code).toBe(1);
    const { error } = parseJson(run) as Failure;
    expect(error.code).not.toBe("OUTCOME_UNKNOWN");
    expect(error.message).toContain("nonce too low");
  }, 60_000);

  it("prints the hash as soon as the node gives one, before any receipt", async () => {
    onBroadcast = "accept";
    // No receipt ever comes: interrupt as soon as the hash is on screen.
    const run = await spawnCli(
      [
        "deposit",
        "0.01",
        "--asset",
        "ETH",
        "--gas",
        "self",
        "--rpc-url",
        core.url,
        "--key-file",
        keyFile,
        "--yes",
      ],
      {
        env: {
          FOURMICA_BEARER_TOKEN: "test-token",
          FOURMICA_ETHEREUM_HTTP_RPC_URL: chain.url,
        },
        interruptWhen: /transaction sent/,
        timeout: 60_000,
      },
    );
    expect(run.code).toBe(130);
    expect(run.stderr).toContain(`transaction sent: ${HASH}`);
    // Ctrl-C after the send does not say it was cancelled.
    expect(run.stderr).toMatch(/interrupted: .* it may still go through/);
    expect(run.stderr).not.toContain("nothing was sent");
  }, 60_000);
});

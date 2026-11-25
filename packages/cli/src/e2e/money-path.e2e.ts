/**
 * The money path, end to end: the built binary, the real SDK, a real core
 * and a real (local) chain. Nothing is mocked.
 *
 * It is not part of `pnpm test`: it needs a stack to run against, and it
 * sends transactions. Run it with `pnpm --filter @4mica/cli test:e2e`
 * after starting one, for example `make dev-up` in a checkout of
 * 4mica-core, which gives a core on :3000 over an anvil chain.
 *
 *   E2E_CORE_URL      core to use            (http://127.0.0.1:3000)
 *   E2E_ASSET         what to deposit        (ETH)
 *   E2E_AMOUNT        how much               (0.01)
 *   E2E_KEY_FILE      a funded wallet's key  (anvil's test account below)
 *   E2E_WALLET_INDEX  which anvil account    (7)
 *   E2E_STRICT=1      fail, do not skip, when no core answers
 *
 * Only ever point it at a chain where the funds are not real: the default
 * key is anvil's, which everyone knows.
 */
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { toHex } from "viem";
import { mnemonicToAccount } from "viem/accounts";
import { beforeAll, describe, expect, it } from "vitest";
import { parseJson, spawnCli } from "../test/spawn.js";

const CORE = process.env.E2E_CORE_URL ?? "http://127.0.0.1:3000";
const ASSET = process.env.E2E_ASSET ?? "ETH";
const AMOUNT = process.env.E2E_AMOUNT ?? "0.01";
const STRICT = process.env.E2E_STRICT === "1";
// anvil's mnemonic: public, and funded only on a local chain.
const ANVIL = "test test test test test test test test test test test junk";

let home: string;
let keyFile: string;
let address: string;
/** Why the suite cannot run here, when it cannot. */
let unavailable: string | undefined;

/** One command against the stack, as JSON. */
async function cli<T>(...argv: string[]): Promise<T> {
  const run = await spawnCli(
    [...argv, "--rpc-url", CORE, "--key-file", keyFile, "--json"],
    { home, timeout: 180_000 },
  );
  const json = parseJson(run) as T & { error?: { code: string } };
  if (run.code !== 0) {
    throw new Error(
      `4mica ${argv.join(" ")} exited ${run.code}: ${run.stdout}\n${run.stderr}`,
    );
  }
  return json;
}

interface Balance {
  asset: { symbol: string };
  raw: { total: string; available: string; locked: string };
}
/** The wallet's collateral in the asset, in base units; zero when none. */
async function collateral(): Promise<{ total: bigint; available: bigint }> {
  const [balance] = await cli<Balance[]>("balance", ASSET);
  return {
    total: BigInt(balance?.raw.total ?? 0),
    available: BigInt(balance?.raw.available ?? 0),
  };
}

beforeAll(async () => {
  home = await mkdtemp(join(tmpdir(), "4mica-e2e-"));
  if (process.env.E2E_KEY_FILE) {
    keyFile = process.env.E2E_KEY_FILE;
  } else {
    const account = mnemonicToAccount(ANVIL, {
      addressIndex: Number(process.env.E2E_WALLET_INDEX ?? 7),
    });
    const key = account.getHdKey().privateKey;
    if (!key) throw new Error("could not derive the anvil test key");
    keyFile = join(home, "e2e.key");
    await writeFile(keyFile, toHex(key), { mode: 0o600 });
  }
  const status = await spawnCli(
    ["status", "--rpc-url", CORE, "--key-file", keyFile, "--json"],
    { home, timeout: 60_000 },
  );
  const { core } = parseJson(status) as { core: { up: boolean } };
  if (!core.up) {
    unavailable = `no core answers at ${CORE}; start one (make dev-up in 4mica-core) or set E2E_CORE_URL`;
    if (STRICT) throw new Error(unavailable);
    console.warn(`skipping the end-to-end suite: ${unavailable}`);
    return;
  }
  ({ address } = await cli<{ address: string }>("whoami"));
}, 120_000);

describe("deposit, then withdraw, against a real core and chain", () => {
  it("has a core to talk to, and the asset it will use", async (test) => {
    if (unavailable) return test.skip();
    expect(address).toMatch(/^0x[0-9a-fA-F]{40}$/);
    if (ASSET !== "ETH") {
      const { tokens } = await cli<{ tokens: { symbol: string }[] }>("tokens");
      expect(tokens.map((t) => t.symbol)).toContain(ASSET);
    }
  });

  it("previews a deposit without moving anything", async (test) => {
    if (unavailable) return test.skip();
    const before = await collateral();
    const preview = await cli<{
      dryRun: boolean;
      ready: boolean;
      problems: string[];
      wallet: string;
    }>("deposit", AMOUNT, "--asset", ASSET, "--gas", "self", "--dry-run");
    expect(preview).toMatchObject({ dryRun: true, ready: true, problems: [] });
    expect(preview.wallet.toLowerCase()).toBe(address.toLowerCase());
    expect(await collateral()).toEqual(before);
  });

  it("deposits, and core counts it", async (test) => {
    if (unavailable) return test.skip();
    const before = await collateral();
    const deposited = await cli<{
      status: string;
      txHash: string;
      amountRaw: string;
    }>(
      "deposit",
      AMOUNT,
      "--asset",
      ASSET,
      "--gas",
      "self",
      "--timeout",
      "120",
      "--yes",
    );
    expect(deposited.txHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(deposited.status).toBe("spendable");
    const after = await collateral();
    expect(after.total - before.total).toBe(BigInt(deposited.amountRaw));
    expect(after.available - before.available).toBe(
      BigInt(deposited.amountRaw),
    );
  });

  it("requests a withdrawal, lists it, and cancels it", async (test) => {
    if (unavailable) return test.skip();
    const before = await collateral();
    // Whatever was left pending by an earlier run would block a new one.
    const pending = await cli<{ asset: { symbol: string } }[]>("withdrawals");
    if (pending.some((w) => w.asset.symbol === ASSET)) {
      await cli("withdrawals", "cancel", "--asset", ASSET, "--yes");
    }

    const requested = await cli<{ txHash: string }>(
      "withdrawals",
      "request",
      AMOUNT,
      "--asset",
      ASSET,
      "--yes",
    );
    expect(requested.txHash).toMatch(/^0x[0-9a-f]{64}$/);
    const listed =
      await cli<{ asset: { symbol: string }; ready: boolean }[]>("withdrawals");
    expect(listed.filter((w) => w.asset.symbol === ASSET)).toHaveLength(1);

    // Finalizing has to wait out the grace period; a dry run says so.
    const tooEarly = await spawnCli(
      [
        "withdrawals",
        "finalize",
        "--asset",
        ASSET,
        "--dry-run",
        "--rpc-url",
        CORE,
        "--key-file",
        keyFile,
        "--json",
      ],
      { home, timeout: 120_000 },
    );
    expect(parseJson(tooEarly)).toMatchObject({ dryRun: true });

    const cancelled = await cli<{ txHash: string }>(
      "withdrawals",
      "cancel",
      "--asset",
      ASSET,
      "--yes",
    );
    expect(cancelled.txHash).toMatch(/^0x[0-9a-f]{64}$/);
    const left = await cli<{ asset: { symbol: string } }[]>("withdrawals");
    expect(left.filter((w) => w.asset.symbol === ASSET)).toEqual([]);
    expect((await collateral()).total).toBe(before.total);
  });
});

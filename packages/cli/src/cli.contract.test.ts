/**
 * The CLI's promises at the process boundary, checked against the built
 * binary: exit codes, which stream gets what, one JSON document under
 * --json, no request for bad input, no secret on any stream, no escape
 * sequence from a server, Ctrl-C. The command list comes from oclif, so a
 * new command is covered the day it is added.
 *
 * `pnpm test` builds first (see package.json), so `dist/` is current.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Config, Flags, Parser } from "@oclif/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CLI_DOCS_URL } from "./core/links.js";
import { packageRoot } from "./core/package-root.js";
import {
  type MockServer,
  mockServer,
  parseJson,
  spawnCli,
} from "./test/spawn.js";

let config: Config;
beforeAll(async () => {
  config = await Config.load(packageRoot);
});

// biome-ignore lint/suspicious/noControlCharactersInRegex: what is checked for
const CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/;

/** Our own commands, not the autocomplete plugin's. */
const ownCommands = () =>
  config.commands.filter((c) => c.pluginName === "@4mica/cli");

/** Each command once: oclif also lists an alias (`withdraw`) as a command. */
const namedCommands = () => {
  const aliases = new Set(ownCommands().flatMap((c) => c.aliases ?? []));
  return ownCommands().filter((c) => !aliases.has(c.id));
};

/** Every file under `dir` whose name ends in `suffix`. */
function filesUnder(dir: string, suffix: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return filesUnder(path, suffix);
    return path.endsWith(suffix) ? [path] : [];
  });
}

describe("every command", () => {
  it("has the fields of its --json output pinned by a test", () => {
    // `pinJson` (test/shape.ts) names each snapshot `json shape: <command>`.
    const pinned = new Set(
      filesUnder(join(packageRoot, "src"), ".snap").flatMap((file) =>
        [
          ...readFileSync(file, "utf8").matchAll(
            /json shape: ([a-z ]+?)(?: \(| \d)/g,
          ),
        ].map((match) => match[1]),
      ),
    );
    const unpinned = namedCommands()
      .filter((c) => c.enableJsonFlag)
      .map((c) => c.id.replaceAll(":", " "))
      .filter((id) => !pinned.has(id));
    expect(unpinned).toEqual([]);
  });

  it("is in the manifest that ships, and no manifest is left in the checkout", () => {
    const manifest = JSON.parse(
      execFileSync(
        process.execPath,
        [join(packageRoot, "scripts", "gen-manifest.mjs"), "--stdout"],
        { encoding: "utf8" },
      ),
    ) as { commands: Record<string, { flags: Record<string, unknown> }> };
    expect(Object.keys(manifest.commands).sort()).toEqual(
      namedCommands()
        .map((c) => c.id)
        .sort(),
    );
    expect(Object.keys(manifest.commands.deposit.flags)).toContain("dry-run");
    const pjson = JSON.parse(
      readFileSync(join(packageRoot, "package.json"), "utf8"),
    ) as { files: string[]; scripts: Record<string, string> };
    expect(pjson.files).toContain("oclif.manifest.json");
    expect(pjson.scripts.prepack).toContain("gen-manifest");
    // A stale one would be believed over the command files.
    expect(existsSync(join(packageRoot, "oclif.manifest.json"))).toBe(false);
  });

  it("has a summary and at least one example", () => {
    const missing = ownCommands()
      .filter((c) => !c.summary || (c.examples ?? []).length === 0)
      .map((c) => c.id);
    expect(missing).toEqual([]);
  });

  it("has examples that parse as written", async () => {
    const failures: string[] = [];
    for (const loadable of ownCommands()) {
      const command = await loadable.load();
      for (const example of loadable.examples ?? []) {
        const line = String(
          typeof example === "string" ? example : example.command,
        )
          .replaceAll("<%= config.bin %>", "4mica")
          .replaceAll("<%= command.id %>", loadable.id.replaceAll(":", " "));
        if (line.includes("|")) continue;
        const words = (line.match(/"[^"]*"|'[^']*'|\S+/g) ?? []).map((w) =>
          w.replace(/^["']|["']$/g, ""),
        );
        // The longest run of leading words that names a command: an
        // example may show a subcommand, as `config` shows `config set`.
        let k = words.length - 1;
        while (k > 1 && !config.findCommand(words.slice(1, k + 1).join(":")))
          k--;
        const found = config.findCommand(words.slice(1, k + 1).join(":"));
        if (!found) {
          failures.push(`${line}: names no command`);
          continue;
        }
        const target = found.id === loadable.id ? command : await found.load();
        const argv = words.slice(k + 1);
        try {
          await Parser.parse(argv, {
            args: target.args,
            flags: {
              ...target.baseFlags,
              ...target.flags,
              json: Flags.boolean(),
            },
            strict: target.strict ?? true,
          });
        } catch (error) {
          failures.push(`${line}: ${(error as Error).message}`);
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it("takes -h for --help", async () => {
    const [short, long] = await Promise.all([
      spawnCli(["deposit", "-h"]),
      spawnCli(["deposit", "--help"]),
    ]);
    expect(short.stdout).toBe(long.stdout);
  });

  it("answers --help offline, on stdout, ending with the docs", async () => {
    const results = await Promise.all(
      ownCommands().map(async (c) => ({
        id: c.id,
        run: await spawnCli([...c.id.split(":"), "--help"]),
      })),
    );
    for (const { id, run } of results) {
      expect.soft(run.code, id).toBe(0);
      expect.soft(run.stdout, id).toContain("USAGE");
      expect.soft(run.stdout, id).toContain("EXAMPLES");
      expect.soft(run.stdout, id).toContain(CLI_DOCS_URL);
      expect.soft(run.stderr, id).toBe("");
    }
  }, 60_000);
});

describe("exit codes, as the README's table gives them", () => {
  it.each([
    [["networks"], 0, undefined],
    [["--version"], 0, undefined],
    [["version", "--json"], 0, undefined],
    [["depost", "5"], 2, "UNKNOWN_COMMAND"],
    [["xyzzy"], 2, "UNKNOWN_COMMAND"],
    [["version-x"], 2, "UNKNOWN_COMMAND"],
    [["deposit"], 2, "MISSING_ARG"],
    [["deposit", "5", "--gas", "nope"], 2, "BAD_FLAG_VALUE"],
    [["init", "x", "--template", "bogus"], 2, "BAD_FLAG_VALUE"],
    [["balance", "--bogus"], 2, "UNKNOWN_FLAG"],
    [["tokens", "--request-timeout", "0"], 2, "BAD_FLAG_VALUE"],
    [
      ["tokens", "--network", "base", "--rpc-url", "https://x.example"],
      2,
      "FLAG_CONFLICT",
    ],
    [["whoami", "--dotenv", "missing.env"], 2, "BAD_FLAG_VALUE"],
    [["whoami", "--rpc-url", "file:///etc/passwd"], 2, "BAD_RPC_URL"],
    [["whoami"], 3, "NO_SIGNER"],
  ] as const)("%j exits %i", async (argv, code, errorCode) => {
    const run = await spawnCli([...argv]);
    expect(run.code).toBe(code);
    if (errorCode) {
      const json = parseJson(await spawnCli([...argv, "--json"])) as {
        error: { code: string; message: string };
      };
      expect(json.error.code).toBe(errorCode);
      expect(json.error.message).not.toMatch(/^(Type|Abort|Execa)?Error\b/);
    }
  });

  it("keeps a usage error short: no wall of help after it", async () => {
    const run = await spawnCli(["deposit"]);
    expect(run.stderr.trim().split("\n").length).toBeLessThanOrEqual(5);
  });

  it("points --env-file, the flag's old name, at --dotenv", async () => {
    // Node reads `--env-file` for itself before the cli starts, so the
    // file has to exist for the cli to get a say at all.
    const home = await mkdtemp(join(tmpdir(), "4mica-spawn-"));
    await writeFile(join(home, "some.env"), "");
    const run = await spawnCli(["whoami", "--env-file", "some.env", "--json"], {
      home,
    });
    expect(run.code).toBe(2);
    expect(parseJson(run)).toMatchObject({
      error: {
        code: "UNKNOWN_FLAG",
        suggestions: [expect.stringContaining("--dotenv <path>")],
      },
    });
  });

  it("refuses a facilitator url in clear text, wherever it was set", async () => {
    const run = await spawnCli(["config", "--json"], {
      env: { FOURMICA_FACILITATOR_URL: "http://pay.example" },
    });
    expect(run.code).toBe(3);
    expect(parseJson(run)).toMatchObject({
      error: { code: "BAD_FACILITATOR_URL" },
    });
  });

  it("suggests the command a word begins, not one a letter away", async () => {
    const run = await spawnCli(["dep"]);
    expect(run.code).toBe(2);
    expect(run.stderr).toContain("did you mean `4mica deposit`?");
  });

  it("never runs an unknown word as init, with or without --yes", async () => {
    for (const argv of [["xyzzy"], ["xyzzy", "--yes", "--no-install"]]) {
      const run = await spawnCli(argv);
      expect(run.code).toBe(2);
      expect(run.stderr).toContain("4mica init xyzzy");
      expect(existsSync(join(run.home, "xyzzy"))).toBe(false);
    }
  }, 30_000);
});

describe("streams", () => {
  it("puts the result on stdout, notes on stderr, and --quiet drops the notes", async () => {
    const run = await spawnCli(["networks", "--json"]);
    expect(Array.isArray(parseJson(run))).toBe(true);
    expect(run.stderr).not.toBe("");
    const quiet = await spawnCli(["networks", "--json", "-q"]);
    expect(quiet.stdout).toBe(run.stdout);
    expect(quiet.stderr).toBe("");
  });

  it("puts the error envelope on stdout under --json, once", async () => {
    const run = await spawnCli(["depost", "--json"]);
    expect(parseJson(run)).toMatchObject({
      error: { code: "UNKNOWN_COMMAND" },
    });
    expect(run.stderr).toBe("");
  });
});

describe("bad input is refused before any request", () => {
  let core: MockServer;
  beforeAll(async () => {
    core = await mockServer((_req, res) => {
      res.writeHead(500).end();
    });
  });
  afterAll(() => core.close());

  it.each([
    [["deposit", "0", "--asset", "USDC"]],
    [["deposit", "0 USDC"]],
    [["withdraw", "0", "--asset", "USDC"]],
    [["cycles", "pay", "abc"]],
    [["cycles", "claim", "0xaa:1", "--creditor", "nothex"]],
    [["cycles", "checkpoint", "--asset", "USDC", "--cycle", "nope"]],
    [["fetch", "https://seller.example/x", "--pay-to", "nothex"]],
    [["fetch", "https://seller.example/x", "-o", "/no/such/dir/out"]],
  ])("%j exits 2 and asks nothing", async (argv) => {
    const run = await spawnCli([...argv, "--rpc-url", core.url, "--yes"]);
    expect(run.code).toBe(2);
    expect(core.requests).toEqual([]);
  });
});

describe("security at the boundary", () => {
  it("prints no escape sequence a server sends", async () => {
    const core = await mockServer((_req, res) => {
      res.writeHead(500, { "content-type": "application/json" }).end(
        JSON.stringify({
          error: "\u001b[31mRED\u001b[0m \u001b]0;pwned\u0007 msg",
        }),
      );
    });
    const run = await spawnCli(["tokens", "--rpc-url", core.url]);
    await core.close();
    expect(run.code).toBe(1);
    expect(run.stderr).toContain("RED");
    expect(run.stderr).not.toMatch(CONTROL);
  }, 30_000);

  it("never shows the key, on any stream, in any mode", async () => {
    const created = await spawnCli(["wallets", "create", "probe", "--json"]);
    const { path } = parseJson(created) as { path: string };
    const key = readFileSync(path, "utf8").trim();
    const hex = key.replace(/^0x/, "");
    if (process.platform !== "win32") {
      expect(statSync(path).mode & 0o777).toBe(0o600);
      expect(statSync(join(path, "..")).mode & 0o777).toBe(0o700);
      expect(
        statSync(join(created.home, "4mica", "config.json")).mode & 0o777,
      ).toBe(0o600);
    }
    for (const argv of [
      ["whoami"],
      ["whoami", "--json"],
      ["config", "--json"],
      ["wallets", "--json"],
      ["status", "--debug", "--rpc-url", "http://127.0.0.1:9"],
    ]) {
      const run = await spawnCli(argv, {
        home: created.home,
        env: { DEBUG: "*" },
      });
      expect(run.stdout + run.stderr, argv.join(" ")).not.toContain(hex);
    }
  }, 60_000);
});

describe("networks that misbehave", () => {
  it("gives up on a body that stops arriving", async () => {
    const core = await mockServer((_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.write('{"tokens": [');
    });
    const started = Date.now();
    const run = await spawnCli([
      "tokens",
      "--rpc-url",
      core.url,
      "--request-timeout",
      "1",
      "--json",
    ]);
    await core.close();
    expect(Date.now() - started).toBeLessThan(10_000);
    expect(run.code).toBe(1);
    expect(parseJson(run)).toMatchObject({ error: { code: "TIMEOUT" } });
  }, 20_000);

  it("ends on Ctrl-C with exit 130 and one line", async () => {
    const core = await mockServer(() => {});
    const run = await spawnCli(["tokens", "--rpc-url", core.url], {
      interruptAfter: 1500,
    });
    await core.close();
    expect(run.code).toBe(130);
    expect(run.stderr.trim()).toBe("cancelled; nothing was sent");
  }, 20_000);
});

describe("start-up", () => {
  it("does not load viem or the SDK's main entry to print help", () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (path.endsWith(".js")) {
          const source = readFileSync(path, "utf8");
          if (/^import [^;]* from "(viem|@4mica\/sdk)";/m.test(source)) {
            offenders.push(path);
          }
        }
      }
    };
    walk(join(packageRoot, "dist"));
    expect(offenders).toEqual([]);
  });

  it("prints its version quickly", async () => {
    const times: number[] = [];
    for (let i = 0; i < 3; i++) {
      const started = Date.now();
      await spawnCli(["--version"]);
      times.push(Date.now() - started);
    }
    times.sort((a, b) => a - b);
    // A loose budget, for slow CI machines; today it is around 150 ms.
    expect(times[1]).toBeLessThan(1500);
  }, 30_000);
});

describe("color", () => {
  it("follows the flag over the environment, on every stream", async () => {
    const on = await spawnCli(["networks", "--color"], {
      env: { NO_COLOR: undefined, FORCE_COLOR: "0" },
    });
    expect(on.stdout).toContain("\u001b[");
    // Errors are printed by oclif, which reads only the environment.
    const error = await spawnCli(["depost", "--color"], {
      env: { NO_COLOR: undefined, FORCE_COLOR: "0" },
    });
    expect(error.stderr).toContain("\u001b[");
    for (const argv of [["networks"], ["balance", "--bogus"]]) {
      const off = await spawnCli([...argv, "--no-color"], {
        env: { NO_COLOR: undefined, FORCE_COLOR: "1" },
      });
      expect(off.stdout + off.stderr).not.toContain("\u001b[");
    }
  });
});

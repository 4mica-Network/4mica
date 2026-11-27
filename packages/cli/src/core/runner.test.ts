import { chmod, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { installEnv, openBrowser } from "./runner.js";

describe("installEnv", () => {
  it("keeps the wallet key from a package manager's install scripts", () => {
    const env = installEnv({
      PATH: "/bin",
      FOURMICA_WALLET_PRIVATE_KEY: "0xkey",
      "4MICA_WALLET_PRIVATE_KEY": "0xkey",
      FOURMICA_NETWORK: "base-sepolia",
    });
    expect(env).toEqual({ PATH: "/bin", FOURMICA_NETWORK: "base-sepolia" });
  });
});

describe.skipIf(process.platform === "win32")("openBrowser", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const launchers = async (script?: string) => {
    const bin = await mkdtemp(join(tmpdir(), "4mica-browser-"));
    if (script) {
      for (const name of ["open", "xdg-open"]) {
        await writeFile(join(bin, name), script);
        await chmod(join(bin, name), 0o755);
      }
    }
    vi.stubEnv("PATH", [bin, "/bin", "/usr/bin"].join(delimiter));
    return bin;
  };

  it("does not wait for a launcher that stays open with the browser", async () => {
    const bin = await launchers(
      '#!/bin/sh\necho "$1" > "$OPENED"\nexec sleep 5\n',
    );
    const opened = join(bin, "opened");
    vi.stubEnv("OPENED", opened);

    const started = Date.now();
    await openBrowser("https://app.test/cli/authorize?code=BCDF-GHJK");
    expect(Date.now() - started).toBeLessThan(2000);

    await vi.waitFor(async () => {
      expect(await readFile(opened, "utf8")).toContain("code=BCDF-GHJK");
    });
  });

  it("does nothing, and throws nothing, when there is no launcher", async () => {
    await launchers();
    await expect(openBrowser("https://app.test")).resolves.toBeUndefined();
    // A launcher that fails to start rejects later; that must not surface.
    await new Promise((resolve) => setTimeout(resolve, 200));
  });
});

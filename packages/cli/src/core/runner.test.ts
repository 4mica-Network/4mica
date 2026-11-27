import { describe, expect, it } from "vitest";
import { installEnv } from "./runner.js";

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

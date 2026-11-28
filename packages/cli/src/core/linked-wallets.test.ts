import { describe, expect, it } from "vitest";
import { ACCOUNT, linkMessage } from "../test/platform.js";
import { isDeviceCode } from "./device-flow.js";
import { assertLinkChallenge } from "./linked-wallets.js";
import { apiError, isWhoAmI, resolvePlatform } from "./platform.js";

const ADDRESS = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const expected = {
  address: ADDRESS,
  chainId: 84532,
  nonce: "nonce-1",
  userId: ACCOUNT.id,
};

describe("the wallet-link challenge", () => {
  it("is signed when every field is what this link should be", () => {
    expect(() =>
      assertLinkChallenge(linkMessage(ADDRESS), expected),
    ).not.toThrow();
    expect(() =>
      assertLinkChallenge(
        linkMessage(ADDRESS, {
          domain: "localhost:4173",
          uri: "http://localhost:4173",
        }),
        expected,
      ),
    ).not.toThrow();
  });

  for (const [why, message] of [
    ["is for another site", linkMessage(ADDRESS, { domain: "evil.example" })],
    [
      "names a URI on another host",
      linkMessage(ADDRESS, { uri: "https://evil.example" }),
    ],
    ["binds another account", linkMessage(ADDRESS, { userId: "someone-else" })],
    ["has expired", linkMessage(ADDRESS, { expiresInMs: -1000 })],
    [
      "names a plain http URI on a real host",
      linkMessage(ADDRESS, { uri: "http://app.4mica.io" }),
    ],
    [
      "lives longer than a link challenge should",
      linkMessage(ADDRESS, { expiresInMs: 60 * 60 * 1000 }),
    ],
    ["is for another chain", linkMessage(ADDRESS, { chainId: 1 })],
    [
      "carries another resource",
      `${linkMessage(ADDRESS)}\n- https://evil.example/approve`,
    ],
    [
      "says something else",
      linkMessage(ADDRESS).replace(
        "This does not authorize any transfer of funds.",
        "This authorizes transfers.",
      ),
    ],
    ["is not a SIWE message", "Transfer all funds"],
  ] as const) {
    it(`is refused when it ${why}`, () => {
      expect(() => assertLinkChallenge(message, expected)).toThrow(
        expect.objectContaining({ code: "UNEXPECTED_CHALLENGE" }),
      );
    });
  }
});

describe("a refusal for lack of permission", () => {
  it("names the sign-in that grants it", () => {
    const error = apiError(resolvePlatform({}), {
      status: 403,
      body: {
        error: "insufficient_scope",
        message:
          "This CLI session is not allowed to do that (needs wallets:unlink).",
      },
    });

    expect(error.suggestions?.[0]).toContain(
      "4mica auth login --web --scopes account:read,wallets:read,wallets:link,wallets:unlink",
    );
  });
});

describe("the shape of what the platform sends", () => {
  it("is checked before it is used", () => {
    expect(isWhoAmI({ user: { id: "u" }, session: { id: "s" } })).toBe(false);
    expect(
      isWhoAmI({
        user: { id: "u" },
        session: {
          id: "s",
          kind: "DEVICE",
          scopes: ["account:read"],
          expiresAt: "2027-01-01T00:00:00.000Z",
        },
      }),
    ).toBe(true);
    expect(isDeviceCode({ device_code: "d", user_code: "u" })).toBe(false);
    expect(
      isDeviceCode({
        device_code: "d",
        user_code: "u",
        verification_uri_complete: "javascript:alert(1)",
        expires_in: 600,
        interval: 5,
      }),
    ).toBe(false);
  });
});

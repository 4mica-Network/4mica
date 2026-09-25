import { describe, expect, it } from "vitest";
import type { PublicAgent } from "@/schema/agent";
import {
  buildAgentBuyerSnippets,
  buildAgentSnippets,
  isSellable,
} from "./agent";

const PAYER_WALLET = "0x1111111111111111111111111111111111111111";
const PAY_TO = "0x2222222222222222222222222222222222222222";
const ASSET = "0x3333333333333333333333333333333333333333";

const agent = (overrides: Partial<PublicAgent> = {}): PublicAgent => ({
  id: "agent-1",
  ref: "atlas-research",
  name: "Atlas Research Agent",
  headline: null,
  description: null,
  avatarUrl: null,
  docsUrl: null,
  status: "ACTIVE",
  visibility: "PUBLIC",
  createdAt: "2026-01-01T00:00:00.000Z",
  publishedAt: null,
  network: "BASE_SEPOLIA",
  walletAddress: null,
  payToAddress: null,
  assetAddress: null,
  priceAmount: null,
  priceCurrency: null,
  priceLabel: null,
  endpointUrl: null,
  x402Endpoint: null,
  ...overrides,
});

const sellable = (overrides: Partial<PublicAgent> = {}): PublicAgent =>
  agent({
    payToAddress: PAY_TO,
    endpointUrl: "https://agents.example.com/atlas/brief",
    priceAmount: "0.002000000000000000",
    priceCurrency: "USD",
    ...overrides,
  });

describe("buildAgentSnippets", () => {
  /**
   * The security assertion for this feature. `walletAddress` is null for every
   * viewer who does not own the profile (AGENT_PUBLIC_SELECT omits the column),
   * and the snippet must not leak it back in from anywhere else.
   */
  it("shows a placeholder, never a real address, for a non-owner", () => {
    const snippets = buildAgentSnippets(agent({ walletAddress: null }));

    for (const source of Object.values(snippets)) {
      expect(source).not.toMatch(/0x[0-9a-fA-F]{40}/);
    }
    expect(snippets.typescript).toContain("0xYourAgentWallet");
  });

  it("shows the real address to the owner", () => {
    const snippets = buildAgentSnippets(agent({ walletAddress: PAYER_WALLET }));

    expect(snippets.typescript).toContain(PAYER_WALLET);
    expect(snippets.typescript).not.toContain("0xYourAgentWallet");
  });

  it("uses the agent's own network in both the scheme and the SDK config", () => {
    const snippets = buildAgentSnippets(agent({ network: "ETHEREUM_SEPOLIA" }));

    expect(snippets.typescript).toContain('network: "eip155:11155111"');
    expect(snippets.collateral).toContain('.network("ethereum-sepolia")');
  });

  it("names the agent so the snippet is identifiably about it", () => {
    const snippets = buildAgentSnippets(agent());

    expect(snippets.typescript).toContain("Atlas Research Agent");
  });

  it("never emits the string undefined", () => {
    for (const source of Object.values(buildAgentSnippets(agent()))) {
      expect(source).not.toContain("undefined");
    }
  });

  it("does not put a private key literal in the source", () => {
    const snippets = buildAgentSnippets(agent({ walletAddress: PAYER_WALLET }));

    expect(snippets.typescript).toContain("process.env.AGENT_PRIVATE_KEY");
    expect(snippets.collateral).toContain("process.env.AGENT_PRIVATE_KEY");
  });
});

describe("isSellable", () => {
  it("needs both a recipient and an endpoint", () => {
    expect(isSellable(agent())).toBe(false);
    expect(isSellable(agent({ payToAddress: PAY_TO }))).toBe(false);
    expect(isSellable(agent({ endpointUrl: "https://x.example/call" }))).toBe(
      false,
    );
    expect(isSellable(sellable())).toBe(true);
  });
});

describe("buildAgentBuyerSnippets", () => {
  it("returns null for an agent with no seller half", () => {
    expect(buildAgentBuyerSnippets(agent())).toBeNull();
  });

  it("publishes the recipient address but never the payer address", () => {
    const snippets = buildAgentBuyerSnippets(
      sellable({ walletAddress: PAYER_WALLET }),
    );

    expect(snippets).not.toBeNull();
    for (const source of Object.values(snippets ?? {})) {
      expect(source).not.toContain(PAYER_WALLET);
    }
    expect(snippets?.typescript).toContain(PAY_TO);
    expect(snippets?.curl).toContain(PAY_TO);
  });

  it("uses the agent's own network in the scheme and the SDK config", () => {
    const snippets = buildAgentBuyerSnippets(
      sellable({ network: "ETHEREUM_SEPOLIA" }),
    );

    expect(snippets?.typescript).toContain('network: "eip155:11155111"');
    expect(snippets?.python).toContain('"eip155:11155111"');
    expect(snippets?.receipt).toContain('.network("ethereum-sepolia")');
  });

  it("names the ERC-20 when one is set, and the native asset otherwise", () => {
    expect(buildAgentBuyerSnippets(sellable())?.typescript).toContain(
      "native asset",
    );

    const erc20 = buildAgentBuyerSnippets(sellable({ assetAddress: ASSET }));
    expect(erc20?.typescript).toContain(`ERC-20 ${ASSET}`);
    expect(erc20?.curl).toContain(`"asset": "${ASSET}"`);
  });

  it("trims the Decimal's trailing zeros in the displayed price", () => {
    const snippets = buildAgentBuyerSnippets(sellable());

    expect(snippets?.typescript).toContain("$0.002 per call");
    expect(snippets?.typescript).not.toContain("0.002000000000000000");
  });

  it("falls back to the display label when there is no machine price", () => {
    const snippets = buildAgentBuyerSnippets(
      sellable({
        priceAmount: null,
        priceCurrency: null,
        priceLabel: "Usage-based",
      }),
    );

    expect(snippets?.typescript).toContain("Usage-based per call");
    expect(snippets?.curl).not.toContain("maxAmountRequired");
  });

  it("posts to the agent's real endpoint", () => {
    const snippets = buildAgentBuyerSnippets(sellable());

    expect(snippets?.typescript).toContain(
      '"https://agents.example.com/atlas/brief"',
    );
    expect(snippets?.python).toContain(
      'session.post("https://agents.example.com/atlas/brief"',
    );
  });

  it("never emits the string undefined", () => {
    for (const source of Object.values(
      buildAgentBuyerSnippets(sellable()) ?? {},
    )) {
      expect(source).not.toContain("undefined");
    }
  });
});

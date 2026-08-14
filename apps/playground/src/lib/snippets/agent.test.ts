import { describe, expect, it } from "vitest";
import type { PublicAgent } from "@/schema/agent";
import { buildAgentSnippets } from "./agent";

const WALLET = "0x1111111111111111111111111111111111111111";

const agent = (overrides: Partial<PublicAgent> = {}): PublicAgent => ({
  id: "agent-1",
  ref: "atlas-research",
  name: "Atlas Research Agent",
  headline: null,
  description: null,
  avatarUrl: null,
  status: "ACTIVE",
  visibility: "PUBLIC",
  createdAt: "2026-01-01T00:00:00.000Z",
  network: "BASE_SEPOLIA",
  walletAddress: null,
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
    const snippets = buildAgentSnippets(agent({ walletAddress: WALLET }));

    expect(snippets.typescript).toContain(WALLET);
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
    const snippets = buildAgentSnippets(agent({ walletAddress: WALLET }));

    expect(snippets.typescript).toContain("process.env.AGENT_PRIVATE_KEY");
    expect(snippets.collateral).toContain("process.env.AGENT_PRIVATE_KEY");
  });
});

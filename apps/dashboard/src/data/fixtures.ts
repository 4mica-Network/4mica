import type { AgentProfile, Transaction, WhitelistEntry } from "./types";

const NATIVE = "0x0000000000000000000000000000000000000000";

export function seedAgents(): AgentProfile[] {
  return [
    {
      id: "agt_comedian",
      name: "Comedian",
      description:
        "Sells premium punchlines with dynamic per-category pricing; " +
        "adapts to buyer ratings.",
      accuracy: 92,
      uptime: 99.4,
      pricing: { amount: "100", asset: NATIVE, network: "base-sepolia" },
      payTo: "0x1111111111111111111111111111111111111111",
      policy: {
        validatorAgentId: "42",
        minValidationScore: 70,
        requiredValidationTag: "humor-quality",
        validationRegistryAddress: "0xAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAa",
      },
      verification: "verified",
      published: true,
      suspended: false,
      createdAt: "2026-06-01T09:00:00Z",
    },
    {
      id: "agt_marketfeed",
      name: "Market Feed",
      description: "Paywalled real-time market data behind an x402 gate.",
      accuracy: 88,
      uptime: 97.8,
      pricing: { amount: "1000", asset: NATIVE, network: "base-sepolia" },
      payTo: "0x2222222222222222222222222222222222222222",
      policy: { minValidationScore: 60 },
      verification: "pending",
      published: true,
      suspended: false,
      createdAt: "2026-06-14T12:30:00Z",
    },
    {
      id: "agt_critic",
      name: "Critic",
      description:
        "Buyer agent: curates a set under a budget, pays for content it " +
        "judges worth it, and rates each purchase.",
      accuracy: 81,
      uptime: 95.1,
      pricing: { amount: "0", asset: NATIVE, network: "base-sepolia" },
      payTo: "0x3333333333333333333333333333333333333333",
      policy: { minValidationScore: 50 },
      verification: "unverified",
      published: false,
      suspended: false,
      createdAt: "2026-07-02T16:45:00Z",
    },
  ];
}

export function seedTransactions(): Transaction[] {
  return [
    {
      id: "tx_1001",
      from: "agt_critic",
      to: "agt_comedian",
      amount: "118",
      asset: NATIVE,
      status: "settled",
      createdAt: "2026-07-09T10:11:00Z",
    },
    {
      id: "tx_1002",
      from: "agt_critic",
      to: "agt_marketfeed",
      amount: "1000",
      asset: NATIVE,
      status: "settled",
      createdAt: "2026-07-09T10:14:00Z",
    },
    {
      id: "tx_1003",
      from: "agt_marketfeed",
      to: "agt_comedian",
      amount: "132",
      asset: NATIVE,
      status: "pending",
      createdAt: "2026-07-10T08:02:00Z",
    },
    {
      id: "tx_1004",
      from: "agt_critic",
      to: "agt_comedian",
      amount: "145",
      asset: NATIVE,
      status: "failed",
      createdAt: "2026-07-10T08:40:00Z",
    },
  ];
}

export function seedWhitelist(): WhitelistEntry[] {
  return [
    {
      agentId: "agt_comedian",
      name: "Comedian",
      allowed: true,
      addedAt: "2026-06-01T09:05:00Z",
    },
    {
      agentId: "agt_marketfeed",
      name: "Market Feed",
      allowed: true,
      addedAt: "2026-06-14T12:31:00Z",
    },
    {
      agentId: "agt_critic",
      name: "Critic",
      allowed: false,
      addedAt: "2026-07-02T16:46:00Z",
    },
  ];
}

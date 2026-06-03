"use client";

import { AnimatePresence, motion } from "framer-motion";
import { memo, useCallback, useEffect, useState } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

type NodeType = "agent" | "api" | "db" | "chain" | "ext" | "brand";

interface NetNode {
  id: number;
  type: NodeType;
  name: string;
  x: number;
  y: number;
  size: number; // circle radius in SVG units - bigger = more important
}

// ── Nodes ─────────────────────────────────────────────────────────────────────

const NODES: NetNode[] = [
  // AI Agents
  { id: 0, type: "agent", name: "TradingBot", x: 28, y: 56, size: 2.2 }, // FA
  { id: 1, type: "agent", name: "ResourceHub", x: 72, y: 56, size: 2.2 }, // FB
  { id: 2, type: "agent", name: "RiskMgr", x: 10, y: 28, size: 1.7 },
  { id: 3, type: "agent", name: "Portfolio", x: 48, y: 16, size: 1.8 },
  { id: 4, type: "agent", name: "Arbitrage", x: 62, y: 78, size: 1.6 },
  { id: 5, type: "agent", name: "Liquidator", x: 88, y: 44, size: 1.6 },
  { id: 6, type: "agent", name: "Compliance", x: 32, y: 86, size: 1.4 },
  { id: 22, type: "agent", name: "ShopBot", x: 15, y: 70, size: 1.9 },
  { id: 23, type: "agent", name: "CartAgent", x: 78, y: 76, size: 1.7 },
  // API Servers
  { id: 7, type: "api", name: "PriceAPI", x: 58, y: 7, size: 2.0 },
  { id: 8, type: "api", name: "MarketAPI", x: 82, y: 23, size: 2.5 },
  { id: 9, type: "api", name: "AuthService", x: 4, y: 52, size: 1.5 },
  { id: 10, type: "api", name: "SettleAPI", x: 62, y: 40, size: 1.9 },
  { id: 11, type: "api", name: "KYC API", x: 18, y: 6, size: 1.6 },
  // Databases
  { id: 13, type: "db", name: "AssetLedger", x: 88, y: 66, size: 1.9 },
  { id: 14, type: "db", name: "UserReg", x: 54, y: 91, size: 1.5 },
  // Blockchain nodes
  { id: 15, type: "chain", name: "ETH Node", x: 6, y: 80, size: 2.9 },
  { id: 16, type: "chain", name: "SOL Node", x: 94, y: 14, size: 2.4 }, // inactive
  { id: 17, type: "chain", name: "BTC Bridge", x: 94, y: 90, size: 2.7 }, // inactive
  // External services
  { id: 18, type: "ext", name: "OracleNet", x: 34, y: 5, size: 2.2 },
  { id: 19, type: "ext", name: "IPFS", x: 78, y: 5, size: 1.8 },
  { id: 20, type: "ext", name: "Chainlink", x: 50, y: 66, size: 2.3 },
  { id: 21, type: "ext", name: "OpenAI", x: 4, y: 18, size: 3.4 },
  { id: 24, type: "ext", name: "PriceWatch", x: 66, y: 18, size: 1.6 },
  // 4mica - the payment hub
  { id: 25, type: "brand", name: "4Mica", x: 50, y: 50, size: 5.2 },
  // USDC ERC-20 contract - deactivated (settlement done off-chain via netting)
  { id: 26, type: "chain", name: "USDC", x: 38, y: 72, size: 2.2 },
  // Collateral Vault - locks funds during guarantee issuance
  { id: 27, type: "chain", name: "Vault", x: 36, y: 37, size: 2.4 },
];

// Lookup by node ID so EDGES and code references are order-independent
const NODE_MAP: Record<number, NetNode> = Object.fromEntries(
  NODES.map((n) => [n.id, n]),
);

const EDGES: [number, number][] = [
  [0, 1],
  [0, 2],
  [0, 3],
  [0, 6],
  [0, 9],
  [0, 10],
  [0, 15],
  [0, 18],
  [0, 20],
  [0, 22],
  [1, 4],
  [1, 5],
  [1, 8],
  [1, 10],
  [1, 13],
  [1, 19],
  [1, 20],
  [1, 23],
  [2, 3],
  [2, 9],
  [2, 11],
  [2, 21],
  [3, 7],
  [3, 11],
  [3, 18],
  [3, 24],
  [4, 6],
  [4, 14],
  [4, 17],
  [4, 20],
  [4, 23],
  [5, 8],
  [5, 13],
  [5, 16],
  [6, 9],
  [6, 14],
  [6, 15],
  [7, 18],
  [7, 19],
  [7, 24],
  [8, 13],
  [8, 16],
  [8, 19],
  [8, 24],
  [9, 15],
  [9, 21],
  [10, 13],
  [11, 7],
  [11, 18],
  [13, 16],
  [13, 17],
  [14, 15],
  [15, 6],
  [16, 5],
  [17, 4],
  [18, 11],
  [20, 1],
  [21, 2],
  [22, 9],
  [22, 24],
  [23, 13],
  [23, 10],
  [24, 8],
  // ETH → B (used in on-chain settlement step)
  [15, 1],
  // 4mica (index 25) connects to everything
  [25, 0],
  [25, 1],
  [25, 2],
  [25, 3],
  [25, 4],
  [25, 5],
  [25, 6],
  [25, 7],
  [25, 8],
  [25, 10],
  [25, 11],
  [25, 13],
  [25, 15],
  [25, 16],
  [25, 17],
  [25, 18],
  [25, 20],
  [25, 21],
  [25, 22],
  [25, 23],
  [25, 27],
];

const FA = 0;
const FB = 1;

// ── Edge groups (pre-computed once - 6 groups instead of 80+ animated elements) ─
const EDGE_GROUPS: {
  key: string;
  edges: [number, number][];
  stroke: string;
  sw: number;
}[] = (() => {
  const isAB = ([a, b]: [number, number]) =>
    (a === FA && b === FB) || (a === FB && b === FA);
  const inv4 = ([a, b]: [number, number]) => a === 25 || b === 25;
  const is4B = (e: [number, number]) => inv4(e) && (e[0] === FB || e[1] === FB);
  const isAEth = ([a, b]: [number, number]) =>
    (a === FA && b === 15) || (a === 15 && b === FA);
  const isEthB = ([a, b]: [number, number]) =>
    (a === 15 && b === FB) || (a === FB && b === 15);
  const isVault = ([a, b]: [number, number]) =>
    (a === 25 && b === 27) || (a === 27 && b === 25);
  return [
    {
      key: "ab",
      edges: EDGES.filter(isAB),
      stroke: "rgba(120,200,255,0.55)",
      sw: 0.3,
    },
    {
      key: "4b",
      edges: EDGES.filter((e) => is4B(e)),
      stroke: "rgba(123,203,255,0.5)",
      sw: 0.3,
    },
    {
      key: "4",
      edges: EDGES.filter((e) => inv4(e) && !is4B(e) && !isVault(e)),
      stroke: "rgba(123,203,255,0.1)",
      sw: 0.18,
    },
    {
      key: "vault",
      edges: EDGES.filter(isVault),
      stroke: "rgba(245,158,11,0.65)",
      sw: 0.3,
    },
    {
      key: "aeth",
      edges: EDGES.filter(isAEth),
      stroke: "rgba(245,158,11,0.7)",
      sw: 0.3,
    },
    {
      key: "ethb",
      edges: EDGES.filter(isEthB),
      stroke: "rgba(245,158,11,0.7)",
      sw: 0.3,
    },
    {
      key: "bg",
      edges: EDGES.filter(
        (e) => !isAB(e) && !inv4(e) && !isAEth(e) && !isEthB(e),
      ),
      stroke: "rgba(120,180,220,0.12)",
      sw: 0.14,
    },
  ];
})();

function edgeGroupOpacity(key: string, step: number): number {
  if (step === 0) return 1;
  if (step === 8) return 0; // netting - all edges hidden
  if (step === 9) return key === "aeth" || key === "ethb" ? 1 : 0; // on-chain
  switch (key) {
    case "ab":
      return step === 1 || step === 3 || step === 4 || step === 7 ? 1 : 0.04;
    case "4b":
      return step === 2 || step === 5 || step === 6 ? 1 : 0.04;
    case "4":
      return step === 2 || step === 5 ? 0.3 : 0.04;
    case "vault":
      return step === 6 ? 1 : 0.04;
    case "aeth":
    case "ethb":
      return 0;
    default:
      return 0.04;
  }
}

// ── Steps ─────────────────────────────────────────────────────────────────────

const STEP_DURATIONS = [
  4200, 3800, 4000, 4500, 4500, 4500, 4500, 4000, 5500, 5000,
];
const TOTAL_STEPS = 10;
const STEP_INDICATORS = Array.from(
  { length: TOTAL_STEPS },
  (_, index) => `step-${index + 1}`,
);
const TERMINAL_DOTS = ["#ef4444", "#eab308", "#22c55e"];

// ── HTTP panels ───────────────────────────────────────────────────────────────

// Step 1: Agent A → Agent B   GET /resources/token-bundle
const REQUEST_ROWS = [
  [
    { c: "#3baeef", v: "GET " },
    { c: "#a3ffd6", v: "/resources/token-bundle " },
    { c: "rgba(200,215,242,0.45)", v: "HTTP/1.1" },
  ],
  [],
  [
    { c: "#64748b", v: "Host: " },
    { c: "rgb(200,215,242)", v: "resource-hub.agents.local" },
  ],
  [
    { c: "#64748b", v: "Accept: " },
    { c: "rgb(200,215,242)", v: "application/json" },
  ],
  [
    { c: "#64748b", v: "Authorization: " },
    { c: "rgb(200,215,242)", v: "Bearer eyJhbGciOiJFZERTQSJ9…" },
  ],
  [
    { c: "#64748b", v: "X-Agent-Id: " },
    { c: "rgb(200,215,242)", v: "trading-bot-v2.3.1" },
  ],
  [
    { c: "#64748b", v: "X-Request-Id: " },
    { c: "rgb(200,215,242)", v: "req_8f3a2b1c9d4e" },
  ],
];

// Step 2: Agent B → 4mica   POST /tabs
const TAB_ROWS = [
  [
    { c: "#3baeef", v: "POST " },
    { c: "#a3ffd6", v: "https://x402.4mica.xyz/tabs " },
    { c: "rgba(200,215,242,0.45)", v: "HTTP/1.1" },
  ],
  [],
  [
    { c: "#64748b", v: "Content-Type: " },
    { c: "rgb(200,215,242)", v: "application/json" },
  ],
  [],
  [{ c: "rgba(200,215,242,0.35)", v: "{" }],
  [
    { c: "#7dd3fc", v: '  "userAddress": ' },
    { c: "#86efac", v: '"0x28f3…TradingBot",' },
  ],
  [
    { c: "#7dd3fc", v: '  "recipientAddress": ' },
    { c: "#86efac", v: '"0x72e1…ResourceHub",' },
  ],
  [
    { c: "#7dd3fc", v: '  "network": ' },
    { c: "#86efac", v: '"eip155:11155111",' },
  ],
  [
    { c: "#7dd3fc", v: '  "erc20Token": ' },
    { c: "#86efac", v: '"0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582",' },
  ],
  [
    { c: "#7dd3fc", v: '  "ttlSeconds": ' },
    { c: "#fbbf24", v: "60" },
  ],
  [{ c: "rgba(200,215,242,0.35)", v: "}" }],
  [],
  [{ c: "#94a3b8", v: "← 200 OK" }],
  [{ c: "rgba(200,215,242,0.35)", v: "{" }],
  [
    { c: "#7dd3fc", v: '  "tabId": ' },
    { c: "#fbbf24", v: '"0x123",' },
  ],
  [
    { c: "#7dd3fc", v: '  "nextReqId": ' },
    { c: "#fbbf24", v: '"0x0",' },
  ],
  [
    { c: "#7dd3fc", v: '  "startTimestamp": ' },
    { c: "#fbbf24", v: "1742818860," },
  ],
  [
    { c: "#7dd3fc", v: '  "ttlSeconds": ' },
    { c: "#fbbf24", v: "60" },
  ],
  [{ c: "rgba(200,215,242,0.35)", v: "}" }],
];

// Step 3: Agent B → Agent A   402 Payment Required
const RESPONSE_ROWS = [
  [
    { c: "rgba(200,215,242,0.45)", v: "HTTP/1.1 " },
    { c: "#f87171", v: "402 Payment Required" },
  ],
  [],
  [
    { c: "#64748b", v: "Content-Type: " },
    { c: "rgb(200,215,242)", v: "application/json" },
  ],
  [],
  [{ c: "rgba(200,215,242,0.35)", v: "{" }],
  [
    { c: "#7dd3fc", v: '  "x402Version": ' },
    { c: "#fbbf24", v: "1," },
  ],
  [
    { c: "#7dd3fc", v: '  "error": ' },
    { c: "#f87171", v: '"guarantee required",' },
  ],
  [
    { c: "#7dd3fc", v: '  "accepts": ' },
    { c: "rgba(200,215,242,0.35)", v: "[{" },
  ],
  [
    { c: "#7dd3fc", v: '    "scheme": ' },
    { c: "#86efac", v: '"4mica-credit",' },
  ],
  [
    { c: "#7dd3fc", v: '    "network": ' },
    { c: "#86efac", v: '"eip155:11155111",' },
  ],
  [
    { c: "#7dd3fc", v: '    "maxAmountRequired": ' },
    { c: "#fbbf24", v: '"0x64",' },
  ],
  [
    { c: "#7dd3fc", v: '    "asset": ' },
    { c: "#86efac", v: '"0x41E94Eb…",' },
  ],
  [
    { c: "#7dd3fc", v: '    "payTo": ' },
    { c: "#86efac", v: '"0x72e1…ResourceHub",' },
  ],
  [
    { c: "#7dd3fc", v: '    "extra": ' },
    { c: "rgba(200,215,242,0.35)", v: "{" },
  ],
  [
    { c: "#7dd3fc", v: '      "tabEndpoint": ' },
    { c: "#7bcbff", v: '"https://x402.4mica.xyz/tabs",' },
  ],
  [
    { c: "#7dd3fc", v: '      "tabId": ' },
    { c: "#fbbf24", v: '"0x123"' },
  ],
  [{ c: "rgba(200,215,242,0.35)", v: "  }}]}" }],
];

// Step 4: Agent A signs EIP-712 and sends X-PAYMENT to Agent B
const SIGNING_ROWS = [
  [{ c: "#94a3b8", v: "// Sign EIP-712  SolGuaranteeRequestClaimsV1" }],
  [{ c: "rgba(200,215,242,0.35)", v: "{" }],
  [
    { c: "#7dd3fc", v: '  "domain":  ' },
    { c: "rgba(200,215,242,0.35)", v: "{ " },
    { c: "#7dd3fc", v: '"name": ' },
    { c: "#86efac", v: '"Core4Mica", ' },
    { c: "#7dd3fc", v: '"chainId": ' },
    { c: "#fbbf24", v: "11155111 " },
    { c: "rgba(200,215,242,0.35)", v: "}," },
  ],
  [
    { c: "#7dd3fc", v: '  "message": ' },
    { c: "rgba(200,215,242,0.35)", v: "{" },
  ],
  [
    { c: "#7dd3fc", v: '    "user_address": ' },
    { c: "#86efac", v: '"0x28f3…TradingBot",' },
  ],
  [
    { c: "#7dd3fc", v: '    "recipient_address": ' },
    { c: "#86efac", v: '"0x72e1…ResourceHub",' },
  ],
  [
    { c: "#7dd3fc", v: '    "tab_id": ' },
    { c: "#fbbf24", v: '"0x123",' },
  ],
  [
    { c: "#7dd3fc", v: '    "req_id": ' },
    { c: "#fbbf24", v: '"0x0",' },
  ],
  [
    { c: "#7dd3fc", v: '    "amount": ' },
    { c: "#fbbf24", v: '"0x64",' },
  ],
  [
    { c: "#7dd3fc", v: '    "asset_address": ' },
    { c: "#86efac", v: '"0x41E9…",' },
  ],
  [
    { c: "#7dd3fc", v: '    "timestamp": ' },
    { c: "#fbbf24", v: "1742818921" },
  ],
  [{ c: "rgba(200,215,242,0.35)", v: "  }}" }],
  [],
  [{ c: "#94a3b8", v: "// Send to Agent B with X-PAYMENT header" }],
  [
    { c: "#3baeef", v: "GET " },
    { c: "#a3ffd6", v: "/resources/token-bundle " },
    { c: "rgba(200,215,242,0.45)", v: "HTTP/1.1" },
  ],
  [
    { c: "#7bcbff", v: "X-PAYMENT: " },
    {
      c: "rgba(200,215,242,0.4)",
      v: "eyJ4NDAyVmVyc2lvbiI6MSwiInNjaGVtZSI6IjRtaWNhLWNyZWRpdCIsIn…",
    },
  ],
];

// Step 5: Agent B → 4mica   POST /settle
const SETTLE_ROWS = [
  [
    { c: "#3baeef", v: "POST " },
    { c: "#a3ffd6", v: "https://x402.4mica.xyz/settle " },
    { c: "rgba(200,215,242,0.45)", v: "HTTP/1.1" },
  ],
  [],
  [{ c: "rgba(200,215,242,0.35)", v: "{" }],
  [
    { c: "#7dd3fc", v: '  "x402Version": ' },
    { c: "#fbbf24", v: "1," },
  ],
  [
    { c: "#7dd3fc", v: '  "paymentPayload": ' },
    { c: "rgba(200,215,242,0.35)", v: "{" },
  ],
  [
    { c: "#7dd3fc", v: '    "claims": ' },
    { c: "rgba(200,215,242,0.35)", v: "{ " },
    { c: "#7dd3fc", v: '"tab_id": ' },
    { c: "#fbbf24", v: '"0x123", ' },
    { c: "#7dd3fc", v: '"req_id": ' },
    { c: "#fbbf24", v: '"0x0", ' },
    { c: "#7dd3fc", v: '"amount": ' },
    { c: "#fbbf24", v: '"0x64"' },
    { c: "rgba(200,215,242,0.35)", v: " }," },
  ],
  [
    { c: "#7dd3fc", v: '    "signature": ' },
    { c: "rgba(200,215,242,0.4)", v: '"0x5f8a…",' },
  ],
  [
    { c: "#7dd3fc", v: '    "scheme": ' },
    { c: "#86efac", v: '"eip712"' },
  ],
  [{ c: "rgba(200,215,242,0.35)", v: "  }" }],
  [{ c: "rgba(200,215,242,0.35)", v: "}" }],
  [],
  [{ c: "#94a3b8", v: "← 200 OK" }],
  [{ c: "rgba(200,215,242,0.35)", v: "{" }],
  [
    { c: "#7dd3fc", v: '  "success": ' },
    { c: "#86efac", v: "true," },
  ],
  [
    { c: "#7dd3fc", v: '  "certificate": ' },
    { c: "rgba(200,215,242,0.35)", v: "{" },
  ],
  [
    { c: "#7dd3fc", v: '    "claims": ' },
    { c: "rgba(200,215,242,0.4)", v: '"0xabcd…",' },
  ],
  [
    { c: "#7dd3fc", v: '    "signature": ' },
    { c: "rgba(200,215,242,0.4)", v: '"0x5678…"' },
  ],
  [{ c: "rgba(200,215,242,0.35)", v: "  }," }],
  [
    { c: "#7dd3fc", v: '  "error": ' },
    { c: "#86efac", v: "null" },
  ],
  [{ c: "rgba(200,215,242,0.35)", v: "}" }],
];

// Step 6: 4Mica locks collateral in Vault + issues guarantee to Agent B
const GUARANTEE_ROWS = [
  [{ c: "#94a3b8", v: "// 4Mica  ·  Guarantee Issuance  ·  tab 0x123" }],
  [],
  [{ c: "rgba(200,215,242,0.5)", v: "1. Verify EIP-712 signature" }],
  [
    { c: "#48c9b0", v: "   ✓ " },
    {
      c: "rgba(200,215,242,0.6)",
      v: "sig valid  ·  user 0x28f3  ·  amt 100 USDC",
    },
  ],
  [],
  [{ c: "rgba(200,215,242,0.5)", v: "2. Lock collateral in Vault" }],
  [
    { c: "#fbbf24", v: "await " },
    { c: "#48c9b0", v: "vault" },
    { c: "rgba(200,215,242,0.5)", v: "." },
    { c: "#3baeef", v: "lockCollateral" },
    { c: "rgba(200,215,242,0.5)", v: "({" },
  ],
  [
    { c: "#7dd3fc", v: "  tabId: " },
    { c: "#fbbf24", v: '"0x123",' },
  ],
  [
    { c: "#7dd3fc", v: "  user: " },
    { c: "#86efac", v: '"0x28f3…TradingBot",' },
  ],
  [
    { c: "#7dd3fc", v: "  amount: " },
    { c: "#fbbf24", v: '"0x64"' },
    { c: "#94a3b8", v: "  // 100 USDC" },
  ],
  [{ c: "rgba(200,215,242,0.5)", v: "})" }],
  [
    { c: "#48c9b0", v: "   ✓ " },
    { c: "rgba(200,215,242,0.6)", v: "locked  ·  lockId 0xfee1dead" },
  ],
  [],
  [{ c: "rgba(200,215,242,0.5)", v: "3. Issue guarantee → Agent B" }],
  [{ c: "rgba(200,215,242,0.35)", v: "{" }],
  [
    { c: "#7dd3fc", v: '  "tabId": ' },
    { c: "#fbbf24", v: '"0x123",' },
  ],
  [
    { c: "#7dd3fc", v: '  "lockId": ' },
    { c: "#fbbf24", v: '"0xfee1dead",' },
  ],
  [
    { c: "#7dd3fc", v: '  "guarantee": ' },
    { c: "rgba(200,215,242,0.4)", v: '"0x5678…cert"' },
  ],
  [{ c: "rgba(200,215,242,0.35)", v: "}" }],
  [
    { c: "#48c9b0", v: "   ✓ " },
    { c: "#4ade80", v: "guarantee delivered to Agent B" },
  ],
];

// Step 7: Agent B → Agent A   200 OK + resource
const OK_ROWS = [
  [
    { c: "rgba(200,215,242,0.45)", v: "HTTP/1.1 " },
    { c: "#4ade80", v: "200 OK" },
  ],
  [],
  [
    { c: "#64748b", v: "Content-Type: " },
    { c: "rgb(200,215,242)", v: "application/json" },
  ],
  [
    { c: "#64748b", v: "X-4MICA-CERT: " },
    { c: "rgba(200,215,242,0.4)", v: "eyJjbGFpbXMiOiIweGFiY2Qi…" },
  ],
  [],
  [{ c: "rgba(200,215,242,0.35)", v: "{" }],
  [
    { c: "#7dd3fc", v: '  "data": ' },
    { c: "rgba(200,215,242,0.35)", v: "{" },
  ],
  [
    { c: "#7dd3fc", v: '    "bundle": ' },
    { c: "#86efac", v: '"USDC/ETH-ARB-PERP",' },
  ],
  [
    { c: "#7dd3fc", v: '    "price": ' },
    { c: "#fbbf24", v: "3241.87," },
  ],
  [
    { c: "#7dd3fc", v: '    "ttl": ' },
    { c: "#fbbf24", v: "30" },
  ],
  [{ c: "rgba(200,215,242,0.35)", v: "  }," }],
  [
    { c: "#7dd3fc", v: '  "certificate": ' },
    { c: "rgba(200,215,242,0.35)", v: "{ " },
    { c: "#7dd3fc", v: '"claims": ' },
    { c: "rgba(200,215,242,0.4)", v: '"0xabcd…", ' },
    { c: "#7dd3fc", v: '"signature": ' },
    { c: "rgba(200,215,242,0.4)", v: '"0x5678…"' },
    { c: "rgba(200,215,242,0.35)", v: " }" },
  ],
  [{ c: "rgba(200,215,242,0.35)", v: "}" }],
];

// Step 7: 4mica internal netting & clearing
const NETTING_ROWS = [
  [{ c: "#94a3b8", v: "// 4Mica Netting Engine  ·  epoch 1742818980" }],
  [],
  [{ c: "rgba(200,215,242,0.5)", v: "Pending claims batch:" }],
  [
    { c: "#7dd3fc", v: "  0x28f3→0x72e1 " },
    { c: "#94a3b8", v: "req:0x0 " },
    { c: "#fbbf24", v: "100 USDC" },
    { c: "#48c9b0", v: "  ← our tx" },
  ],
  [
    { c: "#7dd3fc", v: "  0x91a2→0x4fd8 " },
    { c: "#94a3b8", v: "req:0x3 " },
    { c: "#fbbf24", v: " 50 USDC" },
  ],
  [
    { c: "#7dd3fc", v: "  0x72e1→0xb3c0 " },
    { c: "#94a3b8", v: "req:0x1 " },
    { c: "#fbbf24", v: "200 USDC" },
  ],
  [
    { c: "#7dd3fc", v: "  0x4fd8→0x28f3 " },
    { c: "#94a3b8", v: "req:0x2 " },
    { c: "#fbbf24", v: " 75 USDC" },
  ],
  [],
  [
    { c: "rgba(200,215,242,0.5)", v: "Gross notional: " },
    { c: "#fbbf24", v: "425 USDC" },
    { c: "#94a3b8", v: "  (4 transfers)" },
  ],
  [{ c: "rgba(200,215,242,0.5)", v: "After netting:" }],
  [
    { c: "#7dd3fc", v: "  0x28f3 " },
    { c: "rgba(200,215,242,0.4)", v: "net " },
    { c: "#f87171", v: "−25 USDC" },
    { c: "#94a3b8", v: "  pays" },
  ],
  [
    { c: "#7dd3fc", v: "  0x72e1 " },
    { c: "rgba(200,215,242,0.4)", v: "net " },
    { c: "#4ade80", v: "+100 USDC" },
    { c: "#94a3b8", v: "  receives" },
  ],
  [],
  [
    { c: "#4ade80", v: "  On-chain txs: 2/4 " },
    { c: "#94a3b8", v: "- 50% gas reduction" },
  ],
  [
    { c: "#48c9b0", v: "  Status: " },
    { c: "#4ade80", v: "CLEARING CONFIRMED ✓" },
  ],
];

// Step 8: Agent A submits payTabErc20 on-chain
const BLOCKCHAIN_ROWS = [
  [{ c: "#94a3b8", v: "// Agent A  ·  payTabInERC20Token()  ·  Sepolia" }],
  [],
  [
    { c: "#fbbf24", v: "await " },
    { c: "#48c9b0", v: "contractGateway" },
    { c: "rgba(200,215,242,0.5)", v: "." },
    { c: "#3baeef", v: "payTabErc20" },
    { c: "rgba(200,215,242,0.5)", v: "(" },
  ],
  [
    { c: "#7dd3fc", v: "  tabId: " },
    { c: "#fbbf24", v: '"0x123",' },
  ],
  [
    { c: "#7dd3fc", v: "  amount: " },
    { c: "#fbbf24", v: '"0x64",' },
    { c: "#94a3b8", v: "         // 100 USDC" },
  ],
  [
    { c: "#7dd3fc", v: "  erc20: " },
    { c: "#86efac", v: '"0x41E94Eb…",' },
  ],
  [
    { c: "#7dd3fc", v: "  recipient: " },
    { c: "#86efac", v: '"0x72e1…ResourceHub",' },
  ],
  [
    { c: "#7dd3fc", v: "  options: " },
    { c: "rgba(200,215,242,0.35)", v: "{ " },
    { c: "#7dd3fc", v: "timeout: " },
    { c: "#fbbf24", v: "60000 " },
    { c: "rgba(200,215,242,0.35)", v: "}," },
  ],
  [{ c: "rgba(200,215,242,0.5)", v: ")" }],
  [],
  [{ c: "#94a3b8", v: "// TransactionReceipt" }],
  [{ c: "rgba(200,215,242,0.35)", v: "{" }],
  [
    { c: "#7dd3fc", v: '  "transactionHash": ' },
    { c: "rgba(200,215,242,0.4)", v: '"0x7f3a…8b2d",' },
  ],
  [
    { c: "#7dd3fc", v: '  "blockNumber": ' },
    { c: "#fbbf24", v: "7842391," },
  ],
  [
    { c: "#7dd3fc", v: '  "status": ' },
    { c: "#4ade80", v: '"success",' },
  ],
  [
    { c: "#7dd3fc", v: '  "gasUsed": ' },
    { c: "#fbbf24", v: "52841" },
  ],
  [{ c: "rgba(200,215,242,0.35)", v: "}" }],
];

// ── Icons (normalized to ‑1 … +1 coordinate space) ───────────────────────────

const NODE_COLOR: Record<NodeType, string> = {
  agent: "#3baeef",
  api: "#48c9b0",
  db: "#a78bfa",
  chain: "#f59e0b",
  ext: "#86efac",
  brand: "#7bcbff",
};
const NODE_GLOW: Record<NodeType, string> = {
  agent: "rgba(59,174,239,0.18)",
  api: "rgba(72,201,176,0.18)",
  db: "rgba(167,139,250,0.18)",
  chain: "rgba(245,158,11,0.18)",
  ext: "rgba(134,239,172,0.18)",
  brand: "rgba(123,203,255,0.18)",
};

// CPU / chip - for AI agents
function IconChip() {
  return (
    <g
      fill="none"
      stroke="rgba(255,255,255,0.9)"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="0.16"
    >
      <rect x="-0.52" y="-0.52" width="1.04" height="1.04" rx="0.16" />
      <rect x="-0.22" y="-0.22" width="0.44" height="0.44" rx="0.07" />
      {/* pins */}
      <line x1="-0.22" y1="-0.52" x2="-0.22" y2="-0.72" />
      <line x1="0.22" y1="-0.52" x2="0.22" y2="-0.72" />
      <line x1="-0.22" y1="0.52" x2="-0.22" y2="0.72" />
      <line x1="0.22" y1="0.52" x2="0.22" y2="0.72" />
      <line x1="-0.52" y1="-0.22" x2="-0.72" y2="-0.22" />
      <line x1="-0.52" y1="0.22" x2="-0.72" y2="0.22" />
      <line x1="0.52" y1="-0.22" x2="0.72" y2="-0.22" />
      <line x1="0.52" y1="0.22" x2="0.72" y2="0.22" />
    </g>
  );
}

// Server rack - for APIs
function IconServer() {
  return (
    <g
      fill="none"
      stroke="rgba(255,255,255,0.9)"
      strokeLinecap="round"
      strokeWidth="0.14"
    >
      <rect x="-0.62" y="-0.62" width="1.24" height="0.38" rx="0.09" />
      <rect x="-0.62" y="-0.19" width="1.24" height="0.38" rx="0.09" />
      <rect x="-0.62" y="0.24" width="1.24" height="0.38" rx="0.09" />
      <circle
        cx="0.38"
        cy="-0.43"
        r="0.09"
        fill="rgba(255,255,255,0.9)"
        stroke="none"
      />
      <circle
        cx="0.38"
        cy="0"
        r="0.09"
        fill="rgba(255,255,255,0.9)"
        stroke="none"
      />
      <circle
        cx="0.38"
        cy="0.43"
        r="0.09"
        fill="rgba(255,255,255,0.9)"
        stroke="none"
      />
    </g>
  );
}

// Cylinder - for databases
function IconDatabase() {
  return (
    <g
      fill="none"
      stroke="rgba(255,255,255,0.9)"
      strokeLinecap="round"
      strokeWidth="0.14"
    >
      <ellipse rx="0.52" ry="0.19" cy="-0.38" />
      <line x1="-0.52" y1="-0.38" x2="-0.52" y2="0.38" />
      <line x1="0.52" y1="-0.38" x2="0.52" y2="0.38" />
      <ellipse rx="0.52" ry="0.19" cy="0.38" />
      <ellipse rx="0.52" ry="0.19" strokeDasharray="0.18 0.12" />
    </g>
  );
}

// Chain links - for blockchains
function IconChain() {
  return (
    <g
      fill="none"
      stroke="rgba(255,255,255,0.9)"
      strokeLinecap="round"
      strokeWidth="0.16"
    >
      <rect x="-0.72" y="-0.58" width="0.68" height="0.44" rx="0.22" />
      <rect x="0.04" y="0.14" width="0.68" height="0.44" rx="0.22" />
      <line x1="-0.04" y1="-0.36" x2="0.04" y2="0.36" strokeWidth="0.13" />
    </g>
  );
}

// Globe - for external services
function IconGlobe() {
  return (
    <g
      fill="none"
      stroke="rgba(255,255,255,0.9)"
      strokeLinecap="round"
      strokeWidth="0.13"
    >
      <circle r="0.65" />
      <ellipse rx="0.28" ry="0.65" />
      <line x1="-0.65" y1="0" x2="0.65" y2="0" />
      <line x1="-0.52" y1="-0.38" x2="0.52" y2="-0.38" />
      <line x1="-0.52" y1="0.38" x2="0.52" y2="0.38" />
    </g>
  );
}

// Shopping cart - for shopping bots
function IconCart() {
  return (
    <g
      fill="none"
      stroke="rgba(255,255,255,0.9)"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="0.15"
    >
      <path d="M -0.68 -0.55 L -0.44 -0.55 L -0.08 0.32 L 0.58 0.32 L 0.72 -0.22 L -0.08 -0.22" />
      <circle
        cx="0.02"
        cy="0.57"
        r="0.13"
        fill="rgba(255,255,255,0.9)"
        stroke="none"
      />
      <circle
        cx="0.48"
        cy="0.57"
        r="0.13"
        fill="rgba(255,255,255,0.9)"
        stroke="none"
      />
    </g>
  );
}

function resolveIcon(node: NetNode) {
  if (node.name === "ShopBot" || node.name === "CartAgent") return <IconCart />;
  switch (node.type) {
    case "agent":
      return <IconChip />;
    case "api":
      return <IconServer />;
    case "db":
      return <IconDatabase />;
    case "chain":
      return <IconChain />;
    case "ext":
    case "brand":
      return <IconGlobe />;
  }
}

// ── Node component ────────────────────────────────────────────────────────────

const NodeShape = memo(function NodeShape({
  node,
  dim,
  showLabels,
  isStep6,
}: {
  node: NetNode;
  dim: boolean;
  showLabels: boolean;
  isStep6: boolean;
}) {
  const { x, y, type, name, id, size } = node;
  const isA = id === FA,
    isB = id === FB,
    isFocus = isA || isB;
  const is4mica = id === 25;
  const color = NODE_COLOR[type];

  // ── 4mica special rendering ──
  if (is4mica) {
    return (
      <g style={{ opacity: dim ? 0.05 : 1, transition: "opacity 0.85s ease" }}>
        <motion.circle
          cx={x}
          cy={y}
          r={size * 2.2}
          fill={isStep6 ? "rgba(72,201,176,0.09)" : "rgba(123,203,255,0.05)"}
          animate={{ r: [size * 2, size * (isStep6 ? 3.2 : 2.6), size * 2] }}
          transition={{
            duration: isStep6 ? 1.8 : 3.5,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
        <motion.circle
          cx={x}
          cy={y}
          r={size * 1.6}
          fill={isStep6 ? "rgba(72,201,176,0.13)" : "rgba(123,203,255,0.08)"}
          animate={{
            r: [size * 1.4, size * (isStep6 ? 2.2 : 1.8), size * 1.4],
          }}
          transition={{
            duration: isStep6 ? 1.4 : 2.8,
            repeat: Infinity,
            ease: "easeInOut",
            delay: 0.6,
          }}
        />
        {isStep6 && (
          <circle
            cx={x}
            cy={y}
            r={size * 1.1}
            fill="none"
            stroke="rgba(72,201,176,0.35)"
            strokeWidth="0.25"
            strokeDasharray="1.5 1"
            style={{
              transformOrigin: `${x}px ${y}px`,
              animation: "nlSpin 3s linear infinite",
            }}
          />
        )}
        <circle
          cx={x}
          cy={y}
          r={size}
          fill="rgba(5,11,29,0.92)"
          stroke="rgba(123,203,255,0.45)"
          strokeWidth="0.3"
        />
        <image
          href="/assets/logo_transparent.png"
          x={x - size * 0.82}
          y={y - size * 0.82}
          width={size * 1.64}
          height={size * 1.64}
          preserveAspectRatio="xMidYMid meet"
        />
        <text
          x={x}
          y={y + size + 2}
          textAnchor="middle"
          fontSize="2"
          fontWeight="700"
          fill="rgba(123,203,255,0.9)"
          style={{
            fontFamily: "var(--font-display)",
            pointerEvents: "none",
            letterSpacing: "-0.02em",
          }}
        >
          4Mica
        </text>
      </g>
    );
  }

  const lblY = y > 83 ? y - size - 1.4 : y + size + 1.8;
  const iconScale = size * 0.52;

  return (
    <g style={{ opacity: dim ? 0.05 : 1, transition: "opacity 0.85s ease" }}>
      <circle cx={x} cy={y} r={size * 2.2} fill={NODE_GLOW[type]} />
      <circle
        cx={x}
        cy={y}
        r={size}
        fill={color}
        stroke="rgba(255,255,255,0.1)"
        strokeWidth="0.15"
      />
      <g transform={`translate(${x},${y}) scale(${iconScale})`}>
        {resolveIcon(node)}
      </g>
      <text
        x={x}
        y={lblY}
        textAnchor="middle"
        fontSize="1.45"
        fill="rgba(200,215,242,0.65)"
        style={{ fontFamily: "var(--font-geist-mono)", pointerEvents: "none" }}
      >
        {name}
      </text>
      {isFocus && showLabels && (
        <>
          <text
            x={x}
            y={y - size - 2.2}
            textAnchor="middle"
            fontSize="2.2"
            fontWeight="600"
            fill={color}
            style={{ fontFamily: "var(--font-display)", pointerEvents: "none" }}
          >
            {isA ? "Agent A" : "Agent B"}
          </text>
          <motion.circle
            cx={x}
            cy={y}
            r={size + 1.8}
            fill="none"
            stroke={color}
            strokeWidth="0.3"
            strokeDasharray="1.2 1"
            animate={{ r: [size + 1.5, size + 3, size + 1.5] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
          />
        </>
      )}
    </g>
  );
});

// ── Netting Ledger (SVG overlay on 4mica, step 6) ─────────────────────────────

function NettingLedger() {
  const X = 31,
    Y = 23,
    W = 38,
    H = 20.5;
  const entries = [
    { pair: "0x28f3→0x72e1", amt: "+100", status: "CREDIT ↑", c: "#4ade80" },
    { pair: "0x91a2→0x4fd8", amt: " +50", status: "CREDIT ↑", c: "#4ade80" },
    { pair: "0x72e1→0xb3c0", amt: "-200", status: "OFFSET  ↓", c: "#f87171" },
    { pair: "0x4fd8→0x28f3", amt: " -75", status: "OFFSET  ↓", c: "#f87171" },
  ];
  return (
    <motion.g
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.45 }}
    >
      {/* Panel background */}
      <rect
        x={X}
        y={Y}
        width={W}
        height={H}
        rx="0.75"
        fill="rgba(2,5,14,0.97)"
        stroke="rgba(72,201,176,0.45)"
        strokeWidth="0.18"
      />
      {/* Header bar */}
      <rect
        x={X}
        y={Y}
        width={W}
        height="3.4"
        rx="0.75"
        fill="rgba(72,201,176,0.1)"
      />
      <text
        x={X + W / 2}
        y={Y + 2.35}
        textAnchor="middle"
        fontSize="1.5"
        fontWeight="700"
        fill="rgba(72,201,176,0.92)"
        style={{ fontFamily: "var(--font-display)", letterSpacing: "-0.01em" }}
      >
        ⚖ NETTING &amp; CLEARING ENGINE
      </text>
      <line
        x1={X}
        y1={Y + 3.4}
        x2={X + W}
        y2={Y + 3.4}
        stroke="rgba(72,201,176,0.22)"
        strokeWidth="0.13"
      />
      {/* Column headers */}
      <text
        x={X + 1}
        y={Y + 5.1}
        fontSize="0.95"
        fill="rgba(100,116,139,0.75)"
        style={{ fontFamily: "var(--font-geist-mono)" }}
      >
        FROM → TO
      </text>
      <text
        x={X + 20.5}
        y={Y + 5.1}
        fontSize="0.95"
        fill="rgba(100,116,139,0.75)"
        style={{ fontFamily: "var(--font-geist-mono)" }}
      >
        USDC
      </text>
      <text
        x={X + 26.5}
        y={Y + 5.1}
        fontSize="0.95"
        fill="rgba(100,116,139,0.75)"
        style={{ fontFamily: "var(--font-geist-mono)" }}
      >
        NET STATUS
      </text>
      <line
        x1={X}
        y1={Y + 5.7}
        x2={X + W}
        y2={Y + 5.7}
        stroke="rgba(72,201,176,0.12)"
        strokeWidth="0.1"
      />
      {/* Rows */}
      {entries.map((e, i) => (
        <g
          key={e.pair}
          style={{
            opacity: 0,
            animation: `nlFade 0.28s ${0.45 + i * 0.48}s ease forwards`,
          }}
        >
          {i % 2 === 0 && (
            <rect
              x={X + 0.2}
              y={Y + 6.1 + i * 3.0}
              width={W - 0.4}
              height="2.8"
              fill="rgba(255,255,255,0.018)"
            />
          )}
          <text
            x={X + 1}
            y={Y + 7.7 + i * 3.0}
            fontSize="1.05"
            fill="rgba(170,190,225,0.75)"
            style={{ fontFamily: "var(--font-geist-mono)" }}
          >
            {e.pair}
          </text>
          <text
            x={X + 20.5}
            y={Y + 7.7 + i * 3.0}
            fontSize="1.05"
            fill={e.c}
            style={{ fontFamily: "var(--font-geist-mono)" }}
          >
            {e.amt}
          </text>
          <text
            x={X + 26.5}
            y={Y + 7.7 + i * 3.0}
            fontSize="1.05"
            fill={e.c}
            style={{ fontFamily: "var(--font-geist-mono)" }}
          >
            {e.status}
          </text>
        </g>
      ))}
      {/* Separator */}
      <line
        x1={X + 1}
        y1={Y + 18.0}
        x2={X + W - 1}
        y2={Y + 18.0}
        stroke="rgba(72,201,176,0.38)"
        strokeWidth="0.16"
        style={{ opacity: 0, animation: "nlFade 0.3s 2.5s ease forwards" }}
      />
      {/* Net result */}
      <text
        x={X + 1}
        y={Y + 19.85}
        fontSize="1.25"
        fontWeight="700"
        fill="rgba(72,201,176,0.95)"
        style={{
          fontFamily: "var(--font-geist-mono)",
          opacity: 0,
          animation: "nlFade 0.4s 2.85s ease forwards",
        }}
      >
        NET 25 USDC · 2 / 4 ON-CHAIN · −50% GAS ✓
      </text>
    </motion.g>
  );
}

// ── Legend ────────────────────────────────────────────────────────────────────

const LEGEND_ITEMS: { type: NodeType; label: string }[] = [
  { type: "agent", label: "AI Agent" },
  { type: "api", label: "API Server" },
  { type: "db", label: "Database" },
  { type: "chain", label: "Blockchain" },
  { type: "ext", label: "External Svc" },
];

// ── Terminal panel ────────────────────────────────────────────────────────────

type TerminalToken = { c: string; v: string };

const getTerminalRowKey = (
  row: TerminalToken[],
  counts: Map<string, number>,
) => {
  const baseKey =
    row.length > 0 ? row.map(({ c, v }) => `${c}:${v}`).join("|") : "blank-row";
  const count = counts.get(baseKey) ?? 0;
  counts.set(baseKey, count + 1);
  return `${baseKey}:${count}`;
};

const getTerminalTokenKey = (
  token: TerminalToken,
  counts: Map<string, number>,
) => {
  const baseKey = `${token.c}:${token.v}`;
  const count = counts.get(baseKey) ?? 0;
  counts.set(baseKey, count + 1);
  return `${baseKey}:${count}`;
};

function TerminalPanel({
  rows,
  title,
  accent,
  visible,
}: {
  rows: TerminalToken[][];
  title: string;
  accent: string;
  visible: boolean;
}) {
  const rowCounts = new Map<string, number>();

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? "auto" : "none",
        transition: "opacity 0.4s ease",
      }}
    >
      <div
        className="w-full overflow-hidden rounded-xl"
        style={{
          background: "rgba(4,8,20,0.95)",
          border: `1px solid ${accent}33`,
          boxShadow: `0 0 28px ${accent}18, 0 16px 40px rgba(0,0,0,0.65)`,
          backdropFilter: "blur(20px)",
        }}
      >
        <div
          className="flex items-center gap-2 border-b px-4 py-2"
          style={{ borderColor: `${accent}22`, background: `${accent}0b` }}
        >
          <div className="flex gap-1.5">
            {TERMINAL_DOTS.map((c) => (
              <div
                key={c}
                className="h-2 w-2 rounded-full"
                style={{ background: c, opacity: 0.5 }}
              />
            ))}
          </div>
          <span
            className="ml-2 font-mono text-[10px]"
            style={{ color: `${accent}bb` }}
          >
            {title}
          </span>
        </div>
        <div className="max-h-52 overflow-auto px-5 py-3 font-mono text-[11px] leading-[1.7]">
          {rows.map((row) => {
            const rowKey = getTerminalRowKey(row, rowCounts);
            const tokenCounts = new Map<string, number>();

            return row.length === 0 ? (
              <div key={rowKey} className="h-2" />
            ) : (
              <div key={rowKey} className="flex flex-wrap">
                {row.map((t) => (
                  <span
                    key={getTerminalTokenKey(t, tokenCounts)}
                    style={{ color: t.c }}
                  >
                    {t.v}
                  </span>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function DemoPage() {
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);

  const goNext = useCallback(() => {
    setStep((s) => {
      if (s < TOTAL_STEPS - 1) return s + 1;
      setPlaying(false);
      return s;
    });
  }, []);
  const goPrev = useCallback(() => {
    setPlaying(false);
    setStep((s) => Math.max(0, s - 1));
  }, []);

  useEffect(() => {
    if (!playing) return;
    const t = setTimeout(() => {
      if (step < TOTAL_STEPS - 1) setStep((s) => s + 1);
      else setPlaying(false);
    }, STEP_DURATIONS[step]);
    return () => clearTimeout(t);
  }, [playing, step]);

  const togglePlay = useCallback(() => {
    if (step >= TOTAL_STEPS - 1) {
      setStep(0);
      setPlaying(true);
    } else setPlaying((p) => !p);
  }, [step]);

  const nodeA = NODES[FA],
    nodeB = NODES[FB];
  const mx = ((nodeA.x + nodeB.x) / 2).toFixed(1);
  const my = ((nodeA.y + nodeB.y) / 2).toFixed(1);

  return (
    <div
      className="relative h-screen w-screen overflow-hidden"
      style={{ background: "rgb(6,9,15)" }}
    >
      {/* ── Network SVG - full screen on step 0, right of panel otherwise ── */}
      <div
        className="fixed top-0 right-0 bottom-0 overflow-hidden"
        style={{
          left: step === 0 ? "0px" : "352px",
          transition: "left 0.7s ease",
        }}
      >
        <svg
          aria-hidden="true"
          focusable="false"
          viewBox="0 0 100 100"
          preserveAspectRatio="xMidYMid meet"
          className="h-full w-full"
          style={{
            transformOrigin: `${mx}% ${my}%`,
            transform: `scale(${step === 0 ? 1 : step === 8 ? 1.5 : step === 9 ? 1 : 2.2})`,
            transition: "transform 1.15s cubic-bezier(0.4,0,0.2,1)",
            willChange: "transform",
          }}
        >
          {/* Edges - 6 groups with CSS opacity transition instead of 80+ elements */}
          {EDGE_GROUPS.map(({ key, edges, stroke, sw }) => (
            <g
              key={key}
              stroke={stroke}
              strokeWidth={sw}
              style={{
                opacity: edgeGroupOpacity(key, step),
                transition: "opacity 0.5s ease",
              }}
            >
              {edges.map(([a, b]) => (
                <line
                  key={`${a}-${b}`}
                  x1={NODE_MAP[a]?.x}
                  y1={NODE_MAP[a]?.y}
                  x2={NODE_MAP[b]?.x}
                  y2={NODE_MAP[b]?.y}
                />
              ))}
            </g>
          ))}

          {/* Pulses - step 0 */}
          {step === 0 &&
            EDGES.map(([a, b], i) => {
              if (i % 2 !== 0) return null;
              const col =
                i % 3 === 0
                  ? "rgba(72,201,176,0.75)"
                  : i % 3 === 1
                    ? "rgba(59,174,239,0.65)"
                    : "rgba(167,139,250,0.6)";
              return (
                <circle key={`pulse-${a}-${b}`} r="0.5" fill={col}>
                  <animateMotion
                    dur={`${1.6 + (i % 7) * 0.3}s`}
                    begin={`${-(i * 0.5) % 3}s`}
                    repeatCount="indefinite"
                    path={`M ${NODE_MAP[a]?.x ?? 0} ${NODE_MAP[a]?.y ?? 0} L ${NODE_MAP[b]?.x ?? 0} ${NODE_MAP[b]?.y ?? 0}`}
                  />
                </circle>
              );
            })}

          {/* Step 1: A→B GET request */}
          {step === 1 && (
            <>
              <circle r="2.2" fill="rgba(59,174,239,0.12)">
                <animateMotion
                  dur="1.8s"
                  repeatCount="indefinite"
                  path={`M ${nodeA.x} ${nodeA.y} L ${nodeB.x} ${nodeB.y}`}
                />
              </circle>
              <circle r="1.0" fill="#3baeef">
                <animateMotion
                  dur="1.8s"
                  repeatCount="indefinite"
                  path={`M ${nodeA.x} ${nodeA.y} L ${nodeB.x} ${nodeB.y}`}
                />
              </circle>
              <circle r="0.5" fill="rgba(59,174,239,0.4)">
                <animateMotion
                  dur="1.8s"
                  begin="-0.18s"
                  repeatCount="indefinite"
                  path={`M ${nodeA.x} ${nodeA.y} L ${nodeB.x} ${nodeB.y}`}
                />
              </circle>
            </>
          )}

          {/* Step 2: B→4mica POST /tabs */}
          {step === 2 &&
            (() => {
              const n4 = NODE_MAP[25];
              return (
                <>
                  <circle r="2.2" fill="rgba(72,201,176,0.1)">
                    <animateMotion
                      dur="1.8s"
                      repeatCount="indefinite"
                      path={`M ${nodeB.x} ${nodeB.y} L ${n4.x} ${n4.y}`}
                    />
                  </circle>
                  <circle r="1.0" fill="#48c9b0">
                    <animateMotion
                      dur="1.8s"
                      repeatCount="indefinite"
                      path={`M ${nodeB.x} ${nodeB.y} L ${n4.x} ${n4.y}`}
                    />
                  </circle>
                  <circle r="0.5" fill="rgba(72,201,176,0.4)">
                    <animateMotion
                      dur="1.8s"
                      begin="-0.18s"
                      repeatCount="indefinite"
                      path={`M ${nodeB.x} ${nodeB.y} L ${n4.x} ${n4.y}`}
                    />
                  </circle>
                  <circle r="0.8" fill="rgba(123,203,255,0.6)">
                    <animateMotion
                      dur="1.8s"
                      begin="-0.9s"
                      repeatCount="indefinite"
                      path={`M ${n4.x} ${n4.y} L ${nodeB.x} ${nodeB.y}`}
                    />
                  </circle>
                </>
              );
            })()}

          {/* Step 3: B→A 402 */}
          {step === 3 && (
            <>
              <circle r="2.2" fill="rgba(248,113,113,0.1)">
                <animateMotion
                  dur="1.8s"
                  repeatCount="indefinite"
                  path={`M ${nodeB.x} ${nodeB.y} L ${nodeA.x} ${nodeA.y}`}
                />
              </circle>
              <circle r="1.0" fill="#f87171">
                <animateMotion
                  dur="1.8s"
                  repeatCount="indefinite"
                  path={`M ${nodeB.x} ${nodeB.y} L ${nodeA.x} ${nodeA.y}`}
                />
              </circle>
              <circle r="0.5" fill="rgba(248,113,113,0.4)">
                <animateMotion
                  dur="1.8s"
                  begin="-0.18s"
                  repeatCount="indefinite"
                  path={`M ${nodeB.x} ${nodeB.y} L ${nodeA.x} ${nodeA.y}`}
                />
              </circle>
            </>
          )}

          {/* Step 4: A→B with X-PAYMENT */}
          {step === 4 && (
            <>
              <circle r="2.2" fill="rgba(59,174,239,0.12)">
                <animateMotion
                  dur="1.8s"
                  repeatCount="indefinite"
                  path={`M ${nodeA.x} ${nodeA.y} L ${nodeB.x} ${nodeB.y}`}
                />
              </circle>
              <circle r="1.0" fill="#3baeef">
                <animateMotion
                  dur="1.8s"
                  repeatCount="indefinite"
                  path={`M ${nodeA.x} ${nodeA.y} L ${nodeB.x} ${nodeB.y}`}
                />
              </circle>
              <circle r="0.5" fill="rgba(59,174,239,0.4)">
                <animateMotion
                  dur="1.8s"
                  begin="-0.18s"
                  repeatCount="indefinite"
                  path={`M ${nodeA.x} ${nodeA.y} L ${nodeB.x} ${nodeB.y}`}
                />
              </circle>
            </>
          )}

          {/* Step 5: B→4mica POST /settle */}
          {step === 5 &&
            (() => {
              const n4 = NODE_MAP[25];
              return (
                <>
                  <circle r="2.2" fill="rgba(72,201,176,0.1)">
                    <animateMotion
                      dur="1.8s"
                      repeatCount="indefinite"
                      path={`M ${nodeB.x} ${nodeB.y} L ${n4.x} ${n4.y}`}
                    />
                  </circle>
                  <circle r="1.0" fill="#48c9b0">
                    <animateMotion
                      dur="1.8s"
                      repeatCount="indefinite"
                      path={`M ${nodeB.x} ${nodeB.y} L ${n4.x} ${n4.y}`}
                    />
                  </circle>
                  <circle r="0.5" fill="rgba(72,201,176,0.4)">
                    <animateMotion
                      dur="1.8s"
                      begin="-0.18s"
                      repeatCount="indefinite"
                      path={`M ${nodeB.x} ${nodeB.y} L ${n4.x} ${n4.y}`}
                    />
                  </circle>
                  <circle r="0.8" fill="rgba(123,203,255,0.65)">
                    <animateMotion
                      dur="1.8s"
                      begin="-0.9s"
                      repeatCount="indefinite"
                      path={`M ${n4.x} ${n4.y} L ${nodeB.x} ${nodeB.y}`}
                    />
                  </circle>
                </>
              );
            })()}

          {/* Step 6: 4Mica → Vault (lock collateral) + 4Mica → B (guarantee) */}
          {step === 6 &&
            (() => {
              const n4 = NODE_MAP[25];
              const nv = NODE_MAP[27];
              return (
                <>
                  <circle r="2.0" fill="rgba(245,158,11,0.1)">
                    <animateMotion
                      dur="1.5s"
                      repeatCount="indefinite"
                      path={`M ${n4.x} ${n4.y} L ${nv.x} ${nv.y}`}
                    />
                  </circle>
                  <circle r="0.9" fill="#f59e0b">
                    <animateMotion
                      dur="1.5s"
                      repeatCount="indefinite"
                      path={`M ${n4.x} ${n4.y} L ${nv.x} ${nv.y}`}
                    />
                  </circle>
                  <circle r="0.55" fill="rgba(245,158,11,0.55)">
                    <animateMotion
                      dur="1.5s"
                      begin="-0.75s"
                      repeatCount="indefinite"
                      path={`M ${nv.x} ${nv.y} L ${n4.x} ${n4.y}`}
                    />
                  </circle>
                  <circle r="2.0" fill="rgba(72,201,176,0.1)">
                    <animateMotion
                      dur="1.8s"
                      begin="-0.3s"
                      repeatCount="indefinite"
                      path={`M ${n4.x} ${n4.y} L ${nodeB.x} ${nodeB.y}`}
                    />
                  </circle>
                  <circle r="0.9" fill="#48c9b0">
                    <animateMotion
                      dur="1.8s"
                      begin="-0.3s"
                      repeatCount="indefinite"
                      path={`M ${n4.x} ${n4.y} L ${nodeB.x} ${nodeB.y}`}
                    />
                  </circle>
                </>
              );
            })()}

          {/* Step 7: B→A 200 OK + resource delivered */}
          {step === 7 && (
            <>
              <circle r="2.2" fill="rgba(74,222,128,0.1)">
                <animateMotion
                  dur="1.8s"
                  repeatCount="indefinite"
                  path={`M ${nodeB.x} ${nodeB.y} L ${nodeA.x} ${nodeA.y}`}
                />
              </circle>
              <circle r="1.0" fill="#4ade80">
                <animateMotion
                  dur="1.8s"
                  repeatCount="indefinite"
                  path={`M ${nodeB.x} ${nodeB.y} L ${nodeA.x} ${nodeA.y}`}
                />
              </circle>
              <circle r="0.5" fill="rgba(74,222,128,0.4)">
                <animateMotion
                  dur="1.8s"
                  begin="-0.18s"
                  repeatCount="indefinite"
                  path={`M ${nodeB.x} ${nodeB.y} L ${nodeA.x} ${nodeA.y}`}
                />
              </circle>
            </>
          )}

          {/* Step 9: A submits payTabErc20 - A → ETH Node → B */}
          {step === 9 &&
            (() => {
              const ethNode = NODE_MAP[15];
              return (
                <>
                  <circle r="2.4" fill="rgba(245,158,11,0.1)">
                    <animateMotion
                      dur="1.5s"
                      repeatCount="indefinite"
                      path={`M ${nodeA.x} ${nodeA.y} L ${ethNode.x} ${ethNode.y}`}
                    />
                  </circle>
                  <circle r="1.1" fill="#f59e0b">
                    <animateMotion
                      dur="1.5s"
                      repeatCount="indefinite"
                      path={`M ${nodeA.x} ${nodeA.y} L ${ethNode.x} ${ethNode.y}`}
                    />
                  </circle>
                  <circle r="0.5" fill="rgba(245,158,11,0.4)">
                    <animateMotion
                      dur="1.5s"
                      begin="-0.18s"
                      repeatCount="indefinite"
                      path={`M ${nodeA.x} ${nodeA.y} L ${ethNode.x} ${ethNode.y}`}
                    />
                  </circle>
                  <circle r="2.0" fill="rgba(74,222,128,0.1)">
                    <animateMotion
                      dur="1.5s"
                      begin="-0.75s"
                      repeatCount="indefinite"
                      path={`M ${ethNode.x} ${ethNode.y} L ${nodeB.x} ${nodeB.y}`}
                    />
                  </circle>
                  <circle r="0.9" fill="rgba(74,222,128,0.8)">
                    <animateMotion
                      dur="1.5s"
                      begin="-0.75s"
                      repeatCount="indefinite"
                      path={`M ${ethNode.x} ${ethNode.y} L ${nodeB.x} ${nodeB.y}`}
                    />
                  </circle>
                  <circle r="0.45" fill="rgba(74,222,128,0.4)">
                    <animateMotion
                      dur="1.5s"
                      begin="-0.95s"
                      repeatCount="indefinite"
                      path={`M ${ethNode.x} ${ethNode.y} L ${nodeB.x} ${nodeB.y}`}
                    />
                  </circle>
                </>
              );
            })()}

          {/* Nodes */}
          {NODES.map((n) => {
            const is4mica = n.id === 25;
            const isVaultNode = n.id === 27;
            const isFocus = n.id === FA || n.id === FB;
            const inactive =
              n.name === "SOL Node" ||
              n.name === "BTC Bridge" ||
              n.name === "USDC";
            const isActiveChain =
              n.type === "chain" && !inactive && n.id === 15;
            const dim =
              inactive ||
              (step === 8
                ? !is4mica
                : step === 9
                  ? !isFocus && !isActiveChain
                  : step === 6
                    ? !is4mica && !isVaultNode && n.id !== FB
                    : step >= 1 && !isFocus && !is4mica);
            return (
              <NodeShape
                key={n.id}
                node={n}
                dim={dim}
                showLabels={step >= 1}
                isStep6={step === 8}
              />
            );
          })}

          {/* Netting ledger overlay - step 6 only */}
          <AnimatePresence>
            {step === 8 && <NettingLedger key="netting" />}
          </AnimatePresence>
        </svg>
      </div>

      {/* ── Left-side panel ── */}
      <div
        className="fixed left-4 z-20 w-80"
        style={{ top: "calc(50vh - 210px)", height: "420px" }}
      >
        <TerminalPanel
          rows={REQUEST_ROWS}
          title="A → B  ·  GET /resources/token-bundle"
          accent="#3baeef"
          visible={step === 1}
        />
        <TerminalPanel
          rows={TAB_ROWS}
          title="B → 4Mica  ·  POST /tabs"
          accent="#48c9b0"
          visible={step === 2}
        />
        <TerminalPanel
          rows={RESPONSE_ROWS}
          title="B → A  ·  402 Payment Required"
          accent="#f87171"
          visible={step === 3}
        />
        <TerminalPanel
          rows={SIGNING_ROWS}
          title="A  signs EIP-712  ·  X-PAYMENT → B"
          accent="#7bcbff"
          visible={step === 4}
        />
        <TerminalPanel
          rows={SETTLE_ROWS}
          title="B → 4Mica  ·  POST /settle"
          accent="#48c9b0"
          visible={step === 5}
        />
        <TerminalPanel
          rows={GUARANTEE_ROWS}
          title="4Mica  ·  Vault Lock  ·  Guarantee → B"
          accent="#f59e0b"
          visible={step === 6}
        />
        <TerminalPanel
          rows={OK_ROWS}
          title="B → A  ·  200 OK  ·  Resource Delivered"
          accent="#4ade80"
          visible={step === 7}
        />
        <TerminalPanel
          rows={NETTING_ROWS}
          title="4Mica  ·  Netting &amp; Clearing Engine"
          accent="#48c9b0"
          visible={step === 8}
        />
        <TerminalPanel
          rows={BLOCKCHAIN_ROWS}
          title="A  ·  payTabErc20()  ·  On-Chain"
          accent="#f59e0b"
          visible={step === 9}
        />
      </div>

      {/* ── UI overlay - full screen on step 0, right of panel otherwise ── */}
      <div
        className="pointer-events-none fixed top-0 right-0 bottom-0 z-10 flex flex-col items-center justify-between"
        style={{
          left: step === 0 ? "0px" : "352px",
          transition: "left 0.7s ease",
        }}
      >
        {/* Top spacer */}
        <div className="pt-8" />

        {/* Middle: click zone + legend */}
        <button
          type="button"
          aria-label={
            playing ? "Pause protocol animation" : "Play protocol animation"
          }
          className="pointer-events-auto relative block w-full flex-1 cursor-pointer appearance-none border-0 bg-transparent p-0 text-left"
          onClick={togglePlay}
        >
          {/* Legend */}
          <AnimatePresence>
            {step === 0 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="pointer-events-none absolute top-4 right-6 flex flex-col gap-1.5"
              >
                {LEGEND_ITEMS.map(({ type, label }) => (
                  <div key={type} className="flex items-center gap-2">
                    <div
                      className="h-2 w-2 rounded-full"
                      style={{
                        background: NODE_COLOR[type],
                        boxShadow: `0 0 5px ${NODE_COLOR[type]}88`,
                      }}
                    />
                    <span
                      className="font-mono text-[9px]"
                      style={{ color: "rgba(156,183,232,0.6)" }}
                    >
                      {label}
                    </span>
                  </div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Click hint */}
          <AnimatePresence>
            {!playing && step < TOTAL_STEPS - 1 && (
              <motion.div
                className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ delay: 1.4, duration: 0.4 }}
              >
                <div
                  className="flex items-center gap-2 rounded-full px-3 py-1.5 font-mono text-[10px]"
                  style={{
                    background: "rgba(5,11,29,0.65)",
                    border: "1px solid rgba(120,180,220,0.18)",
                    color: "rgba(156,183,232,0.55)",
                    backdropFilter: "blur(8px)",
                  }}
                >
                  <motion.div
                    className="h-1.5 w-1.5 rounded-full bg-sky-400/55"
                    animate={{ scale: [1, 1.4, 1] }}
                    transition={{ duration: 1.4, repeat: Infinity }}
                  />
                  click to {step === 0 ? "play" : "continue"}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </button>

        {/* Left-side terminal panel - always visible, never covers the network */}
        <div />

        {/* Controls */}
        <div className="pointer-events-auto flex items-center gap-3 py-5">
          <button
            type="button"
            onClick={goPrev}
            disabled={step === 0}
            className="flex items-center gap-1.5 rounded-full px-4 py-2 font-semibold text-xs transition-all duration-200 disabled:opacity-20"
            style={{
              border: "1px solid rgba(120,180,220,0.2)",
              color: "rgb(156,183,232)",
              background: "rgba(5,11,29,0.55)",
            }}
          >
            <svg
              aria-hidden="true"
              focusable="false"
              width="11"
              height="11"
              viewBox="0 0 11 11"
              fill="none"
            >
              <path
                d="M7 9L3 5.5 7 2"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Prev
          </button>

          <button
            type="button"
            onClick={togglePlay}
            className="flex items-center gap-1.5 rounded-full px-5 py-2 font-semibold text-xs transition-all duration-200"
            style={{
              background: playing
                ? "rgba(59,174,239,0.13)"
                : "linear-gradient(110deg,rgb(60,174,245),rgb(72,201,176))",
              color: playing ? "rgb(59,174,239)" : "rgb(5,11,29)",
              border: playing ? "1px solid rgba(59,174,239,0.3)" : "none",
              boxShadow: playing ? "none" : "0 5px 18px rgba(60,174,245,0.25)",
            }}
          >
            {playing ? (
              <>
                <svg
                  aria-hidden="true"
                  focusable="false"
                  width="11"
                  height="11"
                  viewBox="0 0 11 11"
                  fill="none"
                >
                  <rect
                    x="2"
                    y="1.5"
                    width="2.5"
                    height="8"
                    rx="0.8"
                    fill="currentColor"
                  />
                  <rect
                    x="6.5"
                    y="1.5"
                    width="2.5"
                    height="8"
                    rx="0.8"
                    fill="currentColor"
                  />
                </svg>
                Pause
              </>
            ) : step >= TOTAL_STEPS - 1 ? (
              <>
                <svg
                  aria-hidden="true"
                  focusable="false"
                  width="11"
                  height="11"
                  viewBox="0 0 11 11"
                  fill="none"
                >
                  <path
                    d="M5.5 1.5v2.5M4 2.8l1.5-1.3 1.5 1.3M5.5 9.5a4 4 0 1 0 0-8"
                    stroke="currentColor"
                    strokeWidth="1.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                Replay
              </>
            ) : (
              <>
                <svg
                  aria-hidden="true"
                  focusable="false"
                  width="11"
                  height="11"
                  viewBox="0 0 11 11"
                  fill="none"
                >
                  <path d="M2.5 1.8l7 3.7-7 3.7V1.8z" fill="currentColor" />
                </svg>
                Play
              </>
            )}
          </button>

          <div className="flex items-center gap-1">
            {STEP_INDICATORS.map((stepKey, i) => (
              <motion.div
                key={stepKey}
                className="h-1 rounded-full"
                animate={{ width: i === step ? 24 : i < step ? 16 : 5 }}
                transition={{ duration: 0.3 }}
                style={{
                  background:
                    i < step
                      ? "rgba(59,174,239,0.45)"
                      : i === step
                        ? "rgb(59,174,239)"
                        : "rgba(120,140,160,0.15)",
                }}
              />
            ))}
          </div>

          <button
            type="button"
            onClick={goNext}
            disabled={step >= TOTAL_STEPS - 1}
            className="flex items-center gap-1.5 rounded-full px-4 py-2 font-semibold text-xs transition-all duration-200 disabled:opacity-20"
            style={{
              border: "1px solid rgba(120,180,220,0.2)",
              color: "rgb(156,183,232)",
              background: "rgba(5,11,29,0.55)",
            }}
          >
            Next
            <svg
              aria-hidden="true"
              focusable="false"
              width="11"
              height="11"
              viewBox="0 0 11 11"
              fill="none"
            >
              <path
                d="M4 2l4 3.5L4 9"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

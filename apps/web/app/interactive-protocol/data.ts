import { links } from "@4mica/url";

type NodeType = "agent" | "api" | "db" | "chain" | "ext" | "brand";

interface NetNode {
  id: number;
  type: NodeType;
  name: string;
  x: number;
  y: number;
  size: number;
}

export const NODES: NetNode[] = [
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

export const EDGES: [number, number][] = [
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

export const STEP_DURATIONS = [
  4200, 3800, 4000, 4500, 4500, 4500, 4500, 4000, 5500, 5000,
];

export const TOTAL_STEPS = 10;

export const STEP_INDICATORS = Array.from(
  { length: TOTAL_STEPS },
  (_, index) => `step-${index + 1}`,
);

export const TERMINAL_DOTS = ["#ef4444", "#eab308", "#22c55e"];

export const REQUEST_ROWS = [
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

export const TAB_ROWS = [
  [
    { c: "#3baeef", v: "POST " },
    { c: "#a3ffd6", v: `${links.facilitatorTabs} ` },
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

export const RESPONSE_ROWS = [
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
    { c: "#7bcbff", v: `"${links.facilitatorTabs}",` },
  ],
  [
    { c: "#7dd3fc", v: '      "tabId": ' },
    { c: "#fbbf24", v: '"0x123"' },
  ],
  [{ c: "rgba(200,215,242,0.35)", v: "  }}]}" }],
];

export const SIGNING_ROWS = [
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

export const SETTLE_ROWS = [
  [
    { c: "#3baeef", v: "POST " },
    { c: "#a3ffd6", v: `${links.facilitatorSettle} ` },
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

export const GUARANTEE_ROWS = [
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

export const OK_ROWS = [
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

export const NETTING_ROWS = [
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

export const BLOCKCHAIN_ROWS = [
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

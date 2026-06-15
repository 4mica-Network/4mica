export const FAQS = [
  {
    question: "What exactly is a credit layer for x402?",
    answer:
      "Standard x402 settles every payment on-chain, one transaction per request. 4Mica adds a credit layer: agents sign off-chain guarantees and spend against pooled collateral. Settlements are batched and happen once per window, resulting in orders of magnitude fewer transactions.",
  },
  {
    question: "What is a payment tab?",
    answer:
      "A tab is a credit session opened by the recipient (POST /tabs). It has a tabId, TTL, and version. Individual spends within the tab are identified by a reqId that increments with each signed guarantee.",
  },
  {
    question: "What is a payment guarantee?",
    answer:
      "A payment guarantee is an EIP-712 signed claim that the payer attaches as an X-PAYMENT header. It commits to tabId, reqId, amounts, addresses, and timestamp. The facilitator verifies the signature and issues a BLS-signed certificate for on-chain settlement.",
  },
  {
    question: "How does yield work?",
    answer:
      "Stablecoin deposits route through Aave via depositStablecoin(). The protocol holds aTokens on your behalf. APY accrues continuously and offsets the cost of payments.",
  },
  {
    question: "When do users settle?",
    answer:
      "Users call payTabInERC20Token() after 7 days. If they don't, the recipient's on-chain claim window opens at day 14 (remunerationGracePeriod) and closes at day 21 (tabExpirationTime).",
  },
  {
    question: "How are disputes handled?",
    answer:
      "V2 guarantees use ERC-8004's ValidationRegistry. The payer signs a guarantee committing to a specific validator, agent, score threshold, and job hash. If the validation fails on-chain, remunerate() reverts and collateral stays locked. Validators post a 0–100 score on-chain.",
  },
  {
    question: "How do withdrawals work?",
    answer:
      "Call requestWithdrawal() to start the timelock, then finalizeWithdrawal() after the withdrawalGracePeriod (default 22 days). A 6-hour synchronizationDelay prevents race conditions with open tabs.",
  },
  {
    question: "Which assets are supported?",
    answer:
      "ETH and stablecoins. USDC and USDT are enabled by default. Other ERC-20s can be configured by the operator.",
  },
  {
    question: "Does it work with existing x402 clients?",
    answer:
      "Yes. 4Mica is x402-compatible. Wrap your existing fetch or requests client with the 4Mica scheme adapter. One line of code. No changes to your server or HTTP logic.",
  },
];

export const USE_CASES = [
  {
    icon: "ri-robot-line",
    kicker: "AI Agents",
    title: "Agents pay APIs on credit, settle once",
    desc: "An AI agent calls dozens of endpoints per task: data feeds, inference, storage. No account setup, no API keys. It pays on credit from one pool and settles net exposure once per epoch.",
    tags: ["No account setup", "Instant onboarding", "Auto-settlement"],
  },
  {
    icon: "ri-exchange-line",
    kicker: "Agentic Commerce",
    title: "Agent-to-agent micropayments at scale",
    desc: "When agents transact with each other at high frequency, on-chain settlement per call is unworkable. 4Mica natively nets bilateral flows and collapses them into one settlement.",
    tags: ["Agent-to-agent", "Bilateral netting", "High-frequency"],
  },
  {
    icon: "ri-code-box-line",
    kicker: "API Monetization",
    title: "Accept payments with one line of code",
    desc: "Add 4Mica middleware and charge per HTTP request. Works with any x402-compatible client. No SDK on the client side, no KYC, no credits to manage. Money moves at the speed of the internet.",
    tags: ["x402-compatible", "Any HTTP client", "Zero friction"],
  },
  {
    icon: "ri-bank-line",
    kicker: "Financial Infrastructure",
    title: "Clearinghouse for on-chain apps",
    desc: "Build a payment rail that aggregates millions of micro-transfers, earns yield on float, and settles net positions on-chain. The same primitive that banks use, but permissionless.",
    tags: ["Yield on float", "Programmable disputes", "Non-custodial"],
  },
];

export const STEPS = [
  {
    num: "01",
    badge: "Deposit",
    title: "Deposit collateral once",
    desc: "Funds go into Aave and earn yield. A single collateral deposit covers all credit.",
    code: `await client.user.approveErc20(usdc.address, AMOUNT);
await client.user.deposit(AMOUNT, usdc.address);`,
  },
  {
    num: "02",
    badge: "Spend",
    title: "Spend on credit: instant, off-chain",
    desc: "The agent signs an EIP-712 guarantee claim and receives BLS-signed credit. No gas, no chain transaction. Verified in milliseconds.",
    code: `const payment = await signGuarantee({
  cycleId:   "0xabc",  
  reqId:     "0x0",
  amount:    "0x64",
  recipient: "0x72e1…ResourceHub",
});

// GET /resource
// X-PAYMENT: <base64(payment)>
// HTTP 200 OK`,
  },
  {
    num: "03",
    badge: "Netting",
    title: "Netting across the cycle",
    desc: "Every 7 days the cycle closes. Bilateral flows collapse into one net position per participant.",
    code: `// Cycle closes every 7 days, netting begins
// Bilateral edges this cycle:
Alice → Bob:  800 USDC  (40 guarantees)
Bob → Alice:  300 USDC  (15 guarantees)
// net_debit[Alice]  = max(800 - 300, 0) = 500 USDC
// net_credit[Bob]   = 500 USDC
// 55 guarantees turns into 1 net position per participant`,
  },
  {
    num: "04",
    badge: "Settle",
    title: "Settle on-chain, one net payment",
    desc: "Net debtors pay once. Creditors claim once. Defaults are covered by vault collateral.",
    code: `// Debtor pays net position to ClearingHouse
await clearingHouse.payNetDebit(
  cycleId,
  netDebit,       // 500 USDC (not 800)
  merkleProof,
);

// Creditor claims once debtor has paid
await clearingHouse.claimNetCredit(
  cycleId,
  netCredit,
  merkleProof,
);

// 55 off-chain payments → 1 on-chain settlement`,
  },
];

export const STATS = [
  { value: "1 tx", label: "per settlement" },
  { value: "~0", label: "gas per call" },
  { value: "APY", label: "on collateral" },
];

export const PRIMITIVES = [
  {
    name: "x402",
    role: "Payment protocol",
    desc: "The HTTP payment standard 4Mica extends with a credit layer. Any x402-compatible client works out of the box.",
    icon: "ri-global-line",
  },
  {
    name: "Aave",
    role: "Yield layer",
    desc: "All collateral routes directly to Aave. Deposits earn APY continuously. Your payment infrastructure generates returns.",
    icon: "ri-plant-line",
  },
  {
    name: "Ethereum / Base",
    role: "Settlement layer",
    desc: "Net positions settle on-chain via EVM-compatible contracts. One transaction per settlement window, cryptographically enforced.",
    icon: "ri-links-line",
  },
];

export const PARTNERS = [
  {
    name: "Aligned Layer",
    logo: "/assets/aligned_layer_logo.png",
    href: "https://alignedlayer.com/",
  },
  {
    name: "ChaosChain",
    logo: "/assets/chaos_chain_logo.svg",
    href: "https://chaoscha.in/",
  },
  { name: "Wachai", logo: "/assets/wachai.png", href: "https://wach.ai/" },
];

export const TRUST_POINTS = [
  {
    icon: "ri-lock-line",
    label: "Non-custodial",
    desc: "You own your collateral. 4Mica never holds funds.",
  },
  {
    icon: "ri-code-s-slash-line",
    label: "Open-source core",
    desc: "Contracts and SDKs are public on GitHub.",
  },
  {
    icon: "ri-test-tube-line",
    label: "Testnet live",
    desc: "Deposit, spend, and earn on Sepolia today.",
  },
];

export const SCENARIO = {
  capital: 10_000,
  gasCostX402: 1_000,
  x402LatencyHours: 278, // 1M txs × 1 s avg block time ÷ 3600
  micaLatencyHours: 2.7, // 1M txs × 10 ms BLS sign + verify ÷ 3_600_000
  yieldRate: 0.05,
};

export const x402Lines = [
  {
    label: "Capital locked in wallet",
    value: `$${SCENARIO.capital.toLocaleString()} USDC`,
    note: "earns 0%, just sitting there",
  },
  { label: "Yield earned", value: "$0", note: "no yield mechanism" },
  {
    label: "Gas fees paid (1M on-chain txs)",
    value: `+$${SCENARIO.gasCostX402.toLocaleString()} USDC`,
    note: "~$0.001 × 1,000,000 settlements",
  },
  {
    label: "Time waiting for finality",
    value: `${SCENARIO.x402LatencyHours} hours`,
    note: "1M txs × ~1 s avg block time",
  },
];

export const micaLines = [
  {
    label: "Capital deployed in Aave vault",
    value: `$${SCENARIO.capital.toLocaleString()} USDC`,
    note: "non-custodial · withdraw anytime",
  },
  {
    label: "Yield earned over 1 year",
    value: `+$${(SCENARIO.capital * SCENARIO.yieldRate).toLocaleString()} USDC`,
    note: "~5% Aave USDC APY",
  },
  {
    label: "Gas fees",
    value: "< $1",
    note: "batch + netting · sponsored · $0 for payer",
  },
  {
    label: "Time waiting for finality",
    value: `${SCENARIO.micaLatencyHours} hours`,
    note: "10ms BLS signature + verification per request",
  },
];

export const x402Total = SCENARIO.capital + SCENARIO.gasCostX402;

export const micaNet = SCENARIO.capital - SCENARIO.capital * SCENARIO.yieldRate;

export const netDelta = x402Total - micaNet;

/**
 * Minimal ABI for the 4Mica ClearingHouse settlement functions.
 *
 * A settlement cycle nets each participant's obligations into a single net-debit
 * or net-credit committed to an on-chain Merkle root. Participants settle by
 * submitting their leaf + proof to one of these functions. The contract address
 * and proof are provided by core via `getClearingSettlementAction`.
 *
 * The error entries let viem decode ClearingHouse reverts by name.
 */
export const clearingHouseAbi = [
  {
    type: "function",
    name: "payNetDebit",
    stateMutability: "payable",
    inputs: [
      { name: "cycleId", type: "bytes32" },
      { name: "netDebit", type: "uint256" },
      { name: "proof", type: "bytes32[]" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "claimNetCreditFor",
    stateMutability: "nonpayable",
    inputs: [
      { name: "creditor", type: "address" },
      { name: "cycleId", type: "bytes32" },
      { name: "netCredit", type: "uint256" },
      { name: "proof", type: "bytes32[]" },
    ],
    outputs: [],
  },
  { type: "error", name: "AmountZero", inputs: [] },
  {
    type: "error",
    name: "CycleNotZeroSum",
    inputs: [
      { name: "totalNetDebit", type: "uint256" },
      { name: "totalNetCredit", type: "uint256" },
    ],
  },
  {
    type: "error",
    name: "CycleAlreadyCommitted",
    inputs: [{ name: "cycleId", type: "bytes32" }],
  },
  {
    type: "error",
    name: "CycleNotFound",
    inputs: [{ name: "cycleId", type: "bytes32" }],
  },
  {
    type: "error",
    name: "InvalidCycleStatus",
    inputs: [
      { name: "cycleId", type: "bytes32" },
      { name: "status", type: "uint8" },
    ],
  },
  { type: "error", name: "InvalidDeadline", inputs: [] },
  { type: "error", name: "InvalidProof", inputs: [] },
  {
    type: "error",
    name: "ExactPaymentRequired",
    inputs: [
      { name: "expected", type: "uint256" },
      { name: "actual", type: "uint256" },
    ],
  },
  {
    type: "error",
    name: "AlreadyPaid",
    inputs: [
      { name: "cycleId", type: "bytes32" },
      { name: "debtor", type: "address" },
    ],
  },
  {
    type: "error",
    name: "AlreadyClaimed",
    inputs: [
      { name: "cycleId", type: "bytes32" },
      { name: "creditor", type: "address" },
    ],
  },
  {
    type: "error",
    name: "PaymentFinalityPending",
    inputs: [{ name: "deadline", type: "uint64" }],
  },
  {
    type: "error",
    name: "PaymentWindowElapsed",
    inputs: [{ name: "deadline", type: "uint64" }],
  },
  {
    type: "error",
    name: "ClaimExceedsFundedLiquidity",
    inputs: [
      { name: "available", type: "uint256" },
      { name: "requested", type: "uint256" },
    ],
  },
  {
    type: "error",
    name: "NativeTransferFailed",
    inputs: [
      { name: "recipient", type: "address" },
      { name: "amount", type: "uint256" },
    ],
  },
  { type: "error", name: "ZeroAddress", inputs: [] },
  { type: "error", name: "NativeAssetUnsupported", inputs: [] },
] as const;

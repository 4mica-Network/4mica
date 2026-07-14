/**
 * Minimal ABI for the 4Mica ClearingHouse settlement functions.
 *
 * A settlement cycle nets each participant's obligations into a single net-debit
 * or net-credit committed to an on-chain Merkle root. Participants settle by
 * submitting their leaf + proof to one of these functions. The contract address
 * and proof are provided by core via `getClearingSettlementAction`.
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
    name: "claimNetCredit",
    stateMutability: "nonpayable",
    inputs: [
      { name: "cycleId", type: "bytes32" },
      { name: "netCredit", type: "uint256" },
      { name: "proof", type: "bytes32[]" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "markDefaulted",
    stateMutability: "nonpayable",
    inputs: [
      { name: "cycleId", type: "bytes32" },
      { name: "debtor", type: "address" },
      { name: "netDebit", type: "uint256" },
      { name: "proof", type: "bytes32[]" },
    ],
    outputs: [],
  },
] as const;

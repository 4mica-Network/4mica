import { links } from "@4mica/url";
import { messages } from "@/i18n";

export const FAQS = messages.home.faqs;

export const USE_CASES = messages.home.useCases;

export const STEPS = messages.home.steps;

export const STATS = messages.home.stats;

export const PRIMITIVES = messages.home.primitives;

export const PARTNERS = [
  {
    name: "Aligned Layer",
    logo: "/assets/aligned_layer_logo.png",
    href: links.partner.alignedLayer,
  },
  {
    name: "ChaosChain",
    logo: "/assets/chaos_chain_logo.svg",
    href: links.partner.chaosChain,
    // White monochrome logo — invert to dark so it stays visible in light mode.
    invertOnLight: true,
  },
  {
    name: "Wachai",
    logo: "/assets/wachai.png",
    href: links.partner.wachai,
    invertOnLight: true,
  },
];

export const TRUST_POINTS = messages.home.trustPoints;

export const SCENARIO = {
  capital: 10_000,
  gasCostX402: 1_000,
  x402LatencyHours: 278, // 1M txs × 1 s avg block time ÷ 3600
  micaLatencyHours: 2.7, // 1M txs × 10 ms BLS sign + verify ÷ 3_600_000
  yieldRate: 0.05,
};

export const x402Lines = [
  {
    label: messages.home.scenarioLines.x402[0].label,
    value: `$${SCENARIO.capital.toLocaleString()} USDC`,
    note: messages.home.scenarioLines.x402[0].note,
  },
  {
    label: messages.home.scenarioLines.x402[1].label,
    value: messages.home.scenarioLines.x402[1].value,
    note: messages.home.scenarioLines.x402[1].note,
  },
  {
    label: messages.home.scenarioLines.x402[2].label,
    value: `+$${SCENARIO.gasCostX402.toLocaleString()} USDC`,
    note: messages.home.scenarioLines.x402[2].note,
  },
  {
    label: messages.home.scenarioLines.x402[3].label,
    value: `${SCENARIO.x402LatencyHours} hours`,
    note: messages.home.scenarioLines.x402[3].note,
  },
];

export const micaLines = [
  {
    label: messages.home.scenarioLines.mica[0].label,
    value: `$${SCENARIO.capital.toLocaleString()} USDC`,
    note: messages.home.scenarioLines.mica[0].note,
  },
  {
    label: messages.home.scenarioLines.mica[1].label,
    value: `+$${(SCENARIO.capital * SCENARIO.yieldRate).toLocaleString()} USDC`,
    note: messages.home.scenarioLines.mica[1].note,
  },
  {
    label: messages.home.scenarioLines.mica[2].label,
    value: messages.home.scenarioLines.mica[2].value,
    note: messages.home.scenarioLines.mica[2].note,
  },
  {
    label: messages.home.scenarioLines.mica[3].label,
    value: `${SCENARIO.micaLatencyHours} hours`,
    note: messages.home.scenarioLines.mica[3].note,
  },
];

export const x402Total = SCENARIO.capital + SCENARIO.gasCostX402;

export const micaNet = SCENARIO.capital - SCENARIO.capital * SCENARIO.yieldRate;

export const netDelta = x402Total - micaNet;

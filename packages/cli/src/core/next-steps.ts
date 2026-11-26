import { ok, pc } from "../ui/log.js";
import { FUNDING_DOCS } from "./links.js";

/** One line of a checklist: something done, or the command that does it. */
export interface Step {
  done: boolean;
  step: string;
  /** What to run, or where to read how. */
  command?: string;
}

/** Shown after an action, so the next one never has to be looked up. */
export function renderSteps(steps: Step[]): string {
  const width = Math.max(...steps.map(({ step }) => step.length));
  return steps
    .map(({ done, step, command }) =>
      `${done ? ok("✔") : pc.dim("○")} ${step.padEnd(width)}  ${command ?? ""}`.trimEnd(),
    )
    .join("\n");
}

/** From an empty wallet to spendable collateral. */
export const fundingSteps = (address?: string): Step[] => [
  {
    done: false,
    step: "fund the wallet",
    command: address
      ? `test USDC for ${address}: ${FUNDING_DOCS}`
      : `test USDC: ${FUNDING_DOCS}`,
  },
  {
    done: false,
    step: "deposit collateral",
    command: "4mica deposit 10 --asset USDC",
  },
];

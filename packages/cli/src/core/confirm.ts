import { createInterface } from "node:readline/promises";
import { usageError } from "../errors.js";
import { pc, warn } from "../ui/log.js";
import { fields } from "../ui/output.js";
import { networkName, type Settings } from "./settings.js";

export interface Summary {
  action: string;
  address: string;
  details?: [string, string | undefined][];
}

/** `base (mainnet, real funds)` in the warning color; testnets plain. */
export function describeNetwork(settings: Settings): string {
  const name = networkName(settings);
  if (!settings.info) return name;
  return settings.info.testnet
    ? `${name} (testnet)`
    : warn(`${name} (mainnet, real funds)`);
}

/**
 * Shows what is about to be sent and asks before sending it. `--yes` skips
 * the question; without a terminal and without `--yes` this throws, since a
 * prompt nobody can answer would hang the script.
 */
export async function confirmFunds(
  summary: Summary,
  settings: Settings,
  options: { yes: boolean },
): Promise<void> {
  process.stderr.write(
    `${pc.bold(summary.action)}\n${fields([
      ["network", describeNetwork(settings)],
      ["wallet", summary.address],
      ...(summary.details ?? []),
    ])}\n`,
  );
  if (options.yes) return;
  if (!process.stdin.isTTY) {
    throw usageError("confirmation needed, and there is no terminal to ask", {
      code: "CONFIRMATION_REQUIRED",
      suggestions: ["pass --yes to send without asking"],
    });
  }
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  try {
    const answer = await rl.question("Send it? [y/N] ");
    if (!/^y(es)?$/i.test(answer.trim())) {
      throw usageError("cancelled; nothing was sent", { code: "CANCELLED" });
    }
  } finally {
    rl.close();
  }
}

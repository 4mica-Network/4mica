import { createInterface } from "node:readline/promises";
import { usageError } from "../errors.js";
import { pc, warn } from "../ui/log.js";
import { fields } from "../ui/output.js";
import { canPrompt, runtime } from "./runtime.js";
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
  // The one thing --quiet does not hide is a question being asked.
  if (!(options.yes && runtime.quiet)) {
    process.stderr.write(
      `${pc.bold(summary.action)}\n${fields([
        ["network", describeNetwork(settings)],
        ["wallet", summary.address],
        ...(summary.details ?? []),
      ])}\n`,
    );
  }
  if (options.yes) return;
  if (!canPrompt()) {
    throw usageError("confirmation needed, and it cannot be asked for here", {
      code: "CONFIRMATION_REQUIRED",
      suggestions: ["pass --yes to send without asking"],
    });
  }
  // Real funds take more than a reflexive "y": the network's name, typed.
  const name = networkName(settings);
  const mainnet = settings.info?.testnet === false;
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  try {
    const answer = (
      await rl.question(
        mainnet ? `Type ${name} to send it: ` : "Send it? [y/N] ",
      )
    ).trim();
    if (mainnet ? answer !== name : !/^y(es)?$/i.test(answer)) {
      throw usageError("cancelled; nothing was sent", { code: "CANCELLED" });
    }
  } finally {
    rl.close();
  }
}

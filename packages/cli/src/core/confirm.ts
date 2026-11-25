import { createInterface } from "node:readline/promises";
import { cancelled, failure, usageError } from "../errors.js";
import { pc, warn } from "../ui/log.js";
import { fields } from "../ui/output.js";
import { detailLines, type Preview } from "./preview.js";
import { canPrompt, runtime } from "./runtime.js";
import { isKnownSafe, networkName, type Settings } from "./settings.js";

/**
 * One question on stderr, answered on stdin. Ctrl-C at the prompt is a
 * cancel (exit 130), not a crash: readline reports it as an `AbortError`.
 * `hidden` reads without echo, for a secret.
 */
export async function ask(
  question: string,
  options: { hidden?: boolean; cancelMessage?: string } = {},
): Promise<string> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stderr,
    terminal: true,
  });
  if (options.hidden) {
    // Echo nothing typed after the question itself.
    const internal = rl as unknown as {
      _writeToOutput?: (text: string) => void;
    };
    let asked = false;
    internal._writeToOutput = (text: string) => {
      if (!asked) {
        asked = true;
        process.stderr.write(text);
      } else if (text.includes("\n")) {
        process.stderr.write("\n");
      }
    };
  }
  const abort = new AbortController();
  rl.on("SIGINT", () => abort.abort());
  try {
    return (await rl.question(question, { signal: abort.signal })).trim();
  } catch (error) {
    const { name, code } = error as { name?: string; code?: string };
    if (name === "AbortError" || code === "ABORT_ERR") {
      process.stderr.write("\n");
      throw cancelled(options.cancelMessage);
    }
    throw error;
  } finally {
    rl.close();
  }
}

/**
 * `base (mainnet, real funds)` in the warning color; testnets plain. A core
 * given by URL that is not on this machine might be anything, so it is
 * treated as real funds.
 */
export function describeNetwork(settings: Settings): string {
  const name = networkName(settings);
  if (settings.info?.testnet) return `${name} (testnet)`;
  if (isKnownSafe(settings)) return `${name} (local)`;
  return warn(
    settings.info
      ? `${name} (mainnet, real funds)`
      : `${name} (not a known testnet: may be real funds)`,
  );
}

/** What a typed confirmation asks for: the network, or the core's host. */
function typedName(settings: Settings): string {
  return settings.network?.value ?? new URL(settings.rpcUrl.value).host;
}

export interface Summary {
  /** "Deposit 5 USDC": what is about to happen. */
  action: string;
  address: string;
  details?: [string, string | undefined][];
}

/**
 * Shows what is about to be sent and asks before sending it. `--yes` skips
 * the question; without a terminal and without `--yes` this throws, since a
 * prompt nobody can answer would hang the script.
 *
 * Given a preview, it shows what the dry run would (token address, base
 * units, gas) and refuses to ask at all when the preview found a problem:
 * the send would fail, after the user had agreed to it.
 */
export async function confirmFunds(
  summary: Summary | Preview,
  settings: Settings,
  options: { yes: boolean },
): Promise<void> {
  const preview = "dryRun" in summary ? summary : undefined;
  if (preview && !preview.ready) {
    throw failure(`cannot ${preview.action}: ${preview.problems.join("; ")}`, {
      code: "NOT_READY",
      suggestions: ["see everything it checks with --dry-run"],
      details: { problems: preview.problems },
    });
  }
  const action = preview
    ? preview.action.charAt(0).toUpperCase() + preview.action.slice(1)
    : (summary as Summary).action;
  const details: [string, string | undefined][] = preview
    ? detailLines(preview)
    : ((summary as Summary).details ?? []);
  const wallet = preview ? preview.wallet : (summary as Summary).address;

  // The one thing --quiet does not hide is a question being asked.
  if (!(options.yes && runtime.quiet)) {
    process.stderr.write(
      `${pc.bold(action)}\n${fields([
        ["network", describeNetwork(settings)],
        ["wallet", wallet],
        ...details,
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
  // Anything that may be real funds takes more than a reflexive "y": the
  // network's name, or the core's host, typed.
  const safe = isKnownSafe(settings);
  const name = typedName(settings);
  const answer = await ask(
    safe ? "Send it? [y/N] " : `Type ${name} to send it: `,
  );
  if (safe ? !/^y(es)?$/i.test(answer) : answer !== name) {
    throw cancelled();
  }
}

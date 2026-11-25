import { Args, Flags } from "@oclif/core";
import { usageError } from "./errors.js";

export const asset = Flags.string({
  char: "a",
  helpValue: "<symbol|address>",
  summary:
    "token symbol, ETH, or a token address; FOURMICA_ASSET does the same",
});

export const dryRun = Flags.boolean({
  char: "n",
  summary: "check that it would work and show it, without sending anything",
});

export const yes = Flags.boolean({
  char: "y",
  summary: "send without asking for confirmation",
});

export const gas = Flags.custom<"auto" | "self">({
  default: "auto",
  options: ["auto", "self"],
  summary: "auto uses a sponsored transaction when one is available",
})();

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

/** Checked here, before anything connects: a typo is not a network error. */
export function requireAddress(value: string, what: string): string {
  if (ADDRESS.test(value)) return value;
  throw usageError(`${what} "${value}" is not an address`, {
    code: "BAD_ADDRESS",
    suggestions: ["an address is 0x followed by 40 hex digits"],
  });
}

export const address = Flags.custom<string>({
  helpValue: "<address>",
  parse: async (value) => requireAddress(value, "the address"),
});

/**
 * A cycle as `4mica cycles` names it, `<asset address>:<start>`, or the
 * 32-byte id a CHECKPOINT_REQUIRED refusal carries.
 */
export function requireCycleId(value: string): string {
  if (
    /^0x[0-9a-fA-F]{1,64}:\d+$/.test(value) ||
    /^0x[0-9a-fA-F]{64}$/.test(value)
  ) {
    return value;
  }
  throw usageError(`"${value}" is not a cycle id`, {
    code: "BAD_CYCLE_ID",
    suggestions: [
      "a cycle id looks like 0x…:1767225600; `4mica cycles` lists them",
    ],
  });
}

export const cycleArg = Args.custom<string>({
  description: "the cycle, as `4mica cycles` names it (0x…:<start>)",
  parse: async (value) => requireCycleId(value),
})({ required: true });

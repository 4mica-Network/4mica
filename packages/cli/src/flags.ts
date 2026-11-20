import { Flags } from "@oclif/core";

export const asset = Flags.string({
  char: "a",
  helpValue: "<symbol|address>",
  summary: "token symbol, ETH, or a token address",
});

export const dryRun = Flags.boolean({
  char: "n",
  summary: "check that it would work and show it, without sending anything",
});

export const yes = Flags.boolean({
  char: "y",
  summary: "send without asking for confirmation",
});

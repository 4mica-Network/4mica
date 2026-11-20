import { Flags } from "@oclif/core";

export const asset = Flags.string({
  char: "a",
  helpValue: "<symbol|address>",
  summary: "token symbol, ETH, or a token address",
});

export const yes = Flags.boolean({
  char: "y",
  summary: "send without asking for confirmation",
});

#!/usr/bin/env node
import { Config, execute } from "@oclif/core";
import { normalizeArgv } from "../dist/argv.js";

const config = await Config.load(import.meta.url);

// Not awaited: a reader that closes the pipe early (`| head`) ends the
// process mid-run, and Node warns about a top-level await left pending.
execute({
  args: normalizeArgv(process.argv.slice(2), config),
  loadOptions: config,
});

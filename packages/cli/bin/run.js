#!/usr/bin/env node

// One answer to "color or not" for everything that prints: the CLI's own
// helpers read the flags, and oclif (errors, help) reads only the
// environment, so the flags are passed on to it here. This runs before
// anything is imported: the libraries decide about color as they load.
const argv = process.argv.slice(2);
const end = argv.indexOf("--");
const own = end === -1 ? argv : argv.slice(0, end);
if (own.includes("--no-color")) {
  process.env.NO_COLOR = "1";
  delete process.env.FORCE_COLOR;
} else if (own.includes("--color") && !process.env.NO_COLOR) {
  process.env.FORCE_COLOR = "1";
}

const { Config, execute } = await import("@oclif/core");
const { normalizeArgv } = await import("../dist/argv.js");

const config = await Config.load(import.meta.url);

// Not awaited: a reader that closes the pipe early (`| head`) ends the
// process mid-run, and Node warns about a top-level await left pending.
execute({
  args: normalizeArgv(argv, config),
  loadOptions: config,
});

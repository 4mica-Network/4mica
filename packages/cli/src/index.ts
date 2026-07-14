import { run } from "./cli.js";
import { err } from "./ui/log.js";

run().catch((error: unknown) => {
  process.stderr.write(err(`\n${(error as Error).message}\n`));
  process.exitCode = 1;
});

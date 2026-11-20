#!/usr/bin/env node
import { execute } from "@oclif/core";

// Not awaited: a reader that closes the pipe early (`| head`) ends the
// process mid-run, and Node warns about a top-level await left pending.
execute({ dir: import.meta.url });

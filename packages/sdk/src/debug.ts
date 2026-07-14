// Guarded env access so the SDK imports cleanly on runtimes without `process`
// (e.g. edge/workers). Debug flags are opt-in and default to off there.
const env: Record<string, string | undefined> =
  (globalThis as { process?: { env?: Record<string, string | undefined> } })
    .process?.env ?? {};

export const DEBUG_BLS = env.DEBUG_BLS === "1";
export const DEBUG_CERTS = env.DEBUG_CERTS === "1";

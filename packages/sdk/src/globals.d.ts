/**
 * Build-time constant injected by tsup (and vitest) via `define`.
 * Holds the SDK package version so we avoid a runtime `package.json` import,
 * which keeps the bundle edge-safe and free of JSON import assertions.
 */
declare const __SDK_VERSION__: string;

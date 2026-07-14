/**
 * Bun adapter for the 4Mica SDK.
 *
 * Bun exposes `process.env`, so the Node factories work unchanged — this package
 * re-exports them for discoverability and a stable import path (`@4mica/sdk-bun`).
 */
export * from "@4mica/sdk-node";

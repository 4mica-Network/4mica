export function reportError(error: unknown): void {
  if (!import.meta.env.VITE_SENTRY_DSN) {
    return;
  }
  void import("@/lib/telemetry")
    .then(({ captureError }) => captureError(error))
    .catch(() => {});
}

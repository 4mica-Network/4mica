export function registerServiceWorker(
  enabled: boolean = import.meta.env.PROD,
): void {
  if (!enabled || !("serviceWorker" in navigator)) {
    return;
  }
  window.addEventListener(
    "load",
    () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    },
    { once: true },
  );
}

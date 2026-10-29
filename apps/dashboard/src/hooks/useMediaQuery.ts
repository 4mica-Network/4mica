import { useCallback, useSyncExternalStore } from "react";

const supportsMatchMedia = () =>
  typeof window !== "undefined" && typeof window.matchMedia === "function";

export const useMediaQuery = (query: string, fallback = true): boolean => {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!supportsMatchMedia()) {
        return () => {};
      }
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    [query],
  );

  return useSyncExternalStore(
    subscribe,
    () => (supportsMatchMedia() ? window.matchMedia(query).matches : fallback),
    () => fallback,
  );
};

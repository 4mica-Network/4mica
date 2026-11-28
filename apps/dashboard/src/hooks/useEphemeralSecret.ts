import { useAuth } from "@clerk/clerk-react";
import type { RevealedSecret } from "@stores/developer/type";
import { useCallback, useEffect, useState } from "react";

export const EPHEMERAL_SECRET_TTL_MS = 60_000;

export function useEphemeralSecret<T = RevealedSecret>(
  ttlMs = EPHEMERAL_SECRET_TTL_MS,
) {
  const { isSignedIn } = useAuth();
  const [secret, setSecret] = useState<T | null>(null);

  const clear = useCallback(() => setSecret(null), []);
  const reveal = useCallback(
    (next: T) => setSecret(document.hidden ? null : next),
    [],
  );

  useEffect(() => {
    if (!secret) {
      return;
    }
    const onVisibilityChange = () => {
      if (document.hidden) {
        clear();
      }
    };
    const timer = setTimeout(clear, ttlMs);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [secret, ttlMs, clear]);

  useEffect(() => {
    if (!isSignedIn) {
      clear();
    }
  }, [isSignedIn, clear]);

  return { secret: isSignedIn ? secret : null, reveal, clear };
}

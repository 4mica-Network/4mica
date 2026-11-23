export interface RateLimiter {
  take: (key: string, now?: number) => boolean;
}

export interface RateLimiterOptions {
  limit: number;
  windowMs: number;
  maxKeys?: number;
}

interface Window {
  count: number;
  resetAt: number;
}

export const createRateLimiter = ({
  limit,
  windowMs,
  maxKeys = 10_000,
}: RateLimiterOptions): RateLimiter => {
  const windows = new Map<string, Window>();

  const sweep = (now: number) => {
    for (const [key, window] of windows) {
      if (window.resetAt <= now) {
        windows.delete(key);
      }
    }
    while (windows.size >= maxKeys) {
      const oldest = windows.keys().next().value;
      if (oldest === undefined) {
        return;
      }
      windows.delete(oldest);
    }
  };

  return {
    take: (key, now = Date.now()) => {
      const current = windows.get(key);

      if (current && current.resetAt > now) {
        if (current.count >= limit) {
          return false;
        }
        current.count += 1;
        return true;
      }

      if (current) {
        windows.delete(key);
      } else if (windows.size >= maxKeys) {
        sweep(now);
      }

      windows.set(key, { count: 1, resetAt: now + windowMs });
      return true;
    },
  };
};

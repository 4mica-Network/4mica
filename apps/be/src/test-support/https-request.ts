import type { LookupAddress } from "node:dns";
import { EventEmitter } from "node:events";
import type { LookupFunction } from "node:net";
import { vi } from "vitest";

export interface CapturedRequest {
  options: Record<string, unknown> & { lookup: LookupFunction };
  body: string;
  headers: Record<string, string>;
}

export const fakeHttps = () => {
  const requests: CapturedRequest[] = [];
  const state = {
    status: 200 as number | null,
    error: null as Error | null,
  };

  const request = vi.fn(
    (
      options: CapturedRequest["options"],
      onResponse: (response: unknown) => void,
    ) => {
      const req = new EventEmitter() as EventEmitter & {
        end: (body: string) => void;
        destroy: (error?: Error) => void;
      };
      req.destroy = (error) => {
        if (error) {
          req.emit("error", error);
        }
      };
      req.end = (body) => {
        requests.push({
          options,
          body,
          headers: options.headers as Record<string, string>,
        });
        queueMicrotask(() => {
          if (state.error) {
            req.emit("error", state.error);
          } else if (state.status !== null) {
            onResponse({ statusCode: state.status, destroy: vi.fn() });
          }
        });
      };
      return req;
    },
  );

  const reset = () => {
    requests.length = 0;
    state.status = 200;
    state.error = null;
    request.mockClear();
  };

  return { request, requests, state, reset };
};

export const connectAddress = (
  lookup: LookupFunction,
  hostname: string,
  all: boolean,
): Promise<LookupAddress[]> =>
  new Promise((resolve, reject) => {
    lookup(hostname, { all }, (error, address, family) => {
      if (error) {
        reject(error);
      } else if (Array.isArray(address)) {
        resolve(address);
      } else {
        resolve([{ address, family: family as number }]);
      }
    });
  });

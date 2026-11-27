import { setTimeout as sleep } from "node:timers/promises";
import { failure } from "../errors.js";
import { apiError, badResponse, type Platform, request } from "./platform.js";

const DEVICE_GRANT = "urn:ietf:params:oauth:grant-type:device_code";

export interface DeviceCode {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete: string;
  expires_in: number;
  interval: number;
}

const MAX_BACKOFF_MS = 60_000;

const backoff = (baseMs: number, failures: number) => {
  const delay = Math.min(baseMs * 2 ** failures, MAX_BACKOFF_MS);
  return delay + Math.floor(Math.random() * delay * 0.25);
};

const lostResponse = () =>
  failure(
    "the sign-in was approved, but the platform's answer was lost on the way back",
    {
      code: "LOGIN_RESPONSE_LOST",
      suggestions: [
        "a session may have been created that this cli never received; revoke it under Settings → Developer → CLI sessions",
        "then run `4mica auth login` again",
      ],
    },
  );

export function isDeviceCode(value: unknown): value is DeviceCode {
  const code = (value ?? {}) as Partial<DeviceCode>;
  return (
    typeof code.device_code === "string" &&
    typeof code.user_code === "string" &&
    typeof code.verification_uri_complete === "string" &&
    /^https?:\/\//.test(code.verification_uri_complete) &&
    Number.isFinite(code.expires_in) &&
    Number.isFinite(code.interval)
  );
}

export async function pollForToken(
  platform: Platform,
  device: Pick<DeviceCode, "device_code" | "interval">,
  deadline: number,
  say: (message: string) => void,
): Promise<string> {
  let intervalMs = Math.max(device.interval, 1) * 1000;
  let waitMs = intervalMs;
  let failures = 0;
  let uncertain = false;

  const transient = (why: string, hintMs?: number, mayHaveLanded = false) => {
    if (failures === 0) say(`${why}; still waiting, and retrying`);
    failures += 1;
    uncertain ||= mayHaveLanded;
    waitMs = Math.max(hintMs ?? 0, backoff(intervalMs, failures));
  };

  while (Date.now() < deadline) {
    await sleep(Math.min(waitMs, Math.max(deadline - Date.now(), 0)));
    if (Date.now() >= deadline) break;

    let response: Awaited<ReturnType<typeof request>>;
    try {
      response = await request(platform, "/v1/cli/device/token", {
        method: "POST",
        body: { grant_type: DEVICE_GRANT, device_code: device.device_code },
        signal: AbortSignal.timeout(Math.max(deadline - Date.now(), 1)),
      });
    } catch {
      transient(`no answer from ${platform.origin}`, undefined, true);
      continue;
    }

    if (response.status === 429) {
      transient("the platform asked to slow down", response.retryAfterMs);
      continue;
    }
    if (response.status >= 500) {
      transient(
        `${platform.origin} answered ${response.status}`,
        response.retryAfterMs,
        true,
      );
      continue;
    }

    if (response.status === 200) {
      const { access_token } = (response.body ?? {}) as {
        access_token?: unknown;
      };
      if (typeof access_token === "string" && access_token !== "") {
        return access_token;
      }
      throw badResponse("a token");
    }

    const code = (response.body as { error?: unknown } | undefined)?.error;
    if (code === "authorization_pending" || code === "slow_down") {
      if (code === "slow_down") intervalMs += 5000;
      failures = 0;
      uncertain = false;
      waitMs = intervalMs;
      continue;
    }
    if (code === "access_denied") {
      throw failure("the sign-in was denied in the dashboard", {
        code: "ACCESS_DENIED",
      });
    }
    if (code === "expired_token") break;
    if (code === "invalid_grant" && uncertain) throw lostResponse();
    throw apiError(platform, response);
  }
  throw failure("the code expired before it was approved", {
    code: "LOGIN_EXPIRED",
    retryable: true,
    suggestions: ["run `4mica auth login` again for a new code"],
  });
}

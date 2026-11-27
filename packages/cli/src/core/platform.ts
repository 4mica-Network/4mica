import { configError, failure } from "../errors.js";
import { loadToken, type Storage, storedOrigins } from "./credentials.js";
import { API_URL } from "./links.js";
import { type Resolved, readEnv, requireApiUrl } from "./settings.js";

/** How every token this cli can hold begins. */
export const TOKEN_PREFIX = "4mica_cli_";

export interface Platform {
  apiUrl: Resolved;
  /** What a stored token is filed under: a token is for one API only. */
  origin: string;
}

type Env = Record<string, string | undefined>;

/**
 * The platform API in use. From the environment or the default, and from
 * nowhere else: not from a `./.env`, so that running a command inside
 * someone else's project cannot send the account token to their server.
 */
export function resolvePlatform(env: Env = process.env): Platform {
  const fromEnv = readEnv(env, "API_URL");
  const apiUrl: Resolved = fromEnv
    ? { value: fromEnv, source: "env" }
    : { value: API_URL, source: "default" };
  requireApiUrl(apiUrl);
  return { apiUrl, origin: new URL(apiUrl.value).origin };
}

export interface Session {
  platform: Platform;
  token: string;
  /** `env` is `FOURMICA_TOKEN`; the others are where `auth login` put it. */
  source: "env" | Storage;
}

/** The token `auth login` stored for this API, whatever the environment says. */
export async function loadStoredSession(
  configDir: string,
  env: Env = process.env,
): Promise<Session | undefined> {
  const platform = resolvePlatform(env);
  const stored = await loadToken(configDir, platform.origin, env);
  return stored && { platform, token: stored.token, source: stored.storage };
}

/**
 * The token in effect: `FOURMICA_TOKEN` when it is set, which is how CI
 * signs in, and otherwise the one `auth login` stored for this API.
 */
export async function loadSession(
  configDir: string,
  env: Env = process.env,
): Promise<Session | undefined> {
  const fromEnv = readEnv(env, "TOKEN");
  if (fromEnv) {
    return {
      platform: resolvePlatform(env),
      token: fromEnv.trim(),
      source: "env",
    };
  }
  return loadStoredSession(configDir, env);
}

/**
 * Names the platform that was asked. A token is kept per platform, so being
 * signed in to one (a local backend, say) and asking another reads as "not
 * signed in" unless the message says which, and where a session does exist.
 */
export async function notLoggedIn(configDir: string, platform: Platform) {
  const elsewhere = (await storedOrigins(configDir)).filter(
    (origin) => origin !== platform.origin,
  );
  return configError(`not signed in to a 4mica account at ${platform.origin}`, {
    code: "NOT_LOGGED_IN",
    suggestions: [
      ...elsewhere.map(
        (origin) =>
          `you are signed in at ${origin}; to use it, set FOURMICA_API_URL=${origin}`,
      ),
      "sign in with `4mica auth login`",
      "or, in CI, set FOURMICA_TOKEN to a token from Settings → Developer",
    ],
  });
}

export async function requireSession(configDir: string): Promise<Session> {
  const session = await loadSession(configDir);
  if (!session) throw await notLoggedIn(configDir, resolvePlatform());
  return session;
}

export interface ApiResponse {
  status: number;
  /** The JSON body, or undefined when there was none. */
  body: unknown;
}

interface RequestOptions {
  method?: string;
  token?: string;
  body?: unknown;
}

/** One request, answered or not; the caller decides what a status means. */
export async function request(
  platform: Platform,
  path: string,
  options: RequestOptions = {},
): Promise<ApiResponse> {
  const response = await fetch(new URL(path, platform.origin), {
    method: options.method ?? "GET",
    headers: {
      accept: "application/json",
      ...(options.body === undefined
        ? {}
        : { "content-type": "application/json" }),
      ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    // A redirect would carry the token to wherever it points.
    redirect: "error",
  });
  const text = await response.text();
  let body: unknown;
  try {
    body = text === "" ? undefined : JSON.parse(text);
  } catch {
    body = undefined;
  }
  return { status: response.status, body };
}

interface ErrorBody {
  error?: unknown;
  message?: unknown;
  issues?: unknown;
}

const issueLines = (issues: unknown): string[] =>
  Array.isArray(issues)
    ? issues.flatMap((issue) => {
        const { path, message } = (issue ?? {}) as Record<string, unknown>;
        return typeof message === "string"
          ? [typeof path === "string" ? `${path} ${message}` : message]
          : [];
      })
    : [];

/** What a refusal from the platform means at a terminal. */
export function apiError(platform: Platform, response: ApiResponse) {
  const { status } = response;
  const body = (response.body ?? {}) as ErrorBody;
  const code = typeof body.error === "string" ? body.error : undefined;
  const said = typeof body.message === "string" ? body.message : undefined;

  if (status === 401) {
    return failure("the 4mica account session is no longer valid", {
      code: "SESSION_INVALID",
      suggestions: [
        "sign in again with `4mica auth login`",
        "a session ends when it expires, or when it is revoked in the dashboard",
      ],
    });
  }
  if (status === 403 && code === "insufficient_scope") {
    return failure(said ?? "this session is not allowed to do that", {
      code: "INSUFFICIENT_SCOPE",
      suggestions: ["sign in again with `4mica auth login`"],
    });
  }
  if (status === 429) {
    return failure("the platform is refusing requests for now: too many", {
      code: "RATE_LIMITED",
      retryable: true,
      suggestions: ["wait a minute and try again"],
    });
  }
  const details = issueLines(body.issues);
  return failure(
    (said ?? `${platform.origin} answered ${status}`) +
      (details.length > 0 ? ` (${details.join("; ")})` : ""),
    {
      code: code ? code.toUpperCase() : `HTTP_${status}`,
      retryable: status >= 500,
    },
  );
}

/** A request that must succeed; anything else is thrown as a `CliError`. */
export async function api<T>(
  platform: Platform,
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const response = await request(platform, path, options);
  if (response.status < 200 || response.status >= 300) {
    throw apiError(platform, response);
  }
  return response.body as T;
}

export interface Account {
  id: string;
  email: string | null;
  name: string;
  username: string | null;
}

export interface SessionInfo {
  id: string;
  kind: "DEVICE" | "TOKEN";
  name: string;
  scopes: string[];
  createdAt: string;
  expiresAt: string;
}

export interface WhoAmI {
  user: Account;
  session: SessionInfo;
}

export const whoAmI = (platform: Platform, token: string) =>
  api<WhoAmI>(platform, "/v1/cli/session", { token });

/** `ada@example.com`, or the best name there is for an account without one. */
export const accountLabel = (user: Account): string =>
  user.email ?? user.username ?? user.name ?? user.id;

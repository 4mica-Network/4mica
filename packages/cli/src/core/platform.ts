import { configError, failure } from "../errors.js";
import {
  credentialsFile,
  loadToken,
  type SessionKind,
  type Storage,
  storedOrigins,
} from "./credentials.js";
import { API_URL } from "./links.js";
import { type Resolved, readEnv, requireApiUrl } from "./settings.js";

export const TOKEN_PREFIX = "4mica_cli_";

export interface Platform {
  apiUrl: Resolved;
  origin: string;
}

type Env = Record<string, string | undefined>;

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
  source: "env" | Storage;
  kind?: SessionKind;
  where?: string;
}

export type StoredSession =
  | { status: "found"; session: Session }
  | { status: "missing" }
  | { status: "unavailable"; reason: string };

export async function readStoredSession(
  configDir: string,
  env: Env = process.env,
): Promise<StoredSession> {
  const platform = resolvePlatform(env);
  const result = await loadToken(configDir, platform.origin, env);
  if (result.status !== "found") return result;
  const { credential } = result;
  return {
    status: "found",
    session: {
      platform,
      token: credential.token,
      source: credential.storage,
      kind: credential.kind,
      where:
        credential.storage === "file"
          ? credentialsFile(configDir, platform.origin)
          : undefined,
    },
  };
}

export const storeUnavailable = (reason: string) =>
  configError(`the saved sign-in could not be read: ${reason}`, {
    code: "CREDENTIAL_STORE_UNAVAILABLE",
    retryable: true,
    suggestions: [
      "unlock the keychain, or approve the cli's access to it, and try again",
      "or set FOURMICA_TOKEN for this command",
    ],
  });

export async function loadStoredSession(
  configDir: string,
  env: Env = process.env,
): Promise<Session | undefined> {
  const result = await readStoredSession(configDir, env);
  if (result.status === "unavailable") throw storeUnavailable(result.reason);
  return result.status === "found" ? result.session : undefined;
}

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
  body: unknown;
  retryAfterMs?: number;
}

function retryAfter(header: string | null): number | undefined {
  if (!header) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const at = Date.parse(header);
  return Number.isNaN(at) ? undefined : Math.max(0, at - Date.now());
}

interface RequestOptions {
  method?: string;
  token?: string;
  body?: unknown;
  signal?: AbortSignal;
}

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
    redirect: "error",
    signal: options.signal,
  });
  const text = await response.text();
  let body: unknown;
  try {
    body = text === "" ? undefined : JSON.parse(text);
  } catch {
    body = undefined;
  }
  return {
    status: response.status,
    body,
    retryAfterMs: retryAfter(response.headers.get("retry-after")),
  };
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
    const needed = said?.match(/needs ([a-z]+:[a-z]+)/)?.[1];
    return missingScopes(needed ? [needed] : [], said);
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

export const DEFAULT_SCOPES = [
  "account:read",
  "wallets:read",
  "wallets:link",
] as const;

const SCOPE_NEEDS: Record<string, string[]> = {
  "wallets:unlink": ["wallets:read"],
};

const ALL_SCOPES = [
  "account:read",
  "wallets:read",
  "wallets:link",
  "wallets:unlink",
];

export function loginCommandFor(needed: string[]): string {
  const wanted = new Set<string>(DEFAULT_SCOPES);
  for (const scope of needed) {
    wanted.add(scope);
    for (const dependency of SCOPE_NEEDS[scope] ?? []) wanted.add(dependency);
  }
  const scopes = ALL_SCOPES.filter((scope) => wanted.has(scope));
  return `4mica auth login --web --scopes ${scopes.join(",")}`;
}

function missingScopes(missing: string[], said?: string) {
  return failure(
    said ??
      `this session is not allowed to do that (needs ${missing.join(", ")})`,
    {
      code: "INSUFFICIENT_SCOPE",
      suggestions: [
        missing.length > 0
          ? `sign in again allowing it: \`${loginCommandFor(missing)}\``
          : "sign in again with `4mica auth login`",
        "a token from the dashboard has the permissions chosen when it was made",
      ],
    },
  );
}

export function requireScopes(session: SessionInfo, needed: string[]): void {
  const missing = needed.filter((scope) => !session.scopes.includes(scope));
  if (missing.length > 0) throw missingScopes(missing);
}

export const badResponse = (what: string) =>
  failure(`the platform sent ${what} the cli does not understand`, {
    code: "BAD_RESPONSE",
    suggestions: ["check that FOURMICA_API_URL points at a 4mica platform API"],
  });

const isText = (value: unknown): value is string =>
  typeof value === "string" && value !== "";

export function isWhoAmI(value: unknown): value is WhoAmI {
  const { user, session } = (value ?? {}) as Partial<WhoAmI>;
  return (
    isText(user?.id) &&
    isText(session?.id) &&
    (session?.kind === "DEVICE" || session?.kind === "TOKEN") &&
    Array.isArray(session?.scopes) &&
    session.scopes.every(isText) &&
    isText(session?.expiresAt)
  );
}

export async function whoAmI(platform: Platform, token: string) {
  const me = await api<unknown>(platform, "/v1/cli/session", { token });
  if (!isWhoAmI(me)) throw badResponse("an account");
  return me;
}

export const accountLabel = (user: Account): string =>
  user.email ?? user.username ?? user.name ?? user.id;

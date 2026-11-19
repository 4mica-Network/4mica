import { FILTERED, scrubText, scrubUrl, TRUNCATED } from "./text";

export const SENSITIVE_KEY =
  /authorization|cookie|passw|secret|token|session|api[-_]?key|signature|handshake|credential|private[-_]?key|dsn|email|^code$/i;

const HASH_32_BYTES = /^0x[0-9a-fA-F]{64}$/;

const PUBLIC_HASH_KEY = /^(?:tx|transaction|block)[-_]?hash$|^txid$/i;

const MAX_DEPTH = 6;
const MAX_ARRAY_LENGTH = 100;
const MAX_OBJECT_KEYS = 100;

export const NOT_ALLOWLISTED = "[Filtered: field not allowlisted]";

const LEVEL = Symbol.for("level");

export const createRecord = (): Record<string, unknown> =>
  Object.create(null) as Record<string, unknown>;

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

export const scrubValue = (
  value: unknown,
  depth = 0,
  ancestors: Set<object> = new Set(),
): unknown => {
  if (typeof value === "string") {
    return scrubText(value);
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : TRUNCATED;
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  if (value === null || typeof value !== "object") {
    return typeof value === "function" || typeof value === "symbol"
      ? FILTERED
      : value;
  }

  if (value instanceof Error) {
    return serializeError(value, depth + 1, ancestors);
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? TRUNCATED : value.toISOString();
  }

  if (value instanceof URL) {
    return scrubText(scrubUrl(value.href));
  }

  if (!Array.isArray(value) && !isPlainObject(value)) {
    return FILTERED;
  }

  if (depth >= MAX_DEPTH || ancestors.has(value)) {
    return TRUNCATED;
  }

  ancestors.add(value);

  try {
    return Array.isArray(value)
      ? scrubArray(value, depth + 1, ancestors)
      : scrubEntries(value, depth + 1, ancestors);
  } finally {
    ancestors.delete(value);
  }
};

const scrubEntry = (
  key: string,
  value: unknown,
  depth: number,
  ancestors: Set<object>,
): unknown => {
  if (SENSITIVE_KEY.test(key)) {
    return FILTERED;
  }

  if (
    typeof value === "string" &&
    HASH_32_BYTES.test(value) &&
    PUBLIC_HASH_KEY.test(key)
  ) {
    return value;
  }

  return scrubValue(value, depth, ancestors);
};

const scrubArray = (
  values: unknown[],
  depth: number,
  ancestors: Set<object>,
): unknown[] => {
  const kept = values
    .slice(0, MAX_ARRAY_LENGTH)
    .map((item) => scrubValue(item, depth, ancestors));

  if (values.length > MAX_ARRAY_LENGTH) {
    kept.push(`${TRUNCATED} ${values.length - MAX_ARRAY_LENGTH} more`);
  }

  return kept;
};

const scrubEntries = (
  record: Record<string, unknown>,
  depth: number,
  ancestors: Set<object>,
): Record<string, unknown> => {
  const result = createRecord();
  const keys = Object.keys(record);

  for (const key of keys.slice(0, MAX_OBJECT_KEYS)) {
    result[key] = scrubEntry(key, record[key], depth, ancestors);
  }

  if (keys.length > MAX_OBJECT_KEYS) {
    result[TRUNCATED] = `${keys.length - MAX_OBJECT_KEYS} more keys`;
  }

  return result;
};

export const scrubRecord = (
  record: Record<string, unknown>,
): Record<string, unknown> => scrubEntries(record, 0, new Set([record]));

export interface SerializedError {
  name?: string;
  message: string;
  stack?: string;
  cause?: unknown;
}

export const serializeError = (
  reason: unknown,
  depth = 0,
  ancestors: Set<object> = new Set(),
): SerializedError => {
  if (!(reason instanceof Error)) {
    return { message: scrubText(String(reason)) };
  }

  if (depth >= MAX_DEPTH || ancestors.has(reason)) {
    return { message: TRUNCATED };
  }

  ancestors.add(reason);

  try {
    const serialized: SerializedError = {
      name: scrubText(reason.name),
      message: scrubText(reason.message),
      stack: reason.stack ? scrubText(reason.stack) : undefined,
    };

    if (reason.cause !== undefined) {
      serialized.cause = scrubValue(reason.cause, depth + 1, ancestors);
    }

    return serialized;
  } finally {
    ancestors.delete(reason);
  }
};

export interface LogInfo {
  level: string;
  message: unknown;
  [key: string | symbol]: unknown;
}

export const REDACTION_FAILED = `${FILTERED} log redaction failed`;

const readLevel = (info: object): string => {
  try {
    const level = (info as { level?: unknown }).level;
    return typeof level === "string" && LEVELS.has(level) ? level : "error";
  } catch {
    return "error";
  }
};

const LEVELS = new Set(["error", "warn", "info", "http", "debug"]);
const SERVICES = new Set(["@4mica/playground"]);
const LABEL = /^[a-z][a-z0-9-]{0,31}$/;
const ID = /^[A-Za-z0-9-]{16,64}$/;
const DIGEST = /^[A-Za-z0-9_-]{1,64}$/;
const TIMESTAMP = /^[0-9TZ:. +-]{10,35}$/;
const METHODS = new Set([
  "GET",
  "HEAD",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "OPTIONS",
]);
const ROUTE_TYPES = new Set([
  "render",
  "route",
  "action",
  "middleware",
  "proxy",
]);
const ORIGINS = new Set(["uncaughtException", "unhandledRejection"]);

type FieldPolicy = (value: unknown, ancestors: Set<object>) => unknown;

const text: FieldPolicy = (value) =>
  typeof value === "string" ? scrubText(value) : FILTERED;

const matching =
  (pattern: RegExp): FieldPolicy =>
  (value) =>
    typeof value === "string" && pattern.test(value) ? value : FILTERED;

const oneOf =
  (allowed: Set<string>): FieldPolicy =>
  (value) =>
    typeof value === "string" && allowed.has(value) ? value : FILTERED;

const pathText: FieldPolicy = (value) =>
  typeof value === "string" ? scrubText(scrubUrl(value)) : FILTERED;

const errorShape = (
  value: unknown,
  depth: number,
  ancestors: Set<object>,
): unknown => {
  if (typeof value === "string") {
    return scrubText(value);
  }

  if (value instanceof Error) {
    return serializeError(value, depth, ancestors);
  }

  if (!isPlainObject(value)) {
    return FILTERED;
  }

  if (depth >= MAX_DEPTH || ancestors.has(value)) {
    return TRUNCATED;
  }

  ancestors.add(value);

  try {
    const shaped = createRecord();

    for (const key of ["name", "message", "stack"] as const) {
      if (typeof value[key] === "string") {
        shaped[key] = scrubText(value[key]);
      }
    }

    if (value.cause !== undefined) {
      shaped.cause = errorShape(value.cause, depth + 1, ancestors);
    }

    return shaped;
  } finally {
    ancestors.delete(value);
  }
};

const LOG_FIELD_POLICIES: Record<string, FieldPolicy> = {
  message: text,
  stack: text,
  label: matching(LABEL),
  service: oneOf(SERVICES),
  timestamp: matching(TIMESTAMP),
  requestId: matching(ID),
  upstreamRequestId: matching(ID),
  method: oneOf(METHODS),
  routePath: pathText,
  routeType: oneOf(ROUTE_TYPES),
  digest: matching(DIGEST),
  origin: oneOf(ORIGINS),
  error: (value, ancestors) => errorShape(value, 0, ancestors),
};

const redactionFailed = (info: object): LogInfo => {
  const level = readLevel(info);
  return { level, message: REDACTION_FAILED, [LEVEL]: level };
};

export const redactLogInfo = (info: object): LogInfo => {
  try {
    const source = info as Record<string, unknown>;
    const level = readLevel(info);
    const result: LogInfo = { level, message: undefined, [LEVEL]: level };
    const ancestors = new Set<object>([info]);

    for (const key of Object.keys(source)) {
      if (key === "level" || source[key] === undefined) {
        continue;
      }

      const policy = Object.hasOwn(LOG_FIELD_POLICIES, key)
        ? LOG_FIELD_POLICIES[key]
        : undefined;

      result[key] = policy ? policy(source[key], ancestors) : NOT_ALLOWLISTED;
    }

    return result;
  } catch {
    return redactionFailed(info);
  }
};

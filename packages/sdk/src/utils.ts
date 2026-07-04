import { getAddress, type Hex, isAddress } from "viem";

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export function validateUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ValidationError(`invalid URL: ${raw}`);
  }
  if (!url.protocol || !url.host) {
    throw new ValidationError(`invalid URL: ${raw}`);
  }
  return raw;
}

export function normalizePrivateKey(raw: string): string {
  const key = raw.startsWith("0x") ? raw.slice(2) : raw;
  if (!/^[0-9a-fA-F]{64}$/.test(key)) {
    throw new ValidationError("invalid private key (expected 32 byte hex)");
  }
  return `0x${key.toLowerCase()}`;
}

export function normalizeAddress(raw: string): string {
  const candidate = String(raw);
  if (isAddress(candidate)) {
    return getAddress(candidate);
  }
  const lower = candidate.toLowerCase();
  if (isAddress(lower)) {
    return getAddress(lower);
  }
  throw new ValidationError(`invalid address: ${raw}`);
}

export function ensureHexPrefix(value: string): Hex {
  return (value.startsWith("0x") ? value : `0x${value}`) as Hex;
}

function parseNumericString(raw: string): bigint {
  const text = raw.trim();
  const n = BigInt(text);
  if (n < 0n) {
    throw new ValidationError("u256 cannot be negative");
  }
  return n;
}

export function parseU256(value: number | bigint | string): bigint {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new ValidationError("invalid integer");
    }
    if (!Number.isSafeInteger(value)) {
      throw new ValidationError(
        "integer value exceeds safe precision; use bigint or hex string for large values",
      );
    }
    if (value < 0) {
      throw new ValidationError("u256 cannot be negative");
    }
    return BigInt(value);
  }
  if (typeof value === "bigint") {
    if (value < 0) {
      throw new ValidationError("u256 cannot be negative");
    }
    return value;
  }
  if (typeof value === "string") {
    return parseNumericString(value);
  }
  throw new ValidationError(`unsupported numeric type: ${typeof value}`);
}

export function serializeU256(value: number | bigint | string): string {
  return `0x${parseU256(value).toString(16)}`;
}

export function hexFromBytes(bytes: Uint8Array): Hex {
  return `0x${Buffer.from(bytes).toString("hex")}`;
}

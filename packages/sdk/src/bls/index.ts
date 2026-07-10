import { toBytes } from "viem";
import type { BlsField, BlsModule, BlsSignatureInput } from "@/bls/models";
import { DEBUG_BLS } from "@/debug";
import { VerificationError } from "@/errors";

let curvesCache: BlsModule | null = null;
let curvesPromise: Promise<BlsModule> | null = null;

function splitFp(value: bigint): [Uint8Array, Uint8Array] {
  const be48 = value.toString(16).padStart(96, "0");
  const bytes = toBytes(`0x${be48}`);
  const hi = new Uint8Array(32);
  hi.set(bytes.slice(0, 16), 16);
  const lo = bytes.slice(16);
  return [hi, lo];
}

const isBlsModule = (mod: unknown): mod is BlsModule =>
  mod !== null &&
  typeof mod === "object" &&
  "bls12_381" in mod &&
  typeof (mod as Record<string, unknown>).bls12_381 === "object";

/**
 * Lazily load the optional `@noble/curves` BLS module via a runtime-neutral
 * dynamic import. Kept lazy (no top-level await) so importing the SDK stays
 * side-effect free and works on Node, Bun, Deno, and edge runtimes.
 */
const loadCurvesAsync = async (): Promise<BlsModule> => {
  if (curvesCache) return curvesCache;
  if (curvesPromise) return curvesPromise;
  curvesPromise = (async () => {
    let mod: unknown;
    try {
      // @noble/curves v2 exposes the subpath with an explicit `.js` extension.
      mod = await import("@noble/curves/bls12-381.js");
    } catch {
      throw new VerificationError(
        "BLS decoding requires @noble/curves; install it to enable remuneration",
      );
    }
    const candidate =
      mod &&
      typeof mod === "object" &&
      "default" in mod &&
      isBlsModule((mod as { default: unknown }).default)
        ? (mod as { default: BlsModule }).default
        : mod;
    if (!isBlsModule(candidate)) {
      throw new VerificationError(
        "BLS decoding: unexpected module shape from @noble/curves",
      );
    }
    return candidate;
  })();
  curvesCache = await curvesPromise;
  return curvesCache;
};

const normalizeSignature = (
  input: unknown,
): { hex: string; bytes: Uint8Array } => {
  if (DEBUG_BLS) {
    const type =
      input && typeof input === "object"
        ? `object(keys=${Object.keys(input as Record<string, unknown>)
            .slice(0, 6)
            .join(",")})`
        : typeof input;
    console.log(`  debug bls: normalizeSignature input=${type}`);
  }
  if (typeof input === "string") {
    const raw = input.startsWith("0x") ? input.slice(2) : input;
    const bytes = toBytes(`0x${raw}`);
    return { hex: raw, bytes };
  }
  if (input instanceof Uint8Array) {
    const hex = Buffer.from(input).toString("hex");
    return { hex, bytes: input };
  }
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(input)) {
    const hex = input.toString("hex");
    return { hex, bytes: new Uint8Array(input) };
  }
  if (input instanceof ArrayBuffer) {
    const bytes = new Uint8Array(input);
    const hex = Buffer.from(bytes).toString("hex");
    return { hex, bytes };
  }
  if (ArrayBuffer.isView(input)) {
    const bytes = new Uint8Array(
      input.buffer,
      input.byteOffset,
      input.byteLength,
    );
    const hex = Buffer.from(bytes).toString("hex");
    return { hex, bytes };
  }
  if (Array.isArray(input)) {
    const bytes = Uint8Array.from(input);
    const hex = Buffer.from(bytes).toString("hex");
    return { hex, bytes };
  }
  if (input && typeof input === "object") {
    const record = input as Record<string, unknown>;
    if (Array.isArray(record.data)) {
      const arr = record.data as unknown[];
      if (
        arr.some(
          (b) =>
            typeof b !== "number" || b < 0 || b > 255 || !Number.isInteger(b),
        )
      ) {
        throw new VerificationError(
          "signature data array contains invalid byte values",
        );
      }
      const bytes = Uint8Array.from(arr as number[]);
      const hex = Buffer.from(bytes).toString("hex");
      return { hex, bytes };
    }
    if ("bytes" in record) {
      return normalizeSignature(record.bytes);
    }
    if ("signature" in record) {
      return normalizeSignature(record.signature);
    }
  }
  const label =
    input && typeof input === "object"
      ? `object(keys=${Object.keys(input as Record<string, unknown>)
          .slice(0, 6)
          .join(",")})`
      : typeof input;
  throw new VerificationError(
    `expected signature hex string or bytes, got ${label}`,
  );
};

const signatureToWordsWith = (
  curves: BlsModule,
  signatureHex: BlsSignatureInput,
): Uint8Array[] => {
  const toBigint = (field: BlsField): bigint => {
    if (
      typeof field === "bigint" ||
      typeof field === "number" ||
      typeof field === "string"
    ) {
      return BigInt(field);
    }
    if (
      field &&
      typeof field === "object" &&
      "value" in field &&
      field.value !== undefined
    ) {
      const value = field.value;
      if (
        typeof value === "bigint" ||
        typeof value === "number" ||
        typeof value === "string"
      ) {
        return BigInt(value);
      }
    }
    throw new VerificationError("invalid BLS field element");
  };

  const readFp2 = (value: unknown): [BlsField, BlsField] => {
    if (!value || typeof value !== "object") {
      throw new VerificationError("invalid BLS field element");
    }
    const record = value as Record<string, unknown>;
    if (Array.isArray(record.c) && record.c.length >= 2) {
      return [record.c[0] as BlsField, record.c[1] as BlsField];
    }
    if ("c0" in record && "c1" in record) {
      return [record.c0 as BlsField, record.c1 as BlsField];
    }
    if (Array.isArray((record as { coeffs?: unknown }).coeffs)) {
      const coeffs = (record as { coeffs?: unknown }).coeffs as unknown[];
      if (coeffs.length >= 2)
        return [coeffs[0] as BlsField, coeffs[1] as BlsField];
    }
    throw new VerificationError("invalid BLS field element");
  };

  try {
    const sig = normalizeSignature(signatureHex);
    const g2 = curves.bls12_381.G2;
    const pointCtor = g2.Point ?? g2.ProjectivePoint;
    if (!pointCtor?.fromHex) {
      throw new VerificationError("unsupported @noble/curves BLS export");
    }
    let point: ReturnType<NonNullable<typeof pointCtor>["fromHex"]>;
    try {
      point = pointCtor.fromHex(sig.bytes);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("hex string expected")) {
        point = pointCtor.fromHex(sig.hex);
      } else {
        throw err;
      }
    }
    const affine = point.toAffine();
    const [x0, x1] = readFp2(affine.x);
    const [y0, y1] = readFp2(affine.y);
    const coords = [x0, x1, y0, y1].map((fp) => toBigint(fp));
    const words: Uint8Array[] = [];
    coords.forEach((coord) => {
      const [hi, lo] = splitFp(coord);
      words.push(hi, lo);
    });
    return words;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new VerificationError(`invalid BLS signature: ${message}`);
  }
};

/**
 * Expand a compressed G2 signature into the tuple expected by the contract.
 * This mirrors the Python helper and requires the optional `@noble/curves` dependency.
 *
 * Synchronous variant: usable only after {@link signatureToWordsAsync} (or any
 * async remuneration path) has loaded `@noble/curves`. Prefer
 * {@link signatureToWordsAsync}, which is runtime-neutral and used internally.
 *
 * @throws {@link VerificationError} if `@noble/curves` has not been loaded yet.
 */
export function signatureToWords(signatureHex: string): Uint8Array[] {
  if (!curvesCache) {
    throw new VerificationError(
      "BLS module not loaded synchronously; use signatureToWordsAsync instead",
    );
  }
  return signatureToWordsWith(curvesCache, signatureHex);
}

export async function signatureToWordsAsync(
  signatureHex: string,
): Promise<Uint8Array[]> {
  const curves = await loadCurvesAsync();
  return signatureToWordsWith(curves, signatureHex);
}

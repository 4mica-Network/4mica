/**
 * x402 wire models for the `4mica-credit` scheme.
 *
 * CamelCase on the wire (facilitator/resource-server convention). The v2
 * challenge travels in the `PAYMENT-REQUIRED` header; a signed payment
 * travels as `X-PAYMENT` (v1) or `PAYMENT-SIGNATURE` (v2), base64 of the
 * envelope.
 */

import { X402Error } from "@/errors";
import {
  BLSCert,
  type PaymentSignature,
  ValidationRequirement,
} from "@/models";
import { getAny, isRecord } from "@/serde";
import { normalizeBytes32Hex, ValidationError } from "@/utils";

export const SCHEME_4MICA_CREDIT = "4mica-credit";

/** The `extra.validation` object a resource server sends to gate a payment on a validator. */
export interface ValidationExtra {
  validator: string;
  /** 0x-prefixed bytes32 the validator must approve. */
  subject: string;
  /** Unix seconds; core tightens this to the cycle's resolution cutoff. */
  deadline?: number;
  /** 0x-prefixed validator-specific policy bytes. */
  params?: string;
}

export function parseValidationExtra(raw: unknown): ValidationExtra {
  if (!isRecord(raw)) {
    throw new X402Error("invalid paymentRequirements.extra.validation");
  }
  const validator = raw.validator;
  const subject = raw.subject;
  if (!validator || !subject) {
    throw new X402Error("extra.validation requires validator and subject");
  }
  let normalizedSubject: string;
  try {
    normalizedSubject = normalizeBytes32Hex(String(subject));
  } catch (err) {
    if (err instanceof ValidationError) {
      throw new X402Error(`invalid validation subject: ${err.message}`);
    }
    throw err;
  }
  const deadline = raw.deadline;
  return {
    validator: String(validator),
    subject: normalizedSubject,
    deadline:
      deadline === undefined || deadline === null
        ? undefined
        : Number(deadline),
    params:
      raw.params === undefined || raw.params === null
        ? undefined
        : String(raw.params),
  };
}

/** Parsed `paymentRequirements.extra`. A `validation` entry ⇒ the payment is validation-gated. */
export interface PaymentRequirementsExtra {
  validation?: ValidationExtra;
  [key: string]: unknown;
}

/**
 * Read the validation requirement out of a raw `extra` object, if present.
 */
export function validationFromExtra(
  extra: PaymentRequirementsExtra | undefined,
): ValidationRequirement | undefined {
  if (!extra || extra.validation === undefined || extra.validation === null) {
    return undefined;
  }
  const parsed = parseValidationExtra(extra.validation);
  try {
    return new ValidationRequirement({
      validator: parsed.validator,
      subject: parsed.subject,
      deadline: parsed.deadline,
      params: parsed.params ?? "0x",
    });
  } catch (err) {
    if (err instanceof ValidationError) {
      throw new X402Error(`invalid extra.validation: ${err.message}`);
    }
    throw err;
  }
}

function requireFields(raw: Record<string, unknown>, fields: string[]): void {
  const missing = fields.filter((field) => !raw[field]);
  if (missing.length > 0) {
    throw new X402Error(
      `payment requirements missing fields: ${missing.join(", ")}`,
    );
  }
}

/** V1 payment requirements from a `402 Payment Required` response body. */
export class PaymentRequirementsV1 {
  scheme: string;
  network: string;
  maxAmountRequired: string;
  payTo: string;
  asset: string;
  extra: PaymentRequirementsExtra;
  resource?: string;
  description?: string;
  mimeType?: string;
  outputSchema?: unknown;
  maxTimeoutSeconds?: number;

  constructor(init: {
    scheme: string;
    network: string;
    maxAmountRequired: string;
    payTo: string;
    asset: string;
    extra?: PaymentRequirementsExtra;
    resource?: string;
    description?: string;
    mimeType?: string;
    outputSchema?: unknown;
    maxTimeoutSeconds?: number;
  }) {
    this.scheme = init.scheme;
    this.network = init.network;
    this.maxAmountRequired = String(init.maxAmountRequired);
    this.payTo = init.payTo;
    this.asset = init.asset;
    this.extra = init.extra ?? {};
    this.resource = init.resource;
    this.description = init.description;
    this.mimeType = init.mimeType;
    this.outputSchema = init.outputSchema;
    this.maxTimeoutSeconds = init.maxTimeoutSeconds;
  }

  get amount(): string {
    return this.maxAmountRequired;
  }

  static fromRaw(raw: Record<string, unknown>): PaymentRequirementsV1 {
    if (!isRecord(raw)) {
      throw new X402Error("invalid payment requirements");
    }
    requireFields(raw, [
      "scheme",
      "network",
      "maxAmountRequired",
      "payTo",
      "asset",
    ]);
    return new PaymentRequirementsV1({
      scheme: String(raw.scheme),
      network: String(raw.network),
      maxAmountRequired: String(raw.maxAmountRequired),
      payTo: String(raw.payTo),
      asset: String(raw.asset),
      extra: isRecord(raw.extra) ? (raw.extra as PaymentRequirementsExtra) : {},
      resource: raw.resource === undefined ? undefined : String(raw.resource),
      description:
        raw.description === undefined ? undefined : String(raw.description),
      mimeType: raw.mimeType === undefined ? undefined : String(raw.mimeType),
      outputSchema: raw.outputSchema,
      maxTimeoutSeconds:
        raw.maxTimeoutSeconds === undefined || raw.maxTimeoutSeconds === null
          ? undefined
          : Number(raw.maxTimeoutSeconds),
    });
  }

  toPayload(): Record<string, unknown> {
    const payload: Record<string, unknown> = {
      scheme: this.scheme,
      network: this.network,
      maxAmountRequired: this.maxAmountRequired,
      payTo: this.payTo,
      asset: this.asset,
    };
    if (Object.keys(this.extra).length > 0) payload.extra = { ...this.extra };
    if (this.resource !== undefined) payload.resource = this.resource;
    if (this.description !== undefined) payload.description = this.description;
    if (this.mimeType !== undefined) payload.mimeType = this.mimeType;
    if (this.outputSchema !== undefined)
      payload.outputSchema = this.outputSchema;
    if (this.maxTimeoutSeconds !== undefined)
      payload.maxTimeoutSeconds = this.maxTimeoutSeconds;
    return payload;
  }
}

/** V2 payment requirements (one `accepts` entry of the v2 challenge). */
export class PaymentRequirementsV2 {
  scheme: string;
  network: string;
  asset: string;
  amount: string;
  payTo: string;
  extra: PaymentRequirementsExtra;
  maxTimeoutSeconds?: number;

  constructor(init: {
    scheme: string;
    network: string;
    asset: string;
    amount: string;
    payTo: string;
    extra?: PaymentRequirementsExtra;
    maxTimeoutSeconds?: number;
  }) {
    this.scheme = init.scheme;
    this.network = init.network;
    this.asset = init.asset;
    this.amount = String(init.amount);
    this.payTo = init.payTo;
    this.extra = init.extra ?? {};
    this.maxTimeoutSeconds = init.maxTimeoutSeconds;
  }

  static fromRaw(raw: Record<string, unknown>): PaymentRequirementsV2 {
    if (!isRecord(raw)) {
      throw new X402Error("invalid payment requirements");
    }
    requireFields(raw, ["scheme", "network", "amount", "payTo", "asset"]);
    return new PaymentRequirementsV2({
      scheme: String(raw.scheme),
      network: String(raw.network),
      asset: String(raw.asset),
      amount: String(raw.amount),
      payTo: String(raw.payTo),
      extra: isRecord(raw.extra) ? (raw.extra as PaymentRequirementsExtra) : {},
      maxTimeoutSeconds:
        raw.maxTimeoutSeconds === undefined || raw.maxTimeoutSeconds === null
          ? undefined
          : Number(raw.maxTimeoutSeconds),
    });
  }

  toPayload(): Record<string, unknown> {
    const payload: Record<string, unknown> = {
      scheme: this.scheme,
      network: this.network,
      asset: this.asset,
      amount: this.amount,
      payTo: this.payTo,
    };
    if (Object.keys(this.extra).length > 0) payload.extra = { ...this.extra };
    if (this.maxTimeoutSeconds !== undefined)
      payload.maxTimeoutSeconds = this.maxTimeoutSeconds;
    return payload;
  }
}

export type PaymentRequirements = PaymentRequirementsV1 | PaymentRequirementsV2;

export class X402ResourceInfo {
  url: string;
  description?: string;
  mimeType?: string;

  constructor(init: { url: string; description?: string; mimeType?: string }) {
    this.url = init.url;
    this.description = init.description;
    this.mimeType = init.mimeType;
  }

  static fromRaw(raw: unknown): X402ResourceInfo {
    if (!isRecord(raw) || !raw.url) {
      throw new X402Error("invalid resource info");
    }
    return new X402ResourceInfo({
      url: String(raw.url),
      description:
        raw.description === undefined || raw.description === null
          ? undefined
          : String(raw.description),
      mimeType:
        raw.mimeType === undefined || raw.mimeType === null
          ? undefined
          : String(raw.mimeType),
    });
  }

  toPayload(): Record<string, unknown> {
    const payload: Record<string, unknown> = { url: this.url };
    if (this.description !== undefined) payload.description = this.description;
    if (this.mimeType !== undefined) payload.mimeType = this.mimeType;
    return payload;
  }
}

/** The v2 challenge (`PAYMENT-REQUIRED` header, base64 JSON). */
export class X402PaymentRequired {
  x402Version: number;
  resource: X402ResourceInfo;
  accepts: PaymentRequirementsV2[];
  error?: string;
  extensions?: Record<string, unknown>;

  constructor(init: {
    x402Version: number;
    resource: X402ResourceInfo;
    accepts: PaymentRequirementsV2[];
    error?: string;
    extensions?: Record<string, unknown>;
  }) {
    this.x402Version = init.x402Version;
    this.resource = init.resource;
    this.accepts = init.accepts;
    this.error = init.error;
    this.extensions = init.extensions;
  }

  static fromRaw(raw: unknown): X402PaymentRequired {
    if (!isRecord(raw)) {
      throw new X402Error("invalid payment required payload");
    }
    const version = getAny(raw, "x402Version");
    if (version === undefined || version === null) {
      throw new X402Error("missing x402Version");
    }
    const acceptsRaw = getAny(raw, "accepts");
    return new X402PaymentRequired({
      x402Version: Number(version),
      resource: X402ResourceInfo.fromRaw(getAny(raw, "resource") ?? {}),
      accepts: (Array.isArray(acceptsRaw) ? acceptsRaw : []).map((entry) =>
        PaymentRequirementsV2.fromRaw(entry as Record<string, unknown>),
      ),
      error:
        raw.error === undefined || raw.error === null
          ? undefined
          : String(raw.error),
      extensions: isRecord(raw.extensions)
        ? (raw.extensions as Record<string, unknown>)
        : undefined,
    });
  }
}

/** The signed payment payload carried inside an envelope. */
export interface X402PaymentPayload {
  claims: Record<string, unknown>;
  signature: string;
  scheme: string;
}

export interface X402PaymentEnvelopeV1 {
  x402Version: number;
  scheme: string;
  network: string;
  payload: X402PaymentPayload;
}

export interface X402PaymentEnvelopeV2 {
  x402Version: number;
  accepted: Record<string, unknown>;
  payload: X402PaymentPayload;
  resource: Record<string, unknown>;
  extensions?: Record<string, unknown>;
}

export type X402PaymentEnvelope = X402PaymentEnvelopeV1 | X402PaymentEnvelopeV2;

/**
 * A signed payment in both forms: `header` for the HTTP request header,
 * `envelope` (the decoded object) for a facilitator's `paymentPayload`.
 */
export interface X402SignedPayment {
  header: string;
  envelope: X402PaymentEnvelope;
  x402Version: number;
  payload: X402PaymentPayload;
  signature: PaymentSignature;
}

/**
 * The facilitator's `/settle` response. Failures arrive as HTTP 200 with
 * `success: false` — read the body, not the status.
 */
export class SettlementReceipt {
  success: boolean;
  txHash?: string;
  networkId?: string;
  certificate?: BLSCert;
  error?: string;
  raw: Record<string, unknown>;

  constructor(init: {
    success: boolean;
    txHash?: string;
    networkId?: string;
    certificate?: BLSCert;
    error?: string;
    raw: Record<string, unknown>;
  }) {
    this.success = init.success;
    this.txHash = init.txHash;
    this.networkId = init.networkId;
    this.certificate = init.certificate;
    this.error = init.error;
    this.raw = init.raw;
  }

  static fromRaw(raw: unknown): SettlementReceipt {
    const record: Record<string, unknown> = isRecord(raw) ? raw : {};
    let certificate: BLSCert | undefined;
    const certificateRaw = record.certificate;
    if (isRecord(certificateRaw)) {
      const claims = getAny(certificateRaw, "claims");
      const signature = getAny(certificateRaw, "signature");
      if (claims !== undefined && signature !== undefined) {
        certificate = new BLSCert(String(claims), String(signature));
      }
    }
    const pick = (...keys: string[]): string | undefined => {
      const value = getAny(record, ...keys);
      return value === undefined || value === null ? undefined : String(value);
    };
    return new SettlementReceipt({
      success: Boolean(record.success),
      txHash: pick("txHash", "tx_hash"),
      networkId: pick("networkId", "network_id", "network"),
      certificate,
      error: pick("error", "errorReason", "invalidReason"),
      raw: record,
    });
  }
}

export interface X402SettledPayment {
  payment: X402SignedPayment;
  settlement: SettlementReceipt;
}

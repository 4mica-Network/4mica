/**
 * EIP-712 payloads the payer and the operator sign, and the domains they are
 * signed under. Port of `crates/rpc/src/guarantee/signing.rs`.
 *
 * The ClearingHouse and GuaranteeRegistry contracts hash these same layouts
 * when they verify a signature, so the type strings below are pinned
 * literals: renaming a struct or reordering a field changes the type hash and
 * invalidates every signature already produced.
 *
 * Payloads are read structurally rather than imported, so `@/models` can
 * build on this module.
 */

import {
  decodeAbiParameters,
  encodeAbiParameters,
  type Hex,
  hashTypedData,
  keccak256,
  recoverAddress,
  toHex,
} from "viem";
import { eip712DomainSeparator } from "@/digest";
import {
  InvalidParamsError,
  MalformedReceiptError,
  ReceiptSignerMismatchError,
  UnreadableReceiptSignatureError,
} from "@/errors";
import { getAny, isRecord } from "@/serde";
import {
  bytesFromHex,
  ensureHexPrefix,
  normalizeAddress,
  normalizeBytes32Hex,
  ValidationError,
} from "@/utils";

/** EIP-712 domain the ClearingHouse verifies every payer-signed payload under. */
export const CLEARING_HOUSE_EIP712_NAME = "4micaClearingHouse";
export const CLEARING_HOUSE_EIP712_VERSION = "1";

/** EIP-712 domain the GuaranteeRegistry verifies operator receipts under. */
export const GUARANTEE_REGISTRY_EIP712_NAME = "4micaGuaranteeRegistry";
export const GUARANTEE_REGISTRY_EIP712_VERSION = "1";

/**
 * What a payer authorizes per guarantee. The recipient is bound through
 * `recipientCommitment` so the on-chain default path can verify the
 * authorization without learning who was paid.
 */
export const PAYMENT_AUTHORIZATION_TYPE =
  "PaymentAuthorization(address payer,bytes32 cycleId,address asset," +
  "uint256 amount,uint256 reqId,uint64 timestamp,bytes32 recipientCommitment)";
/** A payer's cumulative authorization for one cycle and asset up to a cutoff. */
export const CHECKPOINT_TYPE =
  "Checkpoint(address payer,bytes32 cycleId,address asset," +
  "uint256 cumulativeGross,uint64 timestampCutoff)";
/**
 * Version 1 of the operator's guarantee receipt. Its type hash is the key the
 * layout's on-chain verifier is registered under.
 */
export const GUARANTEE_V1_TYPE =
  "GuaranteeV1(uint256 cycleId,uint256 reqId,address client,address recipient," +
  "uint256 amount,address asset,uint64 timestamp)";
export const VALIDATION_TYPE =
  "Validation(string validator,bytes32 subject,uint64 deadline,bytes params)";

export const GUARANTEE_V1_TYPE_HASH: Hex = keccak256(toHex(GUARANTEE_V1_TYPE));
const VALIDATION_TYPE_HASH: Hex = keccak256(toHex(VALIDATION_TYPE));
const ZERO_WORD: Hex = `0x${"00".repeat(32)}`;

/** The typed-data `types` a payer signs a payment under. */
export const PAYMENT_AUTHORIZATION_TYPES = {
  PaymentAuthorization: [
    { name: "payer", type: "address" },
    { name: "cycleId", type: "bytes32" },
    { name: "asset", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "reqId", type: "uint256" },
    { name: "timestamp", type: "uint64" },
    { name: "recipientCommitment", type: "bytes32" },
  ],
} as const;

/** The typed-data `types` a payer signs a checkpoint under. */
export const CHECKPOINT_TYPES = {
  Checkpoint: [
    { name: "payer", type: "address" },
    { name: "cycleId", type: "bytes32" },
    { name: "asset", type: "address" },
    { name: "cumulativeGross", type: "uint256" },
    { name: "timestampCutoff", type: "uint64" },
  ],
} as const;

/** The typed-data `types` the operator signs a receipt under. */
export const GUARANTEE_V1_TYPES = {
  GuaranteeV1: [
    { name: "cycleId", type: "uint256" },
    { name: "reqId", type: "uint256" },
    { name: "client", type: "address" },
    { name: "recipient", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "asset", type: "address" },
    { name: "timestamp", type: "uint64" },
  ],
} as const;

const GUARANTEE_V1_PARAMS = [
  { type: "uint256" },
  { type: "uint256" },
  { type: "address" },
  { type: "address" },
  { type: "uint256" },
  { type: "address" },
  { type: "uint64" },
] as const;

/** An EIP-712 domain with all four fields, as both contracts declare theirs. */
export interface FourMicaEip712Domain {
  name: string;
  version: string;
  chainId: number;
  verifyingContract: Hex;
}

/** The domain every payer-signed payload is verified under, on-chain and off. */
export function clearingHouseDomain(
  chainId: number,
  clearingHouse: string,
): FourMicaEip712Domain {
  return {
    name: CLEARING_HOUSE_EIP712_NAME,
    version: CLEARING_HOUSE_EIP712_VERSION,
    chainId: Number(chainId),
    verifyingContract: address("clearing house", clearingHouse),
  };
}

/** The domain the operator's guarantee receipts are verified under. */
export function guaranteeRegistryDomain(
  chainId: number,
  registry: string,
): FourMicaEip712Domain {
  return {
    name: GUARANTEE_REGISTRY_EIP712_NAME,
    version: GUARANTEE_REGISTRY_EIP712_VERSION,
    chainId: Number(chainId),
    verifyingContract: address("guarantee registry", registry),
  };
}

/** The 32-byte separator a domain hashes to. */
export function domainSeparatorOf(domain: FourMicaEip712Domain): Hex {
  return eip712DomainSeparator(
    domain.name,
    domain.version,
    domain.chainId,
    domain.verifyingContract,
  );
}

/** What {@link recipientCommitment} reads of a validation requirement. */
export interface ValidationLike {
  validator: string;
  subject: string;
  deadline?: number;
  params: string;
}

/** What the signing helpers read of a payment payload. */
export interface PaymentPayloadLike {
  userAddress: string;
  recipientAddress: string;
  cycleId: string;
  reqId: bigint;
  amount: bigint;
  assetAddress: string;
  timestamp: number;
  salt: string;
  validation?: ValidationLike;
}

/** What the signing helpers read of a checkpoint payload. */
export interface CheckpointPayloadLike {
  payer: string;
  cycleId: string;
  assetAddress: string;
  cumulativeGross: bigint;
  timestampCutoff: number;
}

function address(field: string, value: string): Hex {
  try {
    return normalizeAddress(String(value).trim()) as Hex;
  } catch {
    throw new InvalidParamsError(`invalid ${field} address: ${value}`);
  }
}

function word(field: string, value: string): Hex {
  try {
    return normalizeBytes32Hex(value);
  } catch {
    throw new InvalidParamsError(`invalid ${field}: ${value}`);
  }
}

function validationHash(validation: ValidationLike): Hex {
  return keccak256(
    encodeAbiParameters(
      [
        { type: "bytes32" },
        { type: "bytes32" },
        { type: "bytes32" },
        { type: "uint64" },
        { type: "bytes32" },
      ],
      [
        VALIDATION_TYPE_HASH,
        keccak256(toHex(validation.validator)),
        word("validation subject", validation.subject),
        BigInt(validation.deadline ?? 0),
        keccak256(ensureHexPrefix(validation.params || "0x")),
      ],
    ),
  );
}

/**
 * Binds the off-chain terms of a guarantee — the recipient and any validation
 * requirement — into the one word the payer signs. `salt` keeps the recipient
 * from being recovered by guessing.
 */
export function recipientCommitment(
  recipient: string,
  salt: string,
  validation?: ValidationLike,
): Hex {
  return keccak256(
    encodeAbiParameters(
      [{ type: "address" }, { type: "bytes32" }, { type: "bytes32" }],
      [
        address("recipient", recipient),
        word("salt", salt),
        validation === undefined ? ZERO_WORD : validationHash(validation),
      ],
    ),
  );
}

/** The typed data a payer signs for a payment payload. */
export function paymentAuthorizationTypedData(
  domain: FourMicaEip712Domain,
  payload: PaymentPayloadLike,
) {
  return {
    domain,
    types: PAYMENT_AUTHORIZATION_TYPES,
    primaryType: "PaymentAuthorization" as const,
    message: {
      payer: address("user", payload.userAddress),
      cycleId: word("cycle id", payload.cycleId),
      asset: address("asset", payload.assetAddress),
      amount: payload.amount,
      reqId: payload.reqId,
      timestamp: BigInt(payload.timestamp),
      recipientCommitment: recipientCommitment(
        payload.recipientAddress,
        payload.salt,
        payload.validation,
      ),
    },
  };
}

/** The digest a payer's wallet signs for a payment payload. */
export function paymentSigningDigest(
  domain: FourMicaEip712Domain,
  payload: PaymentPayloadLike,
): Hex {
  return hashTypedData(paymentAuthorizationTypedData(domain, payload));
}

/** The typed data a payer signs for a checkpoint. */
export function checkpointTypedData(
  domain: FourMicaEip712Domain,
  payload: CheckpointPayloadLike,
) {
  return {
    domain,
    types: CHECKPOINT_TYPES,
    primaryType: "Checkpoint" as const,
    message: {
      payer: address("payer", payload.payer),
      cycleId: word("cycle id", payload.cycleId),
      asset: address("asset", payload.assetAddress),
      cumulativeGross: payload.cumulativeGross,
      timestampCutoff: BigInt(payload.timestampCutoff),
    },
  };
}

/** The digest a payer's wallet signs for a checkpoint. */
export function checkpointSigningDigest(
  domain: FourMicaEip712Domain,
  payload: CheckpointPayloadLike,
): Hex {
  return hashTypedData(checkpointTypedData(domain, payload));
}

/**
 * The checksummed address whose key produced `signature` over `digest`, or
 * `undefined` when the signature is not a readable 65-byte `r‖s‖v`.
 */
export async function recoverSigner(
  digest: Hex,
  signature: string,
): Promise<string | undefined> {
  const hex = ensureHexPrefix(String(signature));
  if (!/^0x[0-9a-fA-F]{130}$/.test(hex)) return undefined;
  try {
    return normalizeAddress(
      await recoverAddress({ hash: digest, signature: hex }),
    );
  } catch {
    return undefined;
  }
}

/**
 * The operator's guarantee, at the layout core currently signs
 * (`GuaranteeV1`). `cycleId` is the on-chain bytes32 cycle id read as an
 * integer, which is how the layout carries it.
 */
export class Guarantee {
  readonly cycleId: bigint;
  readonly reqId: bigint;
  readonly client: string;
  readonly recipient: string;
  readonly amount: bigint;
  readonly asset: string;
  readonly timestamp: number;

  constructor(init: {
    cycleId: bigint;
    reqId: bigint;
    client: string;
    recipient: string;
    amount: bigint;
    asset: string;
    timestamp: number;
  }) {
    this.cycleId = init.cycleId;
    this.reqId = init.reqId;
    this.client = address("client", init.client);
    this.recipient = address("recipient", init.recipient);
    this.amount = init.amount;
    this.asset = address("asset", init.asset);
    this.timestamp = Number(init.timestamp);
  }

  get version(): number {
    return 1;
  }

  /** EIP-712 type hash of this guarantee's layout. */
  get typeHash(): Hex {
    return GUARANTEE_V1_TYPE_HASH;
  }

  /** The guarantee core issues for `payload` in `cycleId`. */
  static fromPayment(
    payload: PaymentPayloadLike,
    cycleId: bigint | string,
  ): Guarantee {
    return new Guarantee({
      cycleId: BigInt(cycleId),
      reqId: payload.reqId,
      client: payload.userAddress,
      recipient: payload.recipientAddress,
      amount: payload.amount,
      asset: payload.assetAddress,
      timestamp: payload.timestamp,
    });
  }

  /**
   * Inverse of {@link receiptBytes}. Refuses what the chain would: a short
   * prefix, an unknown layout, or a payload that does not decode as its
   * layout.
   */
  static decode(data: string | Uint8Array): Guarantee {
    let bytes: Uint8Array;
    try {
      bytes = typeof data === "string" ? bytesFromHex(data) : data;
    } catch (err) {
      throw new MalformedReceiptError(`receipt is not hex: ${String(err)}`);
    }
    if (bytes.length < 32) {
      throw new MalformedReceiptError("receipt is shorter than a type hash");
    }
    const prefix = toHex(bytes.slice(0, 32));
    if (prefix !== GUARANTEE_V1_TYPE_HASH) {
      throw new MalformedReceiptError(
        `receipt type hash ${prefix} is not a layout this SDK knows`,
      );
    }
    const payload = bytes.slice(32);
    if (payload.length !== 32 * GUARANTEE_V1_PARAMS.length) {
      throw new MalformedReceiptError(
        `receipt payload is ${payload.length} bytes, not a GuaranteeV1`,
      );
    }
    let decoded: readonly unknown[];
    try {
      decoded = decodeAbiParameters(GUARANTEE_V1_PARAMS, toHex(payload));
    } catch (err) {
      throw new MalformedReceiptError(
        `receipt payload does not decode as its layout: ${String(err)}`,
      );
    }
    const [cycleId, reqId, client, recipient, amount, asset, timestamp] =
      decoded as [bigint, bigint, Hex, Hex, bigint, Hex, bigint];
    return new Guarantee({
      cycleId,
      reqId,
      client,
      recipient,
      amount,
      asset,
      timestamp: Number(timestamp),
    });
  }

  /** The digest the operator signs, under the GuaranteeRegistry domain. */
  signingDigest(domain: FourMicaEip712Domain): Hex {
    return hashTypedData({
      domain,
      types: GUARANTEE_V1_TYPES,
      primaryType: "GuaranteeV1",
      message: {
        cycleId: this.cycleId,
        reqId: this.reqId,
        client: this.client as Hex,
        recipient: this.recipient as Hex,
        amount: this.amount,
        asset: this.asset as Hex,
        timestamp: BigInt(this.timestamp),
      },
    });
  }

  /**
   * What `GuaranteeRegistry.verifyGuarantee` takes: the type hash, then the
   * layout ABI-encoded.
   */
  receiptBytes(): Hex {
    const encoded = encodeAbiParameters(GUARANTEE_V1_PARAMS, [
      this.cycleId,
      this.reqId,
      this.client as Hex,
      this.recipient as Hex,
      this.amount,
      this.asset as Hex,
      BigInt(this.timestamp),
    ]);
    return `${GUARANTEE_V1_TYPE_HASH}${encoded.slice(2)}` as Hex;
  }
}

/**
 * The operator's attestation of an issued guarantee: exactly what
 * `GuaranteeRegistry.verifyGuarantee` takes. {@link guarantee} decodes it.
 */
export class GuaranteeReceipt {
  /** The signed bytes, hex: the type hash, then the guarantee ABI-encoded. */
  readonly receipt: string;
  /** Operator signature over the guarantee, hex. */
  readonly signature: string;

  constructor(receipt: string, signature: string) {
    this.receipt = String(receipt);
    this.signature = String(signature);
  }

  static new(guarantee: Guarantee, signature: string): GuaranteeReceipt {
    return new GuaranteeReceipt(guarantee.receiptBytes(), signature);
  }

  /** The guarantee {@link receipt} encodes. */
  guarantee(): Guarantee {
    return Guarantee.decode(this.receipt);
  }

  toPayload(): { receipt: string; signature: string } {
    return { receipt: this.receipt, signature: this.signature };
  }

  static fromRpc(raw: unknown): GuaranteeReceipt {
    if (!isRecord(raw)) {
      throw new InvalidParamsError("guarantee receipt must be an object");
    }
    const receipt = getAny(raw, "receipt");
    const signature = getAny(raw, "signature");
    if (receipt === undefined || signature === undefined) {
      throw new InvalidParamsError(
        "guarantee receipt missing receipt or signature",
      );
    }
    return new GuaranteeReceipt(String(receipt), String(signature));
  }
}

/**
 * Check that `receipt` carries `guaranteeSigner`'s signature over the
 * guarantee it holds, and return that guarantee. Offline.
 *
 * Standalone so a service that never builds a `Client` — a facilitator or
 * backend vouching for a receipt it is asked to act on — can run the same
 * check. `domain` is {@link guaranteeRegistryDomain} for the deployment the
 * receipt was issued by.
 */
export async function verifyGuaranteeReceipt(
  receipt: GuaranteeReceipt,
  domain: FourMicaEip712Domain,
  guaranteeSigner: string,
): Promise<Guarantee> {
  const guarantee = receipt.guarantee();
  const recovered = await recoverSigner(
    guarantee.signingDigest(domain),
    receipt.signature,
  );
  if (recovered === undefined) {
    throw new UnreadableReceiptSignatureError(
      "guarantee receipt carries an unreadable signature",
    );
  }
  let expected: string;
  try {
    expected = normalizeAddress(guaranteeSigner);
  } catch (err) {
    if (err instanceof ValidationError) {
      throw new InvalidParamsError(
        `invalid guarantee signer: ${guaranteeSigner}`,
      );
    }
    throw err;
  }
  if (recovered !== expected) {
    throw new ReceiptSignerMismatchError(expected, recovered);
  }
  return guarantee;
}

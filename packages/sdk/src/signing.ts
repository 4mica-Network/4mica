import { type Account, encodeAbiParameters, type Hex } from "viem";

export {
  computeValidationRequestHash,
  computeValidationSubjectHash,
} from "./validation";

import { SigningError } from "./errors";
import {
  type CorePublicParameters,
  type PaymentGuaranteeRequestClaims,
  PaymentGuaranteeRequestClaimsV2,
  type PaymentSignature,
  SigningScheme,
} from "./models";
import { isRecord } from "./serde";
import { ensureHexPrefix, normalizeAddress, ValidationError } from "./utils";

export const GUARANTEE_EIP712_TYPES = {
  EIP712Domain: [
    { name: "name", type: "string" },
    { name: "version", type: "string" },
    { name: "chainId", type: "uint256" },
  ],
  SolGuaranteeRequestClaimsV1: [
    { name: "user", type: "address" },
    { name: "recipient", type: "address" },
    { name: "reqId", type: "uint256" },
    { name: "amount", type: "uint256" },
    { name: "asset", type: "address" },
    { name: "timestamp", type: "uint64" },
  ],
} as const;

export const GUARANTEE_EIP712_TYPES_V2 = {
  EIP712Domain: [
    { name: "name", type: "string" },
    { name: "version", type: "string" },
    { name: "chainId", type: "uint256" },
  ],
  SolGuaranteeRequestClaimsV2: [
    { name: "user", type: "address" },
    { name: "recipient", type: "address" },
    { name: "reqId", type: "uint256" },
    { name: "amount", type: "uint256" },
    { name: "asset", type: "address" },
    { name: "timestamp", type: "uint64" },
    { name: "validationRegistryAddress", type: "address" },
    { name: "validationRequestHash", type: "bytes32" },
    { name: "validationChainId", type: "uint256" },
    { name: "validatorAddress", type: "address" },
    { name: "validatorAgentId", type: "uint256" },
    { name: "minValidationScore", type: "uint8" },
    { name: "validationSubjectHash", type: "bytes32" },
    { name: "jobHash", type: "bytes32" },
    { name: "requiredValidationTag", type: "string" },
  ],
} as const;

export type GuaranteeTypedData = {
  types: typeof GUARANTEE_EIP712_TYPES;
  primaryType: "SolGuaranteeRequestClaimsV1";
  domain: {
    name: string;
    version: string;
    chainId: number;
  };
  message: {
    user: Hex;
    recipient: Hex;
    reqId: bigint;
    amount: bigint;
    asset: Hex;
    timestamp: bigint;
  };
};

export type GuaranteeTypedDataV2 = {
  types: typeof GUARANTEE_EIP712_TYPES_V2;
  primaryType: "SolGuaranteeRequestClaimsV2";
  domain: {
    name: string;
    version: string;
    chainId: number;
  };
  message: {
    user: Hex;
    recipient: Hex;
    reqId: bigint;
    amount: bigint;
    asset: Hex;
    timestamp: bigint;
    validationRegistryAddress: Hex;
    validationRequestHash: Hex;
    validationChainId: bigint;
    validatorAddress: Hex;
    validatorAgentId: bigint;
    minValidationScore: number;
    validationSubjectHash: Hex;
    jobHash: Hex;
    requiredValidationTag: string;
  };
};

export type GuaranteeTypedDataValidationOptions = {
  expectedChainId?: number;
  expectedSigner?: string;
  expectedRecipient?: string;
};

export type GuaranteeSigningContextOptions = {
  signerAddress?: string;
  signerChainId?: number;
};

const fieldsMatch = (
  actual: unknown,
  expected: readonly { name: string; type: string }[],
): boolean => {
  if (!Array.isArray(actual) || actual.length !== expected.length) return false;
  const norm = (list: readonly { name: string; type: string }[]) =>
    list.map((item) => `${item.name}:${item.type}`).sort();
  const actualSet = new Set(norm(actual));
  return norm(expected).every((key) => actualSet.has(key));
};

const parseChainId = (value: unknown): number => {
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim()) return Number(value);
  return Number.NaN;
};

const ensureBigIntish = (value: unknown, label: string): void => {
  try {
    BigInt(value as bigint | number | string);
  } catch {
    throw new ValidationError(`${label} must be a numeric value`);
  }
};

export function validateGuaranteeTypedData(
  payload: {
    domain: Record<string, unknown>;
    types: Record<string, Array<{ name: string; type: string }>>;
    message: Record<string, unknown>;
  },
  options: GuaranteeTypedDataValidationOptions = {},
): void {
  if (!isRecord(payload)) {
    throw new ValidationError("typed data payload is required");
  }
  if (!isRecord(payload.domain)) {
    throw new ValidationError("domain is required");
  }
  if (!isRecord(payload.types)) {
    throw new ValidationError("types are required");
  }
  if (!isRecord(payload.message)) {
    throw new ValidationError("message is required");
  }

  const types = payload.types;
  if (
    !fieldsMatch(
      types.SolGuaranteeRequestClaimsV1,
      GUARANTEE_EIP712_TYPES.SolGuaranteeRequestClaimsV1,
    )
  ) {
    throw new ValidationError(
      "Unexpected struct fields for SolGuaranteeRequestClaimsV1",
    );
  }

  const message = payload.message;
  const requiredFields = [
    "user",
    "recipient",
    "reqId",
    "amount",
    "asset",
    "timestamp",
  ];
  if (requiredFields.some((field) => !(field in message))) {
    throw new ValidationError(
      "message is missing required SolGuaranteeRequestClaimsV1 fields",
    );
  }

  const user = normalizeAddress(message.user as string);
  const recipient = normalizeAddress(message.recipient as string);
  normalizeAddress(message.asset as string);

  if (options.expectedSigner) {
    if (normalizeAddress(options.expectedSigner) !== user) {
      throw new ValidationError("message.user must match signer address");
    }
  }
  if (options.expectedRecipient) {
    if (normalizeAddress(options.expectedRecipient) !== recipient) {
      throw new ValidationError(
        "message.recipient must match expected recipient",
      );
    }
  }

  ensureBigIntish(message.reqId, "reqId");
  ensureBigIntish(message.amount, "amount");
  ensureBigIntish(message.timestamp, "timestamp");

  if (options.expectedChainId !== undefined) {
    const domainChainId = parseChainId(payload.domain.chainId);
    if (!Number.isFinite(domainChainId)) {
      throw new ValidationError(
        "domain.chainId is required for typed data signatures",
      );
    }
    if (Number(domainChainId) !== Number(options.expectedChainId)) {
      throw new ValidationError(
        `domain.chainId mismatch; expected ${options.expectedChainId}, got ${domainChainId}`,
      );
    }
  }
}

export function validateGuaranteeSigningContext(
  params: CorePublicParameters,
  claims: PaymentGuaranteeRequestClaims,
  options: GuaranteeSigningContextOptions = {},
): void {
  if (options.signerAddress) {
    const signer = normalizeAddress(options.signerAddress);
    const user = normalizeAddress(claims.userAddress);
    if (signer !== user) {
      throw new ValidationError(
        `address mismatch: signer ${options.signerAddress} != claims.user_address ${claims.userAddress}`,
      );
    }
  }

  if (options.signerChainId !== undefined) {
    const signerChainId = Number(options.signerChainId);
    if (!Number.isFinite(signerChainId)) {
      throw new ValidationError("signer chain id is invalid");
    }
    if (Number(params.chainId) !== signerChainId) {
      throw new ValidationError(
        `chain id mismatch: expected ${params.chainId}, got ${signerChainId}`,
      );
    }
  }
}

export function buildGuaranteeTypedData(
  params: CorePublicParameters,
  claims: PaymentGuaranteeRequestClaims,
): GuaranteeTypedData {
  return {
    types: GUARANTEE_EIP712_TYPES,
    primaryType: "SolGuaranteeRequestClaimsV1",
    domain: {
      name: params.eip712Name,
      version: params.eip712Version,
      chainId: params.chainId,
    },
    message: {
      user: claims.userAddress as Hex,
      recipient: claims.recipientAddress as Hex,
      reqId: claims.reqId,
      amount: claims.amount,
      asset: claims.assetAddress as Hex,
      timestamp: BigInt(claims.timestamp),
    },
  } as const;
}

export function buildGuaranteeTypedDataV2(
  params: CorePublicParameters,
  claims: PaymentGuaranteeRequestClaimsV2,
): GuaranteeTypedDataV2 {
  return {
    types: GUARANTEE_EIP712_TYPES_V2,
    primaryType: "SolGuaranteeRequestClaimsV2",
    domain: {
      name: params.eip712Name,
      version: params.eip712Version,
      chainId: params.chainId,
    },
    message: {
      user: claims.userAddress as Hex,
      recipient: claims.recipientAddress as Hex,
      reqId: claims.reqId,
      amount: claims.amount,
      asset: claims.assetAddress as Hex,
      timestamp: BigInt(claims.timestamp),
      validationRegistryAddress: claims.validationRegistryAddress as Hex,
      validationRequestHash: ensureHexPrefix(claims.validationRequestHash),
      validationChainId: BigInt(claims.validationChainId),
      validatorAddress: claims.validatorAddress as Hex,
      validatorAgentId: claims.validatorAgentId,
      minValidationScore: claims.minValidationScore,
      validationSubjectHash: ensureHexPrefix(claims.validationSubjectHash),
      jobHash: ensureHexPrefix(claims.jobHash),
      requiredValidationTag: claims.requiredValidationTag,
    },
  } as const;
}

export function encodeGuaranteeEip191V2(
  claims: PaymentGuaranteeRequestClaimsV2,
): string {
  return encodeAbiParameters(
    [
      { type: "address" },
      { type: "address" },
      { type: "uint256" },
      { type: "uint256" },
      { type: "address" },
      { type: "uint64" },
      { type: "address" },
      { type: "bytes32" },
      { type: "uint256" },
      { type: "address" },
      { type: "uint256" },
      { type: "uint8" },
      { type: "bytes32" },
      { type: "bytes32" },
      { type: "string" },
    ],
    [
      claims.userAddress as Hex,
      claims.recipientAddress as Hex,
      claims.reqId,
      claims.amount,
      claims.assetAddress as Hex,
      BigInt(claims.timestamp),
      claims.validationRegistryAddress as Hex,
      (claims.validationRequestHash.startsWith("0x")
        ? claims.validationRequestHash
        : `0x${claims.validationRequestHash}`) as Hex,
      BigInt(claims.validationChainId),
      claims.validatorAddress as Hex,
      claims.validatorAgentId,
      claims.minValidationScore,
      (claims.validationSubjectHash.startsWith("0x")
        ? claims.validationSubjectHash
        : `0x${claims.validationSubjectHash}`) as Hex,
      (claims.jobHash.startsWith("0x")
        ? claims.jobHash
        : `0x${claims.jobHash}`) as Hex,
      claims.requiredValidationTag,
    ],
  );
}

export function encodeGuaranteeEip191(
  claims: PaymentGuaranteeRequestClaims,
): string {
  const payload = encodeAbiParameters(
    [
      { type: "address" },
      { type: "address" },
      { type: "uint256" },
      { type: "uint256" },
      { type: "address" },
      { type: "uint64" },
    ],
    [
      claims.userAddress as Hex,
      claims.recipientAddress as Hex,
      claims.reqId,
      claims.amount,
      claims.assetAddress as Hex,
      BigInt(claims.timestamp),
    ],
  );
  return payload;
}

export class PaymentSigner {
  readonly signer: Account;

  constructor(signer: Account) {
    this.signer = signer;
  }

  async signRequest(
    params: CorePublicParameters,
    claims: PaymentGuaranteeRequestClaims | PaymentGuaranteeRequestClaimsV2,
    scheme: SigningScheme = SigningScheme.EIP712,
  ): Promise<PaymentSignature> {
    try {
      validateGuaranteeSigningContext(params, claims, {
        signerAddress: this.signer.address,
      });
      const isV2 = claims instanceof PaymentGuaranteeRequestClaimsV2;

      if (scheme === SigningScheme.EIP712) {
        if (!this.signer.signTypedData) {
          throw new SigningError(
            "signTypedData is not supported for this account",
          );
        }
        if (isV2) {
          const typed = buildGuaranteeTypedDataV2(params, claims);
          const signature = await this.signer.signTypedData({
            domain: typed.domain,
            types: {
              SolGuaranteeRequestClaimsV2:
                typed.types.SolGuaranteeRequestClaimsV2,
            },
            primaryType: typed.primaryType,
            message: typed.message,
          });
          return { signature, scheme };
        }
        const typed = buildGuaranteeTypedData(params, claims);
        const signature = await this.signer.signTypedData({
          domain: typed.domain,
          types: {
            SolGuaranteeRequestClaimsV1:
              typed.types.SolGuaranteeRequestClaimsV1,
          },
          primaryType: typed.primaryType,
          message: typed.message,
        });
        return { signature, scheme };
      }

      if (scheme === SigningScheme.EIP191) {
        if (!this.signer.signMessage) {
          throw new SigningError(
            "signMessage is not supported for this account",
          );
        }
        const message = isV2
          ? encodeGuaranteeEip191V2(claims)
          : encodeGuaranteeEip191(claims);
        const signature = await this.signer.signMessage({ message });
        return { signature, scheme };
      }

      throw new SigningError(`unsupported signing scheme: ${scheme}`);
    } catch (err: unknown) {
      if (err instanceof ValidationError) {
        throw new SigningError(err.message);
      }
      const message = err instanceof Error ? err.message : String(err);
      throw new SigningError(message);
    }
  }
}

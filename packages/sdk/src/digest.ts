/**
 * EIP-712 digests for the gasless authorizations a payer signs instead of
 * transacting: EIP-3009 and EIP-2612 against a token's own domain, Permit2
 * against its singleton, and withdrawal requests against the Treasury.
 *
 * Ports `sdk-rust/src/digest.rs`. The payment and checkpoint payloads signed
 * under the ClearingHouse domain live in `@/guarantee`.
 */

import { concat, encodeAbiParameters, type Hex, keccak256, toHex } from "viem";
import { normalizeAddress, normalizeBytes32Hex } from "@/utils";

/** Permit2's canonical singleton, deployed at one address on every chain. */
export const PERMIT2_ADDRESS = "0x000000000022D473030F116dDEE9F6B43aC78BA3";

// The Treasury's EIP-712 domain, as the contract declares it in
// `EIP712("Core4Mica", "1")`; it kept the name through the rename.
export const CORE_EIP712_NAME = "Core4Mica";
export const CORE_EIP712_VERSION = "1";

// --- authorization digests (gasless routes) ------------------------------
//
// Canonical EIP-712 `encodeType` strings the tokens and contracts hash. If
// field order or types drift from these, the produced signature will not
// verify on-chain — so they are pinned as literals, exactly as in
// `sdk-rust/src/digest.rs`.

export const ERC3009_TYPE =
  "ReceiveWithAuthorization(address from,address to,uint256 value," +
  "uint256 validAfter,uint256 validBefore,bytes32 nonce)";
export const PERMIT2_TRANSFER_TYPE =
  "PermitTransferFrom(TokenPermissions permitted,address spender," +
  "uint256 nonce,uint256 deadline)TokenPermissions(address token,uint256 amount)";
export const TOKEN_PERMISSIONS_TYPE =
  "TokenPermissions(address token,uint256 amount)";
export const EIP2612_PERMIT_TYPE =
  "Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)";
export const REQUEST_WITHDRAWAL_TYPE =
  "RequestWithdrawal(address user,address asset,uint256 amount," +
  "uint256 validAfter,uint256 validBefore,bytes32 nonce)";
export const CANCEL_WITHDRAWAL_TYPE =
  "CancelWithdrawal(address user,address asset,uint256 validAfter," +
  "uint256 validBefore,bytes32 nonce)";

type Bytes32Like = string | Uint8Array;

function bytes32(value: Bytes32Like): Hex {
  if (typeof value === "string") {
    return normalizeBytes32Hex(value);
  }
  if (value.length !== 32) {
    throw new Error(`expected 32 bytes, got ${value.length}`);
  }
  return toHex(value);
}

/**
 * `keccak256(0x19 0x01 ‖ domainSeparator ‖ hashStruct(message))` from a raw
 * domain separator — read straight off the verifying contract, so the
 * signature always matches what it verifies.
 */
export function eip712Digest(
  domainSeparator: Bytes32Like,
  structHash: Bytes32Like,
): Hex {
  return keccak256(
    concat(["0x1901", bytes32(domainSeparator), bytes32(structHash)]),
  );
}

/**
 * An EIP-712 domain separator built from its parts — the reconstruction path
 * used when the separator cannot be read from the contract. `version` is
 * optional because not every domain has one (Permit2's does not).
 */
export function eip712DomainSeparator(
  name: string,
  version: string | undefined,
  chainId: number,
  verifyingContract: string,
): Hex {
  const typeHash = keccak256(
    toHex(
      version !== undefined
        ? "EIP712Domain(string name,string version,uint256 chainId," +
            "address verifyingContract)"
        : "EIP712Domain(string name,uint256 chainId,address verifyingContract)",
    ),
  );
  const parts: Hex[] = [typeHash, keccak256(toHex(name))];
  if (version !== undefined) {
    parts.push(keccak256(toHex(version)));
  }
  parts.push(
    encodeAbiParameters(
      [{ type: "uint256" }, { type: "address" }],
      [BigInt(chainId), normalizeAddress(verifyingContract) as Hex],
    ),
  );
  return keccak256(concat(parts));
}

/**
 * Permit2's domain separator: one canonical address on every chain, a fixed
 * name, and no version — the chain id is the only variable.
 */
export function permit2DomainSeparator(chainId: number): Hex {
  return eip712DomainSeparator("Permit2", undefined, chainId, PERMIT2_ADDRESS);
}

/** Core4Mica's own domain separator for the deployment at `contract`. */
export function coreDomainSeparator(chainId: number, contract: string): Hex {
  return eip712DomainSeparator(
    CORE_EIP712_NAME,
    CORE_EIP712_VERSION,
    chainId,
    contract,
  );
}

/**
 * Signing hash for an EIP-3009 `receiveWithAuthorization`.
 * `domainSeparator` is the token's own `DOMAIN_SEPARATOR()`.
 */
export function digestForReceiveAuthorization(
  domainSeparator: Bytes32Like,
  fromAddress: string,
  toAddress: string,
  value: bigint,
  validAfter: number,
  validBefore: number,
  nonce: Bytes32Like,
): Hex {
  const structHash = keccak256(
    encodeAbiParameters(
      [
        { type: "bytes32" },
        { type: "address" },
        { type: "address" },
        { type: "uint256" },
        { type: "uint256" },
        { type: "uint256" },
        { type: "bytes32" },
      ],
      [
        keccak256(toHex(ERC3009_TYPE)),
        normalizeAddress(fromAddress) as Hex,
        normalizeAddress(toAddress) as Hex,
        value,
        BigInt(validAfter),
        BigInt(validBefore),
        bytes32(nonce),
      ],
    ),
  );
  return eip712Digest(domainSeparator, structHash);
}

/**
 * Signing hash for a Permit2 `PermitTransferFrom`. `spender` is bound to the
 * contract that will call `permitTransferFrom`, so only that contract can
 * consume the signature.
 */
export function digestForPermit2Transfer(
  domainSeparator: Bytes32Like,
  token: string,
  amount: bigint,
  spender: string,
  nonce: bigint,
  deadline: number,
): Hex {
  const permittedHash = keccak256(
    encodeAbiParameters(
      [{ type: "bytes32" }, { type: "address" }, { type: "uint256" }],
      [
        keccak256(toHex(TOKEN_PERMISSIONS_TYPE)),
        normalizeAddress(token) as Hex,
        amount,
      ],
    ),
  );
  const structHash = keccak256(
    encodeAbiParameters(
      [
        { type: "bytes32" },
        { type: "bytes32" },
        { type: "address" },
        { type: "uint256" },
        { type: "uint256" },
      ],
      [
        keccak256(toHex(PERMIT2_TRANSFER_TYPE)),
        permittedHash,
        normalizeAddress(spender) as Hex,
        nonce,
        BigInt(deadline),
      ],
    ),
  );
  return eip712Digest(domainSeparator, structHash);
}

/**
 * Signing hash for an EIP-2612 `permit`. `nonce` must be the owner's current
 * one — a client without chain access gets it from the facilitator's
 * `PERMIT2_ALLOWANCE_REQUIRED` response rather than reading the token.
 */
export function digestForPermit(
  domainSeparator: Bytes32Like,
  owner: string,
  spender: string,
  value: bigint,
  nonce: bigint,
  deadline: number,
): Hex {
  const structHash = keccak256(
    encodeAbiParameters(
      [
        { type: "bytes32" },
        { type: "address" },
        { type: "address" },
        { type: "uint256" },
        { type: "uint256" },
        { type: "uint256" },
      ],
      [
        keccak256(toHex(EIP2612_PERMIT_TYPE)),
        normalizeAddress(owner) as Hex,
        normalizeAddress(spender) as Hex,
        value,
        nonce,
        BigInt(deadline),
      ],
    ),
  );
  return eip712Digest(domainSeparator, structHash);
}

/**
 * Signing hash for a sponsored `requestWithdrawalWithAuthorization`.
 * `domainSeparator` is Core4Mica's own `DOMAIN_SEPARATOR()`.
 */
export function digestForRequestWithdrawal(
  domainSeparator: Bytes32Like,
  user: string,
  asset: string,
  amount: bigint,
  validAfter: number,
  validBefore: number,
  nonce: Bytes32Like,
): Hex {
  const structHash = keccak256(
    encodeAbiParameters(
      [
        { type: "bytes32" },
        { type: "address" },
        { type: "address" },
        { type: "uint256" },
        { type: "uint256" },
        { type: "uint256" },
        { type: "bytes32" },
      ],
      [
        keccak256(toHex(REQUEST_WITHDRAWAL_TYPE)),
        normalizeAddress(user) as Hex,
        normalizeAddress(asset) as Hex,
        amount,
        BigInt(validAfter),
        BigInt(validBefore),
        bytes32(nonce),
      ],
    ),
  );
  return eip712Digest(domainSeparator, structHash);
}

/** Signing hash for a sponsored `cancelWithdrawalWithAuthorization`. */
export function digestForCancelWithdrawal(
  domainSeparator: Bytes32Like,
  user: string,
  asset: string,
  validAfter: number,
  validBefore: number,
  nonce: Bytes32Like,
): Hex {
  const structHash = keccak256(
    encodeAbiParameters(
      [
        { type: "bytes32" },
        { type: "address" },
        { type: "address" },
        { type: "uint256" },
        { type: "uint256" },
        { type: "bytes32" },
      ],
      [
        keccak256(toHex(CANCEL_WITHDRAWAL_TYPE)),
        normalizeAddress(user) as Hex,
        normalizeAddress(asset) as Hex,
        BigInt(validAfter),
        BigInt(validBefore),
        bytes32(nonce),
      ],
    ),
  );
  return eip712Digest(domainSeparator, structHash);
}

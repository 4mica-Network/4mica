import { readFileSync } from "node:fs";
import { hashMessage, hashTypedData } from "viem";
import { describe, expect, it } from "vitest";
import {
  eip191PayloadForClaims,
  encodeTypeString,
  guaranteeTypedData,
} from "@/digest";
import {
  CorePublicParameters,
  PaymentGuaranteeRequestClaims,
  ValidationRequirement,
} from "@/models";

interface DigestVectors {
  params: {
    chain_id: number;
    contract_address: string;
    eip712_name: string;
    eip712_version: string;
  };
  plain: VectorCase;
  validated: VectorCase;
}

interface VectorCase {
  claims: {
    amount: string;
    asset_address: string;
    recipient_address: string;
    req_id: string;
    timestamp: number;
    user_address: string;
    validation?: {
      deadline: number;
      params: string;
      subject: string;
      validator: string;
    };
  };
  eip191_digest: string;
  eip712_digest: string;
}

// Shared with the Rust and Python suites. Regenerate with
// `cargo run --example digest_vectors` in packages/sdk-rust.
const vectors: DigestVectors = JSON.parse(
  readFileSync(new URL("./fixtures/digest_vectors.json", import.meta.url), {
    encoding: "utf8",
  }),
);

function vectorParams(): CorePublicParameters {
  return new CorePublicParameters(
    new Uint8Array(48),
    vectors.params.contract_address,
    vectors.params.eip712_name,
    vectors.params.eip712_version,
    vectors.params.chain_id,
  );
}

function vectorClaims(entry: VectorCase): PaymentGuaranteeRequestClaims {
  const claims = new PaymentGuaranteeRequestClaims({
    userAddress: entry.claims.user_address,
    recipientAddress: entry.claims.recipient_address,
    reqId: entry.claims.req_id,
    amount: entry.claims.amount,
    assetAddress: entry.claims.asset_address,
    timestamp: entry.claims.timestamp,
  });
  const validation = entry.claims.validation;
  if (validation === undefined) {
    return claims;
  }
  return claims.withValidation(
    new ValidationRequirement({
      validator: validation.validator,
      subject: validation.subject,
      deadline: validation.deadline,
      params: validation.params,
    }),
  );
}

describe("digest vectors", () => {
  it("reproduces the plain EIP-712 digest", () => {
    const typed = guaranteeTypedData(
      vectorParams(),
      vectorClaims(vectors.plain),
    );
    expect(hashTypedData(typed)).toBe(vectors.plain.eip712_digest);
  });

  it("reproduces the validated EIP-712 digest", () => {
    const typed = guaranteeTypedData(
      vectorParams(),
      vectorClaims(vectors.validated),
    );
    expect(hashTypedData(typed)).toBe(vectors.validated.eip712_digest);
  });

  it("reproduces the plain EIP-191 digest", () => {
    const payload = eip191PayloadForClaims(vectorClaims(vectors.plain));
    expect(hashMessage({ raw: payload })).toBe(vectors.plain.eip191_digest);
  });

  it("reproduces the validated EIP-191 digest", () => {
    const payload = eip191PayloadForClaims(vectorClaims(vectors.validated));
    expect(hashMessage({ raw: payload })).toBe(vectors.validated.eip191_digest);
  });
});

describe("encodeTypeString", () => {
  // These strings are keccak'd into the EIP-712 type hashes; they must match
  // crates/rpc/src/guarantee/signing.rs character for character.
  it("pins the plain claims type", () => {
    expect(encodeTypeString("SolGuaranteeRequestClaimsV1")).toBe(
      "SolGuaranteeRequestClaimsV1(address user,address recipient," +
        "uint256 reqId,uint256 amount,address asset,uint64 timestamp)",
    );
  });

  it("pins the validated claims type", () => {
    expect(encodeTypeString("SolValidatedGuaranteeRequestClaimsV1")).toBe(
      "SolValidatedGuaranteeRequestClaimsV1(address user,address recipient," +
        "uint256 reqId,uint256 amount,address asset,uint64 timestamp," +
        "SolValidation validation)" +
        "SolValidation(string validator,bytes32 subject,uint64 deadline," +
        "bytes params)",
    );
  });
});

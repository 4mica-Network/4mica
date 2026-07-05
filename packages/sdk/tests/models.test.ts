import { getAddress } from "viem";
import { describe, expect, it } from "vitest";
import {
  AdminApiKeyInfo,
  AdminApiKeySecret,
  AssetBalanceInfo,
  ClearingParticipantProof,
  ClearingSettlementActionResponse,
  CorePublicParameters,
  PaymentGuaranteeRequestClaimsV2,
  RecipientPaymentInfo,
  SupportedTokensResponse,
  UserSuspensionStatus,
} from "../src/models";

describe("models fromRpc", () => {
  it("parses clearing participant proof with snake_case fields", () => {
    const proof = ClearingParticipantProof.fromRpc({
      cycle_id: "0x" + "aa".repeat(32),
      cycle_id_text: "cycle-1",
      asset_address: "0x0000000000000000000000000000000000000000",
      participant: "0x0000000000000000000000000000000000000001",
      role: "NET_CREDITOR",
      amount: "0x10",
      net_debit: "0",
      net_credit: "0x10",
      leaf: "0x" + "bb".repeat(32),
      merkle_root: "0x" + "cc".repeat(32),
      proof: ["0x" + "dd".repeat(32)],
    });
    expect(proof.cycleId).toBe("0x" + "aa".repeat(32));
    expect(proof.role).toBe("NET_CREDITOR");
    expect(proof.amount).toBe(16n);
    expect(proof.netCredit).toBe(16n);
    expect(proof.proof).toEqual(["0x" + "dd".repeat(32)]);
  });

  it("parses clearing settlement action with snake_case fields", () => {
    const action = ClearingSettlementActionResponse.fromRpc({
      contract_address: "0x0000000000000000000000000000000000000009",
      function_name: "claimNetCredit",
      action: "claim_net_credit",
      cycle_id: "0x" + "aa".repeat(32),
      cycle_id_text: "cycle-1",
      asset_address: "0x0000000000000000000000000000000000000000",
      participant: "0x0000000000000000000000000000000000000001",
      debtor: null,
      amount: "0x10",
      payable_value: "0",
      proof: ["0x" + "dd".repeat(32)],
    });
    expect(action.contractAddress).toBe(
      "0x0000000000000000000000000000000000000009",
    );
    expect(action.functionName).toBe("claimNetCredit");
    expect(action.action).toBe("claim_net_credit");
    expect(action.amount).toBe(16n);
    expect(action.payableValue).toBe(0n);
    expect(action.debtor).toBeNull();
  });

  it("parses asset balance", () => {
    const balance = AssetBalanceInfo.fromRpc({
      user_address: "0x0000000000000000000000000000000000000001",
      asset_address: "0x0000000000000000000000000000000000000000",
      total: "10",
      locked: "2",
      version: 1,
      updated_at: 123,
    });
    expect(balance.total).toBe(10n);
    expect(balance.locked).toBe(2n);
  });

  it("parses recipient payment info", () => {
    const info = RecipientPaymentInfo.fromRpc({
      user_address: "0x0000000000000000000000000000000000000001",
      recipient_address: "0x0000000000000000000000000000000000000002",
      tx_hash: "0xdeadbeef",
      amount: "1",
      verified: true,
      finalized: false,
      failed: false,
      created_at: 10,
    });
    expect(info.amount).toBe(1n);
    expect(info.verified).toBe(true);
  });

  it("parses admin api key models", () => {
    const info = AdminApiKeyInfo.fromRpc({
      id: "1",
      name: "key",
      scopes: ["read"],
      created_at: 123,
    });
    expect(info.id).toBe("1");

    const secret = AdminApiKeySecret.fromRpc({
      id: "1",
      name: "key",
      scopes: ["read"],
      created_at: 123,
      api_key: "secret",
    });
    expect(secret.apiKey).toBe("secret");
  });

  it("parses user suspension status", () => {
    const status = UserSuspensionStatus.fromRpc({
      user_address: "0x0000000000000000000000000000000000000001",
      suspended: true,
      updated_at: 123,
    });
    expect(status.suspended).toBe(true);
  });
});

const V2_BASE = {
  userAddress: "0x0000000000000000000000000000000000000001",
  recipientAddress: "0x0000000000000000000000000000000000000002",
  reqId: 0n,
  amount: 1n,
  timestamp: 1,
  assetAddress: "0x0000000000000000000000000000000000000000",
  validationRegistryAddress: "0x0000000000000000000000000000000000000011",
  validationRequestHash: "0x" + "00".repeat(32),
  validationChainId: 1,
  validatorAddress: "0x0000000000000000000000000000000000000022",
  validatorAgentId: 1n,
  validationSubjectHash: "0x" + "00".repeat(32),
  jobHash: "0x" + "11".repeat(32),
  requiredValidationTag: "",
};

describe("PaymentGuaranteeRequestClaimsV2 boundaries", () => {
  it("accepts minValidationScore=1 (lower boundary)", () => {
    expect(
      () =>
        new PaymentGuaranteeRequestClaimsV2({
          ...V2_BASE,
          minValidationScore: 1,
        }),
    ).not.toThrow();
  });

  it("accepts minValidationScore=100 (upper boundary)", () => {
    expect(
      () =>
        new PaymentGuaranteeRequestClaimsV2({
          ...V2_BASE,
          minValidationScore: 100,
        }),
    ).not.toThrow();
  });

  it("normalizes V2 validation fields", () => {
    const claims = new PaymentGuaranteeRequestClaimsV2({
      ...V2_BASE,
      minValidationScore: 80,
      validationRegistryAddress: "0x00000000000000000000000000000000000000AA",
      validationRequestHash: "AB".repeat(32),
      validatorAddress: "0x00000000000000000000000000000000000000BB",
      validationSubjectHash: "CD".repeat(32),
      jobHash: "EF".repeat(32),
    });

    expect(claims.validationRegistryAddress).toBe(
      getAddress("0x00000000000000000000000000000000000000AA"),
    );
    expect(claims.validatorAddress).toBe(
      getAddress("0x00000000000000000000000000000000000000BB"),
    );
    expect(claims.validationRequestHash).toBe(`0x${"ab".repeat(32)}`);
    expect(claims.validationSubjectHash).toBe(`0x${"cd".repeat(32)}`);
    expect(claims.jobHash).toBe(`0x${"ef".repeat(32)}`);
  });
});

describe("CorePublicParameters.fromRpc", () => {
  it("applies defaults for missing eip712Name and eip712Version", () => {
    const params = CorePublicParameters.fromRpc({
      contract_address: "0x0000000000000000000000000000000000000000",
      ethereum_http_rpc_url: "https://rpc.example.com",
      chain_id: 1,
    });
    expect(params.eip712Name).toBe("4Mica");
    expect(params.eip712Version).toBe("1");
  });

  it("handles Array publicKey input", () => {
    const params = CorePublicParameters.fromRpc({
      public_key: [1, 2, 3],
      contract_address: "0x0000000000000000000000000000000000000000",
      ethereum_http_rpc_url: "https://rpc.example.com",
      chain_id: 1,
    });
    expect(params.publicKey).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("falls back to empty Uint8Array for missing publicKey", () => {
    const params = CorePublicParameters.fromRpc({
      contract_address: "0x0000000000000000000000000000000000000000",
      ethereum_http_rpc_url: "https://rpc.example.com",
      chain_id: 1,
    });
    expect(params.publicKey).toEqual(new Uint8Array());
  });

  it("parses current core public-params fields exposed by rpc", () => {
    const params = CorePublicParameters.fromRpc({
      public_key: [1, 2, 3],
      contract_address: "0x0000000000000000000000000000000000000000",
      ethereum_http_rpc_url: "https://rpc.example.com",
      eip712_name: "4mica",
      eip712_version: "1",
      chain_id: 84532,
      max_accepted_guarantee_version: 2,
      accepted_guarantee_versions: [1, 2],
      active_guarantee_domain_separator: "0x" + "11".repeat(32),
      trusted_validation_registries: [
        "0x0000000000000000000000000000000000000011",
      ],
      validation_hash_canonicalization_version: "4MICA_VALIDATION_REQUEST_V1",
    });

    expect(params.maxAcceptedGuaranteeVersion).toBe(2);
    expect(params.acceptedGuaranteeVersions).toEqual([1, 2]);
    expect(params.activeGuaranteeDomainSeparator).toBe("0x" + "11".repeat(32));
    expect(params.trustedValidationRegistries).toEqual([
      "0x0000000000000000000000000000000000000011",
    ]);
    expect(params.validationHashCanonicalizationVersion).toBe(
      "4MICA_VALIDATION_REQUEST_V1",
    );
  });
});

describe("SupportedTokensResponse.fromRpc", () => {
  it("parses supported tokens payload", () => {
    const response = SupportedTokensResponse.fromRpc({
      chain_id: 84532,
      tokens: [
        {
          symbol: "USDC",
          address: "0x0000000000000000000000000000000000000001",
          decimals: 6,
        },
      ],
    });
    expect(response.chainId).toBe(84532);
    expect(response.tokens).toEqual([
      {
        symbol: "USDC",
        address: "0x0000000000000000000000000000000000000001",
        decimals: 6,
      },
    ]);
  });
});

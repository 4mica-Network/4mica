import { getAddress } from "viem";
import { describe, expect, it } from "vitest";
import {
  AdminApiKeyInfo,
  AdminApiKeySecret,
  AssetBalanceInfo,
  CollateralEventInfo,
  CorePublicParameters,
  GuaranteeInfo,
  PaymentGuaranteeRequestClaimsV2,
  PendingRemunerationInfo,
  RecipientPaymentInfo,
  SupportedTokensResponse,
  TabInfo,
  UserSuspensionStatus,
} from "../src/models";

describe("models fromRpc", () => {
  it("parses tab info with snake_case fields", () => {
    const tab = TabInfo.fromRpc({
      tab_id: "0x10",
      user_address: "0x0000000000000000000000000000000000000001",
      recipient_address: "0x0000000000000000000000000000000000000002",
      asset_address: "0x0000000000000000000000000000000000000000",
      start_timestamp: 100,
      ttl_seconds: 60,
      status: "OPEN",
      settlement_status: "PENDING",
      created_at: 10,
      updated_at: 20,
    });
    expect(tab.tabId).toBe(16n);
    expect(tab.userAddress).toBe("0x0000000000000000000000000000000000000001");
  });

  it("parses guarantee info with mixed fields", () => {
    const guarantee = GuaranteeInfo.fromRpc({
      tabId: "0x1",
      req_id: "0x2",
      from_address: "0x0000000000000000000000000000000000000001",
      toAddress: "0x0000000000000000000000000000000000000002",
      asset_address: "0x0000000000000000000000000000000000000000",
      amount: "0x10",
      timestamp: 123,
    });
    expect(guarantee.tabId).toBe(1n);
    expect(guarantee.reqId).toBe(2n);
    expect(guarantee.amount).toBe(16n);
  });

  it("parses collateral event with optional ids", () => {
    const ev = CollateralEventInfo.fromRpc({
      id: "1",
      user_address: "0x0000000000000000000000000000000000000001",
      asset_address: "0x0000000000000000000000000000000000000000",
      amount: "0x2",
      event_type: "DEPOSIT",
      created_at: 123,
    });
    expect(ev.amount).toBe(2n);
    expect(ev.tabId).toBe(null);
    expect(ev.reqId).toBe(null);
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

  it("parses pending remuneration info", () => {
    const pending = PendingRemunerationInfo.fromRpc({
      tab: {
        tab_id: "0x1",
        user_address: "0x0000000000000000000000000000000000000001",
        recipient_address: "0x0000000000000000000000000000000000000002",
        asset_address: "0x0000000000000000000000000000000000000000",
        start_timestamp: 100,
        ttl_seconds: 60,
        status: "OPEN",
        settlement_status: "PENDING",
        created_at: 10,
        updated_at: 20,
      },
      latest_guarantee: {
        tab_id: "0x1",
        req_id: "0x0",
        from_address: "0x0000000000000000000000000000000000000001",
        to_address: "0x0000000000000000000000000000000000000002",
        asset_address: "0x0000000000000000000000000000000000000000",
        amount: "0x5",
        timestamp: 1,
      },
    });
    expect(pending.tab.tabId).toBe(1n);
    expect(pending.latestGuarantee?.amount).toBe(5n);
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

  it("parses collateral event with tabId and reqId present", () => {
    const ev = CollateralEventInfo.fromRpc({
      id: "5",
      user_address: "0x0000000000000000000000000000000000000001",
      asset_address: "0x0000000000000000000000000000000000000000",
      amount: "0x10",
      event_type: "WITHDRAWAL",
      tab_id: "0x3",
      req_id: "0x7",
      created_at: 999,
    });
    expect(ev.tabId).toBe(3n);
    expect(ev.reqId).toBe(7n);
    expect(ev.amount).toBe(16n);
  });

  it("parses pending remuneration with null latest_guarantee", () => {
    const pending = PendingRemunerationInfo.fromRpc({
      tab: {
        tab_id: "0x2",
        user_address: "0x0000000000000000000000000000000000000001",
        recipient_address: "0x0000000000000000000000000000000000000002",
        asset_address: "0x0000000000000000000000000000000000000000",
        start_timestamp: 100,
        ttl_seconds: 60,
        status: "OPEN",
        settlement_status: "PENDING",
        created_at: 10,
        updated_at: 20,
      },
      latest_guarantee: null,
    });
    expect(pending.tab.tabId).toBe(2n);
    expect(pending.latestGuarantee).toBeNull();
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
  tabId: 1n,
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

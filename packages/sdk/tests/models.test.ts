import { describe, expect, it } from "vitest";
import { InvalidParamsError } from "@/errors";
import {
  AssetBalanceInfo,
  BLSCert,
  ClearingParticipantProof,
  ClearingSettlementActionResponse,
  CorePublicParameters,
  PaymentGuaranteeRequestClaims,
  SupportedTokensResponse,
  ValidationRequirement,
} from "@/models";
import { ValidationError } from "@/utils";

const USER = "0x0000000000000000000000000000000000000011";
const RECIPIENT = "0x0000000000000000000000000000000000000022";
const ASSET = "0x0000000000000000000000000000000000000003";

describe("PaymentGuaranteeRequestClaims", () => {
  it("serializes to the tagged v1 wire shape", () => {
    const claims = PaymentGuaranteeRequestClaims.new(
      USER,
      RECIPIENT,
      7,
      5,
      1234,
      ASSET,
    );
    expect(claims.toPayload()).toEqual({
      version: "v1",
      user_address: USER,
      recipient_address: RECIPIENT,
      req_id: "0x7",
      amount: "0x5",
      asset_address: ASSET,
      timestamp: 1234,
    });
    expect(claims.version).toBe(1);
  });

  it("defaults the asset to the zero address", () => {
    const claims = PaymentGuaranteeRequestClaims.new(
      USER,
      RECIPIENT,
      1,
      1,
      1,
      null,
    );
    expect(claims.assetAddress).toBe(
      "0x0000000000000000000000000000000000000000",
    );
  });

  it("carries an optional validation requirement", () => {
    const claims = PaymentGuaranteeRequestClaims.new(
      USER,
      RECIPIENT,
      7,
      5,
      1234,
      ASSET,
    ).withValidation(
      new ValidationRequirement({
        validator: "validator-id",
        subject: `0x${"AB".repeat(32)}`,
        deadline: 99,
        params: "0xDEADbeef",
      }),
    );
    expect(claims.toPayload().validation).toEqual({
      validator: "validator-id",
      subject: `0x${"ab".repeat(32)}`,
      deadline: 99,
      params: "0xdeadbeef",
    });
  });

  it("omits empty validation params and deadline from the payload", () => {
    const validation = new ValidationRequirement({
      validator: "validator-id",
      subject: `0x${"ab".repeat(32)}`,
    });
    expect(validation.toPayload()).toEqual({
      validator: "validator-id",
      subject: `0x${"ab".repeat(32)}`,
    });
  });

  it("rejects a non-bytes32 validation subject", () => {
    expect(
      () => new ValidationRequirement({ validator: "v", subject: "0x1234" }),
    ).toThrow(ValidationError);
  });

  it("rejects negative amounts", () => {
    expect(() =>
      PaymentGuaranteeRequestClaims.new(USER, RECIPIENT, 1, -5, 1, null),
    ).toThrow(ValidationError);
  });
});

describe("CorePublicParameters", () => {
  const raw = () => ({
    public_key: `0x${"00".repeat(48)}`,
    contract_address: "0x1234567890abcdef1234567890abcdef12345678",
    eip712_name: "4mica",
    eip712_version: "1",
    chain_id: 84532,
    ethereum_http_rpc_url: "http://localhost:8545",
    supported_guarantee_versions: [1],
    guarantee_domain_separator: `0x${"11".repeat(32)}`,
    guarantee_domains: [
      { version: 1, domain_separator: `0x${"11".repeat(32)}` },
    ],
    core_domain_separator: `0x${"22".repeat(32)}`,
    validators: ["validator-a"],
  });

  it("parses the published wire shape", () => {
    const params = CorePublicParameters.fromRpc(raw());
    expect(params.publicKey.length).toBe(48);
    expect(params.chainId).toBe(84532);
    expect(params.supportedGuaranteeVersions).toEqual([1]);
    expect(params.guaranteeDomains).toEqual([
      { version: 1, domainSeparator: `0x${"11".repeat(32)}` },
    ]);
    expect(params.guaranteeDomainSeparator).toBe(`0x${"11".repeat(32)}`);
    expect(params.coreDomainSeparator).toBe(`0x${"22".repeat(32)}`);
    expect(params.validators).toEqual(["validator-a"]);
  });

  it("defaults supported versions when core publishes none", () => {
    const { supported_guarantee_versions: _omit, ...rest } = raw();
    const params = CorePublicParameters.fromRpc(rest);
    expect(params.supportedGuaranteeVersions).toEqual([1]);
  });

  it("requires the core parameters", () => {
    const { contract_address: _omit, ...rest } = raw();
    expect(() => CorePublicParameters.fromRpc(rest)).toThrow(
      InvalidParamsError,
    );
  });
});

describe("clearing models", () => {
  it("parses a participant proof from snake_case", () => {
    const proof = ClearingParticipantProof.fromRpc({
      cycle_id: `0x${"aa".repeat(32)}`,
      cycle_id_text: `${ASSET}:1777248000`,
      asset_address: ASSET,
      participant: USER,
      role: "NET_DEBTOR",
      amount: "100",
      net_debit: "100",
      net_credit: "0",
      leaf: `0x${"bb".repeat(32)}`,
      merkle_root: `0x${"cc".repeat(32)}`,
      proof: [`0x${"dd".repeat(32)}`],
    });
    expect(proof.role).toBe("NET_DEBTOR");
    expect(proof.amount).toBe(100n);
    expect(proof.cycleIdText).toBe(`${ASSET}:1777248000`);
    expect(proof.proof).toEqual([`0x${"dd".repeat(32)}`]);
  });

  it("parses a settlement action and its payable value", () => {
    const action = ClearingSettlementActionResponse.fromRpc({
      contract_address: "0x0000000000000000000000000000000000000009",
      function_name: "payNetDebit",
      action: "pay_net_debit",
      cycle_id: `0x${"aa".repeat(32)}`,
      cycle_id_text: "c",
      asset_address: ASSET,
      participant: USER,
      amount: "100",
      payable_value: "100",
      proof: [],
    });
    expect(action.functionName).toBe("payNetDebit");
    expect(action.payableValue).toBe(100n);
  });

  it("refuses a malformed clearing action", () => {
    expect(() =>
      ClearingSettlementActionResponse.fromRpc({ action: "pay_net_debit" }),
    ).toThrow(InvalidParamsError);
  });
});

describe("token and balance models", () => {
  it("relays token domain separators", () => {
    const tokens = SupportedTokensResponse.fromRpc({
      chain_id: 84532,
      tokens: [
        {
          symbol: "USDC",
          address: ASSET,
          decimals: 6,
          domain_separator: `0x${"11".repeat(32)}`,
        },
        { symbol: "RAW", address: RECIPIENT },
      ],
    });
    expect(tokens.tokens[0]?.domainSeparator).toBe(`0x${"11".repeat(32)}`);
    expect(tokens.tokens[1]?.domainSeparator).toBeUndefined();
  });

  it("parses asset balances", () => {
    const balance = AssetBalanceInfo.fromRpc({
      user_address: USER,
      asset_address: ASSET,
      total: "0x64",
      locked: "0x1",
      version: 3,
      updated_at: 1700000000,
    });
    expect(balance.total).toBe(100n);
    expect(balance.locked).toBe(1n);
  });

  it("requires certificate fields on BLSCert", () => {
    expect(() => BLSCert.fromRpc({ claims: "0x01" })).toThrow(
      InvalidParamsError,
    );
    const cert = BLSCert.fromRpc({ claims: "0x0102", signature: "0x03" });
    expect(Array.from(cert.claimsBytes())).toEqual([1, 2]);
  });
});

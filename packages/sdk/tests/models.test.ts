import { describe, expect, it } from "vitest";
import { InvalidParamsError } from "@/errors";
import { GuaranteeReceipt } from "@/guarantee";
import {
  ActiveCycleResponse,
  AssetBalanceInfo,
  CheckpointBatchResponse,
  ClearingParticipantProof,
  ClearingSettlementActionResponse,
  CorePublicParameters,
  PaymentRequestPayload,
  parseCheckpointRequiredDetails,
  parseCycleMismatchDetails,
  parseTimestampNotPastCutoffDetails,
  SupportedTokensResponse,
  ValidationRequirement,
} from "@/models";
import { ValidationError } from "@/utils";

const USER = "0x0000000000000000000000000000000000000011";
const RECIPIENT = "0x0000000000000000000000000000000000000022";
const ASSET = "0x0000000000000000000000000000000000000003";

const PAYLOAD_JSON = {
  version: "v1",
  user_address: "0x1234567890123456789012345678901234567890",
  recipient_address: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
  cycle_id: `0x${"55".repeat(32)}`,
  req_id: "2",
  amount: "3",
  asset_address: "0x0000000000000000000000000000000000000000",
  timestamp: 100,
  salt: `0x${"99".repeat(32)}`,
};

describe("PaymentRequestPayload", () => {
  it("parses decimal or hex amounts", () => {
    const decoded = PaymentRequestPayload.fromRpc(PAYLOAD_JSON);
    expect(decoded.version).toBe(1);
    expect(decoded.reqId).toBe(2n);
    expect(decoded.amount).toBe(3n);
    expect(decoded.validation).toBeUndefined();
    expect(
      PaymentRequestPayload.fromRpc({ ...PAYLOAD_JSON, amount: "0x3" }).amount,
    ).toBe(3n);
  });

  it("serializes to the tagged v1 wire shape in hex", () => {
    const payload = PaymentRequestPayload.fromRpc(PAYLOAD_JSON).toPayload();
    expect(payload).toEqual({
      ...PAYLOAD_JSON,
      req_id: "0x2",
      amount: "0x3",
    });
  });

  it("keeps addresses as spelled", () => {
    // What travels is what the payer signed over, and a resource server may
    // compare the recipient as a string.
    expect(
      PaymentRequestPayload.fromRpc(PAYLOAD_JSON).toPayload().recipient_address,
    ).toBe(PAYLOAD_JSON.recipient_address);
  });

  it("refuses a payload without a version tag", () => {
    // The tag is what selects a layout, so a payload without one is
    // unroutable rather than defaulted.
    const { version: _omit, ...rest } = PAYLOAD_JSON;
    expect(() => PaymentRequestPayload.fromRpc(rest)).toThrow(/version tag/);
  });

  it("refuses an unknown version", () => {
    expect(() =>
      PaymentRequestPayload.fromRpc({ ...PAYLOAD_JSON, version: "v9" }),
    ).toThrow(/unsupported payment payload/);
  });

  it.each(["cycle_id", "salt"])("requires %s", (field) => {
    // Both are part of what the payer signs, so a payload without them
    // cannot be verified and must not parse into something that looks whole.
    const raw: Record<string, unknown> = { ...PAYLOAD_JSON };
    delete raw[field];
    expect(() => PaymentRequestPayload.fromRpc(raw)).toThrow(field);
  });

  it.each([
    ["user_address", "nope"],
    ["cycle_id", "0x1234"],
    ["timestamp", (2n ** 64n).toString()],
    ["amount", "-1"],
  ])("refuses a malformed %s", (field, value) => {
    expect(() =>
      PaymentRequestPayload.fromRpc({ ...PAYLOAD_JSON, [field]: value }),
    ).toThrow(InvalidParamsError);
  });

  it("nests a validation requirement and round-trips it", () => {
    const validation = new ValidationRequirement({
      validator: "eip155:84532:0x1111111111111111111111111111111111111111",
      subject: `0x${"11".repeat(32)}`,
      deadline: 1_736_003_600,
      params: "0x010203",
    });
    const payload =
      PaymentRequestPayload.fromRpc(PAYLOAD_JSON).withValidation(validation);
    const wire = payload.toPayload();
    expect(wire.validation).toBeDefined();
    expect(wire).not.toHaveProperty("validator");
    expect(PaymentRequestPayload.fromRpc(wire)).toEqual(payload);
  });

  it("draws a fresh salt per payload", () => {
    const build = () =>
      PaymentRequestPayload.new({
        userAddress: USER,
        recipientAddress: RECIPIENT,
        cycleId: `0x${"55".repeat(32)}`,
        reqId: 1n,
        amount: 1n,
        timestamp: 1,
      });
    expect(build().salt).not.toBe(build().salt);
  });

  it("defaults the asset to the zero address", () => {
    const payload = PaymentRequestPayload.new({
      userAddress: USER,
      recipientAddress: RECIPIENT,
      cycleId: `0x${"55".repeat(32)}`,
      reqId: 1n,
      amount: 1n,
      timestamp: 1,
    });
    expect(payload.assetAddress).toBe(
      "0x0000000000000000000000000000000000000000",
    );
    expect(
      PaymentRequestPayload.new({
        userAddress: USER,
        recipientAddress: RECIPIENT,
        cycleId: `0x${"55".repeat(32)}`,
        reqId: 1n,
        amount: 1n,
        timestamp: 1,
        erc20Token: ASSET,
      }).assetAddress,
    ).toBe(ASSET);
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
});

describe("CorePublicParameters", () => {
  const raw = () => ({
    guarantee_signer: "0x0000000000000000000000000000000000005164",
    contract_address: "0x1234567890abcdef1234567890abcdef12345678",
    guarantee_registry_address: "0x0000000000000000000000000000000000065e61",
    clearing_house_address: "0x00000000000000000000000000000000c1ea4111",
    eip712_name: "4micaClearingHouse",
    eip712_version: "1",
    chain_id: 84532,
    ethereum_http_rpc_url: "http://localhost:8545",
    supported_payment_payload_versions: [1],
    core_domain_separator: `0x${"22".repeat(32)}`,
    validators: ["validator-a"],
  });

  it("parses the published wire shape", () => {
    const params = CorePublicParameters.fromRpc(raw());
    expect(params.chainId).toBe(84532);
    expect(params.guaranteeSigner).toBe(
      "0x0000000000000000000000000000000000005164",
    );
    expect(params.clearingHouseAddress).toBe(
      "0x00000000000000000000000000000000c1ea4111",
    );
    expect(params.guaranteeRegistryAddress).toBe(
      "0x0000000000000000000000000000000000065e61",
    );
    expect(params.supportedPaymentPayloadVersions).toEqual([1]);
    expect(params.coreDomainSeparator).toBe(`0x${"22".repeat(32)}`);
    expect(params.validators).toEqual(["validator-a"]);
  });

  it("defaults what an older core omits", () => {
    const {
      supported_payment_payload_versions: _versions,
      guarantee_signer: _signer,
      ...rest
    } = raw();
    const params = CorePublicParameters.fromRpc(rest);
    expect(params.supportedPaymentPayloadVersions).toEqual([1]);
    expect(params.guaranteeSigner).toBe("");
  });

  it("keeps an explicit empty version list", () => {
    // Empty means a core that accepts nothing, not a default.
    const params = CorePublicParameters.fromRpc({
      ...raw(),
      supported_payment_payload_versions: [],
    });
    expect(params.supportedPaymentPayloadVersions).toEqual([]);
  });

  it("requires the core parameters", () => {
    const { contract_address: _omit, ...rest } = raw();
    expect(() => CorePublicParameters.fromRpc(rest)).toThrow(
      InvalidParamsError,
    );
  });
});

describe("cycle and checkpoint responses", () => {
  it("tolerates an active cycle from a core that predates the clock", () => {
    const cycle = ActiveCycleResponse.fromRpc({
      cycle_id: `0x${"AB".repeat(32)}`,
      cycle_id_text: "0x0:1700000000",
      asset_address: "0x0000000000000000000000000000000000000000",
      period_start: 1_700_000_000,
      period_end: 1_700_086_400,
    });
    expect(cycle.cycleId).toBe(`0x${"ab".repeat(32)}`);
    expect(cycle.serverTime).toBe(0);
    expect(cycle.maxUncheckpointed).toBe(0);
  });

  it("parses a checkpoint batch with its previous checkpoint", () => {
    const batch = CheckpointBatchResponse.fromRpc({
      cycle_id: `0x${"55".repeat(32)}`,
      cycle_id_text: "0x0:1700000000",
      asset_address: "0x0000000000000000000000000000000000000000",
      payer: PAYLOAD_JSON.user_address,
      previous: {
        payload: {
          payer: PAYLOAD_JSON.user_address,
          cycle_id: `0x${"55".repeat(32)}`,
          asset_address: "0x0000000000000000000000000000000000000000",
          cumulative_gross: "0x78",
          timestamp_cutoff: 99,
        },
        signature: "0xaa",
      },
      authorizations: [{ payload: PAYLOAD_JSON, signature: "0xbb" }],
      max_uncheckpointed: 64,
    });
    expect(batch.previous?.payload.cumulativeGross).toBe(120n);
    expect(batch.authorizations[0].payload.reqId).toBe(2n);
    expect(batch.authorizations[0].signature).toBe("0xbb");
    expect(batch.maxUncheckpointed).toBe(64);
  });

  it("parses refusal details into camelCase", () => {
    const details = parseTimestampNotPastCutoffDetails({
      cycle_id: `0x${"11".repeat(32)}`,
      cycle_id_text: "0x0:1700000000",
      asset_address: "0x0000000000000000000000000000000000000000",
      payer: "0x00000000000000000000000000000000000000be",
      timestamp: 1_700_000_000,
      timestamp_cutoff: 1_700_000_000,
      cumulative_gross: "500",
      server_time: 1_700_000_001,
    });
    expect(details?.cumulativeGross).toBe(500n);
    expect(details?.timestampCutoff).toBe(1_700_000_000);
  });

  it("defaults what an older core omits from refusal details", () => {
    expect(
      parseCycleMismatchDetails({
        signed_cycle_id: "0x11",
        active_cycle_id: "0x22",
        active_cycle_id_text: "t",
        active_period_end: 5,
      })?.serverTime,
    ).toBe(0);
  });

  it.each([
    undefined,
    "nope",
    {},
    { uncheckpointed: "lots" },
  ])("reads unreadable refusal details %s as undefined", (raw) => {
    expect(parseCheckpointRequiredDetails(raw)).toBeUndefined();
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

  it("requires both fields on a guarantee receipt", () => {
    expect(() => GuaranteeReceipt.fromRpc({ receipt: "0x01" })).toThrow(
      InvalidParamsError,
    );
    const receipt = GuaranteeReceipt.fromRpc({
      receipt: "0x0102",
      signature: "0x03",
    });
    expect(receipt.toPayload()).toEqual({
      receipt: "0x0102",
      signature: "0x03",
    });
  });
});

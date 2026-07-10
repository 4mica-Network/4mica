import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it, vi } from "vitest";
import type { Client } from "@/client";
import { RecipientClient } from "@/client/recipient";
import { UserClient } from "@/client/user";
import type { ContractGateway } from "@/contract";
import { VerificationError } from "@/errors";
import { encodeGuaranteeClaims } from "@/guarantee";
import {
  CorePublicParameters,
  PaymentGuaranteeRequestClaims,
  PaymentGuaranteeRequestClaimsV2,
  SigningScheme,
} from "@/models";
import { buildPaymentPayload } from "@/payment";
import type { RpcProxy } from "@/rpc";
import {
  computeValidationRequestHash,
  computeValidationSubjectHash,
} from "@/validation";

const USER = "0x0000000000000000000000000000000000000011";
const RECIPIENT = "0x0000000000000000000000000000000000000022";
const ASSET = "0x0000000000000000000000000000000000000003";
const CLEARING_HOUSE = "0x0000000000000000000000000000000000000009";
const CYCLE_ID = `0x${"aa".repeat(32)}`;
const PROOF = [`0x${"dd".repeat(32)}`];

const buildClientStub = (overrides: Partial<Client> = {}): Client => {
  const signer = privateKeyToAccount(
    "0x59c6995e998f97a5a0044976f7be35d5ad91c0cfa55b5cfb20b07a1c60f4c5bc",
  );
  const params = new CorePublicParameters(
    new Uint8Array(),
    "0x0000000000000000000000000000000000000000",
    "https://example.com",
    "4Mica",
    "1",
    1,
  );
  return {
    rpc: {} as RpcProxy,
    gateway: {} as ContractGateway,
    signer: { signer } as unknown as Client["signer"],
    params,
    guaranteeDomain: `0x${"00".repeat(32)}`,
    user: {} as Client["user"],
    recipient: {} as Client["recipient"],
    aclose: async () => {},
    login: async () => ({
      accessToken: "token",
      refreshToken: "rt",
      expiresIn: 60,
    }),
    ...overrides,
  } as Client;
};

describe("credit-flow coverage", () => {
  it("builds payment payload with serialized claims", () => {
    const claims = PaymentGuaranteeRequestClaims.new(
      USER,
      RECIPIENT,
      5,
      1234,
      ASSET,
      7,
    );
    const payload = buildPaymentPayload(claims, {
      signature: "0xdeadbeef",
      scheme: SigningScheme.EIP712,
    });

    expect(payload.claims.version).toBe("v1");
    expect(payload.claims.user_address).toBe(USER);
    expect(payload.claims.recipient_address).toBe(RECIPIENT);
    expect(payload.claims.req_id).toBe("0x7");
    expect(payload.claims.amount).toBe("0x5");
    expect(payload.claims.asset_address).toBe(ASSET);
    expect(payload.claims.timestamp).toBe(1234);
    expect(payload.signature).toBe("0xdeadbeef");
    // tab_id is no longer part of the signed claims
    expect((payload.claims as Record<string, unknown>).tab_id).toBeUndefined();
  });

  it("issues payment guarantee with serialized payload", async () => {
    const issueGuarantee = vi
      .fn()
      .mockResolvedValue({ claims: "0xabc", signature: "0xdef" });
    const rpc = { issueGuarantee } as unknown as RpcProxy;
    const client = buildClientStub({ rpc });
    const recipient = new RecipientClient(client);

    const claims = PaymentGuaranteeRequestClaims.new(
      USER,
      RECIPIENT,
      0x20,
      1234,
      ASSET,
      0x30,
    );

    const cert = await recipient.issuePaymentGuarantee(
      claims,
      "0xsig",
      SigningScheme.EIP712,
    );

    expect(issueGuarantee).toHaveBeenCalledTimes(1);
    const payload = issueGuarantee.mock.calls[0]?.[0] as Record<
      string,
      unknown
    >;
    const payloadClaims = payload.claims as Record<string, unknown>;
    expect(payloadClaims.req_id).toBe("0x30");
    expect(payloadClaims.amount).toBe("0x20");
    expect(payloadClaims.user_address).toBe(USER);
    expect(payloadClaims.recipient_address).toBe(RECIPIENT);
    expect(payloadClaims.asset_address).toBe(ASSET);

    expect(cert.claims).toBe("0xabc");
    expect(cert.signature).toBe("0xdef");
  });

  it("verifies guarantee domain and rejects mismatch", async () => {
    const domain = new Uint8Array(32);
    const encoded = encodeGuaranteeClaims({
      domain,
      userAddress: USER,
      recipientAddress: RECIPIENT,
      cycleId: 1n,
      reqId: 2n,
      amount: 3n,
      assetAddress: ASSET,
      timestamp: 123,
      version: 1,
    });

    const okClient = buildClientStub({
      guaranteeDomain: `0x${Buffer.from(domain).toString("hex")}`,
    });
    const okRecipient = new RecipientClient(okClient);
    const decoded = await okRecipient.verifyPaymentGuarantee({
      claims: encoded,
      signature: `0x${"11".repeat(96)}`,
    });
    expect(decoded.cycleId).toBe(1n);

    const badClient = buildClientStub({
      guaranteeDomain: `0x${"11".repeat(32)}`,
    });
    const badRecipient = new RecipientClient(badClient);
    await expect(
      badRecipient.verifyPaymentGuarantee({
        claims: encoded,
        signature: `0x${"11".repeat(96)}`,
      }),
    ).rejects.toThrow(VerificationError);
  });

  it("recipient.claimNetCredit fetches the clearing action and calls the gateway", async () => {
    const claimNetCredit = vi
      .fn()
      .mockResolvedValue({ hash: "0xtx", status: "success" });
    const getClearingClaimNetCreditAction = vi.fn().mockResolvedValue({
      contract_address: CLEARING_HOUSE,
      function_name: "claimNetCredit",
      action: "claim_net_credit",
      cycle_id: CYCLE_ID,
      cycle_id_text: "c",
      asset_address: ASSET,
      participant: RECIPIENT,
      debtor: null,
      amount: "0x64",
      payable_value: "0",
      proof: PROOF,
    });
    const rpc = { getClearingClaimNetCreditAction } as unknown as RpcProxy;
    const gateway = { claimNetCredit } as unknown as ContractGateway;
    const client = buildClientStub({ rpc, gateway });
    const recipient = new RecipientClient(client);

    await recipient.claimNetCredit(CYCLE_ID);

    expect(getClearingClaimNetCreditAction).toHaveBeenCalledTimes(1);
    expect(claimNetCredit).toHaveBeenCalledWith(
      CLEARING_HOUSE,
      CYCLE_ID,
      100n,
      PROOF,
      undefined,
    );
  });

  it("user.payNetDebit fetches the clearing action and forwards the native value", async () => {
    const payNetDebit = vi
      .fn()
      .mockResolvedValue({ hash: "0xtx", status: "success" });
    const getClearingPayNetDebitAction = vi.fn().mockResolvedValue({
      contract_address: CLEARING_HOUSE,
      function_name: "payNetDebit",
      action: "pay_net_debit",
      cycle_id: CYCLE_ID,
      cycle_id_text: "c",
      asset_address: ASSET,
      participant: USER,
      debtor: USER,
      amount: "0x64",
      payable_value: "0x64",
      proof: PROOF,
    });
    const rpc = { getClearingPayNetDebitAction } as unknown as RpcProxy;
    const gateway = { payNetDebit } as unknown as ContractGateway;
    const client = buildClientStub({ rpc, gateway });
    const user = new UserClient(client);

    await user.payNetDebit(CYCLE_ID);

    expect(getClearingPayNetDebitAction).toHaveBeenCalledTimes(1);
    expect(payNetDebit).toHaveBeenCalledWith(
      CLEARING_HOUSE,
      CYCLE_ID,
      100n,
      PROOF,
      100n,
      undefined,
    );
  });

  it("builds payment payload with V2 claims", () => {
    const base = PaymentGuaranteeRequestClaims.new(
      USER,
      RECIPIENT,
      9,
      5000,
      ASSET,
      4,
    );
    const subjectHash = computeValidationSubjectHash(base);
    const partial = new PaymentGuaranteeRequestClaimsV2({
      userAddress: base.userAddress,
      recipientAddress: base.recipientAddress,
      reqId: base.reqId,
      amount: base.amount,
      timestamp: base.timestamp,
      assetAddress: base.assetAddress,
      validationRegistryAddress: "0x0000000000000000000000000000000000000011",
      validationRequestHash: `0x${"00".repeat(32)}`,
      validationChainId: 1,
      validatorAddress: "0x0000000000000000000000000000000000000022",
      validatorAgentId: 7n,
      minValidationScore: 80,
      validationSubjectHash: subjectHash,
      jobHash: `0x${"11".repeat(32)}`,
      requiredValidationTag: "test",
    });
    const v2claims = new PaymentGuaranteeRequestClaimsV2({
      ...partial,
      validationRequestHash: computeValidationRequestHash(partial),
    });
    const payload = buildPaymentPayload(v2claims, {
      signature: "0xdeadbeef",
      scheme: SigningScheme.EIP712,
    });
    expect(payload.claims.version).toBe("v2");
    expect(
      (payload.claims as Record<string, unknown>).validation_registry_address,
    ).toBe("0x0000000000000000000000000000000000000011");
    expect(
      (payload.claims as Record<string, unknown>).min_validation_score,
    ).toBe(80);
    expect(
      (payload.claims as Record<string, unknown>).required_validation_tag,
    ).toBe("test");
    expect(payload.signature).toBe("0xdeadbeef");
  });

  it("buildPaymentPayload throws when string signature and no scheme", () => {
    const claims = PaymentGuaranteeRequestClaims.new(
      USER,
      RECIPIENT,
      2,
      100,
      ASSET,
      0,
    );
    expect(() =>
      buildPaymentPayload(claims, "0xdeadbeef" as unknown as never),
    ).toThrow();
  });

  it("verifyPaymentGuarantee V2 rejects when version disabled on-chain", async () => {
    const gateway = {
      getGuaranteeVersionConfig: vi.fn().mockResolvedValue({
        domainSeparator: `0x${"00".repeat(32)}`,
        decoder: "0x0000000000000000000000000000000000000000",
        enabled: false,
      }),
    } as unknown as ContractGateway;
    const client = buildClientStub({ gateway });
    const recipient = new RecipientClient(client);

    const v2claims = encodeGuaranteeClaims({
      domain: new Uint8Array(32),
      userAddress: USER,
      recipientAddress: RECIPIENT,
      cycleId: 1n,
      reqId: 1n,
      amount: 1n,
      assetAddress: ASSET,
      timestamp: 123,
      version: 2,
      validationPolicy: {
        validationRegistryAddress: "0x0000000000000000000000000000000000000011",
        validationRequestHash: `0x${"00".repeat(32)}`,
        validationChainId: 1,
        validatorAddress: "0x0000000000000000000000000000000000000022",
        validatorAgentId: 1n,
        minValidationScore: 80,
        validationSubjectHash: `0x${"00".repeat(32)}`,
        jobHash: `0x${"11".repeat(32)}`,
        requiredValidationTag: "",
      },
    });
    await expect(
      recipient.verifyPaymentGuarantee({
        claims: v2claims,
        signature: `0x${"11".repeat(96)}`,
      }),
    ).rejects.toThrow(VerificationError);
  });
});

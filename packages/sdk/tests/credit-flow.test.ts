import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it, vi } from "vitest";
import type { Client } from "../src/client";
import { RecipientClient } from "../src/client/recipient";
import { UserClient } from "../src/client/user";
import type { ContractGateway } from "../src/contract";
import { VerificationError } from "../src/errors";
import { encodeGuaranteeClaims } from "../src/guarantee";
import {
  CorePublicParameters,
  PaymentGuaranteeRequestClaims,
  PaymentGuaranteeRequestClaimsV2,
  SigningScheme,
} from "../src/models";
import { buildPaymentPayload } from "../src/payment";
import type { RpcProxy } from "../src/rpc";
import {
  computeValidationRequestHash,
  computeValidationSubjectHash,
} from "../src/validation";

const USER = "0x0000000000000000000000000000000000000011";
const RECIPIENT = "0x0000000000000000000000000000000000000022";
const ASSET = "0x0000000000000000000000000000000000000003";

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
    guaranteeDomain: "0x" + "00".repeat(32),
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
      2,
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
    expect(payload.claims.tab_id).toBe("0x2");
    expect(payload.claims.req_id).toBe("0x7");
    expect(payload.claims.amount).toBe("0x5");
    expect(payload.claims.asset_address).toBe(ASSET);
    expect(payload.claims.timestamp).toBe(1234);
    expect(payload.signature).toBe("0xdeadbeef");
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
      0x10,
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
    expect(payloadClaims.tab_id).toBe("0x10");
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
      tabId: 1n,
      reqId: 2n,
      amount: 3n,
      totalAmount: 4n,
      assetAddress: ASSET,
      timestamp: 123,
      version: 1,
    });

    const okClient = buildClientStub({
      guaranteeDomain: "0x" + Buffer.from(domain).toString("hex"),
    });
    const okRecipient = new RecipientClient(okClient);
    const decoded = await okRecipient.verifyPaymentGuarantee({
      claims: encoded,
      signature: "0x" + "11".repeat(96),
    });
    expect(decoded.tabId).toBe(1n);

    const badClient = buildClientStub({
      guaranteeDomain: "0x" + "11".repeat(32),
    });
    const badRecipient = new RecipientClient(badClient);
    await expect(
      badRecipient.verifyPaymentGuarantee({
        claims: encoded,
        signature: "0x" + "11".repeat(96),
      }),
    ).rejects.toThrow(VerificationError);
  });

  it("maps tab payment status from gateway", async () => {
    const gateway = {
      getPaymentStatus: vi.fn().mockResolvedValue({
        paidAmount: "7",
        paidOut: true,
        assetAddress: ASSET,
      }),
    } as unknown as ContractGateway;
    const client = buildClientStub({ gateway });
    const user = new UserClient(client);

    const status = await user.getTabPaymentStatus(5n);
    expect(status.paid).toBe(7n);
    expect(status.remunerated).toBe(true);
    expect(status.asset).toBe(ASSET);
  });

  it("routes payments to the correct gateway method", async () => {
    const payTabEth = vi.fn();
    const payTabErc20 = vi.fn();
    const gateway = { payTabEth, payTabErc20 } as unknown as ContractGateway;
    const client = buildClientStub({ gateway });
    const user = new UserClient(client);

    await user.payTab(1n, 2n, 3n, RECIPIENT, ASSET);
    expect(payTabErc20).toHaveBeenCalledWith(
      1n,
      3n,
      ASSET,
      RECIPIENT,
      undefined,
    );
    expect(payTabEth).not.toHaveBeenCalled();

    await user.payTab(1n, 2n, 3n, RECIPIENT);
    expect(payTabEth).toHaveBeenCalledWith(1n, 2n, 3n, RECIPIENT, undefined);
  });

  it("pays the remaining tab amount in the simple overload", async () => {
    const payTabEth = vi.fn();
    const payTabErc20 = vi.fn();
    const gateway = { payTabEth, payTabErc20 } as unknown as ContractGateway;
    const recipient = {
      getTab: vi.fn().mockResolvedValue({
        tabId: 1n,
        recipientAddress: RECIPIENT,
        assetAddress: ASSET,
        totalAmount: 30n,
        paidAmount: 10n,
      }),
      getLatestGuarantee: vi.fn().mockResolvedValue({
        reqId: 4n,
        amount: 5n,
      }),
    } as unknown as Client["recipient"];
    const client = buildClientStub({ gateway, recipient });
    const user = new UserClient(client);

    await user.payTab(1n);

    expect(payTabErc20).toHaveBeenCalledWith(
      1n,
      20n,
      ASSET,
      RECIPIENT,
      undefined,
    );
    expect(payTabEth).not.toHaveBeenCalled();
  });

  it("creates tabs and normalizes ids", async () => {
    const createPaymentTab = vi.fn().mockResolvedValue({
      id: "0x10",
      erc20_token: ASSET,
      next_req_id: "0x1",
    });
    const rpc = {
      createPaymentTab,
    } as unknown as RpcProxy;
    const client = buildClientStub({ rpc });
    const recipient = new RecipientClient(client);

    const result = await recipient.createTab(USER, RECIPIENT, ASSET, 60, 2);
    expect(result.tabId).toBe(16n);
    expect(result.assetAddress).toBe(ASSET);
    expect(result.nextReqId).toBe(1n);
    expect(createPaymentTab).toHaveBeenCalledWith({
      user_address: USER,
      recipient_address: RECIPIENT,
      erc20_token: ASSET,
      ttl: 60,
      guarantee_version: 2,
    });
  });

  it("builds payment payload with V2 claims", () => {
    const base = PaymentGuaranteeRequestClaims.new(
      USER,
      RECIPIENT,
      3,
      9,
      5000,
      ASSET,
      4,
    );
    const subjectHash = computeValidationSubjectHash(base);
    const partial = new PaymentGuaranteeRequestClaimsV2({
      userAddress: base.userAddress,
      recipientAddress: base.recipientAddress,
      tabId: base.tabId,
      reqId: base.reqId,
      amount: base.amount,
      timestamp: base.timestamp,
      assetAddress: base.assetAddress,
      validationRegistryAddress: "0x0000000000000000000000000000000000000011",
      validationRequestHash: "0x" + "00".repeat(32),
      validationChainId: 1,
      validatorAddress: "0x0000000000000000000000000000000000000022",
      validatorAgentId: 7n,
      minValidationScore: 80,
      validationSubjectHash: subjectHash,
      jobHash: "0x" + "11".repeat(32),
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
      1,
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
        domainSeparator: "0x" + "00".repeat(32),
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
      tabId: 1n,
      reqId: 1n,
      amount: 1n,
      totalAmount: 1n,
      assetAddress: ASSET,
      timestamp: 123,
      version: 2,
      validationPolicy: {
        validationRegistryAddress: "0x0000000000000000000000000000000000000011",
        validationRequestHash: "0x" + "00".repeat(32),
        validationChainId: 1,
        validatorAddress: "0x0000000000000000000000000000000000000022",
        validatorAgentId: 1n,
        minValidationScore: 80,
        validationSubjectHash: "0x" + "00".repeat(32),
        jobHash: "0x" + "11".repeat(32),
        requiredValidationTag: "",
      },
    });
    await expect(
      recipient.verifyPaymentGuarantee({
        claims: v2claims,
        signature: "0x" + "11".repeat(96),
      }),
    ).rejects.toThrow(VerificationError);
  });

  it("remunerate rejects when claims is a Uint8Array (not a string)", async () => {
    // verifyPaymentGuarantee decodes the claims first; if that passes (Uint8Array is valid input),
    // the subsequent typeof check at line 110 catches and throws VerificationError
    const validClaims = encodeGuaranteeClaims({
      domain: new Uint8Array(32),
      userAddress: USER,
      recipientAddress: RECIPIENT,
      tabId: 1n,
      reqId: 1n,
      amount: 1n,
      totalAmount: 1n,
      assetAddress: ASSET,
      timestamp: 123,
      version: 1,
    });
    // Convert the hex string to a Uint8Array to exercise the non-string claims branch
    const claimsBytes = Uint8Array.from(
      Buffer.from(validClaims.replace(/^0x/, ""), "hex"),
    );
    const gateway = { remunerate: vi.fn() } as unknown as ContractGateway;
    const client = buildClientStub({ gateway });
    const recipient = new RecipientClient(client);
    await expect(
      recipient.remunerate({
        claims: claimsBytes as unknown as string,
        signature: "0x" + "11".repeat(96),
      }),
    ).rejects.toThrow(VerificationError);
  });

  it("createTab returns 0n tabId and zero assetAddress when response has no fields", async () => {
    const rpc = {
      createPaymentTab: vi.fn().mockResolvedValue({}),
    } as unknown as RpcProxy;
    const client = buildClientStub({ rpc });
    const recipient = new RecipientClient(client);

    const result = await recipient.createTab(USER, RECIPIENT, ASSET, 60);
    expect(result.tabId).toBe(0n);
    expect(result.assetAddress).toBe(
      "0x0000000000000000000000000000000000000000",
    );
    expect(result.nextReqId).toBe(0n);
  });

  it("rejects invalid remuneration signature types", async () => {
    const gateway = { remunerate: vi.fn() } as unknown as ContractGateway;
    const client = buildClientStub({ gateway });
    const recipient = new RecipientClient(client);
    const validClaims = encodeGuaranteeClaims({
      domain: new Uint8Array(32),
      userAddress: USER,
      recipientAddress: RECIPIENT,
      tabId: 1n,
      reqId: 1n,
      amount: 1n,
      totalAmount: 1n,
      assetAddress: ASSET,
      timestamp: 123,
      version: 1,
    });

    await expect(
      recipient.remunerate({
        claims: validClaims,
        signature: 123 as unknown as string,
      }),
    ).rejects.toThrow(VerificationError);
  });
});

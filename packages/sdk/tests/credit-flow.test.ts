import { bls12_381 } from "@noble/curves/bls12-381.js";
import { describe, expect, it, vi } from "vitest";
import type { ClientCtx } from "@/client/ctx";
import { PaymentClient } from "@/client/payment";
import { SettlementClient } from "@/client/settlement";
import type { ContractGateway } from "@/contract";
import {
  CertificateMismatchError,
  Erc20AllowanceRequiredError,
  GuaranteeDomainMismatchError,
  InvalidParamsError,
} from "@/errors";
import { encodeGuaranteeClaims } from "@/guarantee";
import {
  BLSCert,
  CorePublicParameters,
  PaymentGuaranteeRequestClaims,
} from "@/models";
import type { RpcProxy } from "@/rpc";
import { bytesFromHex } from "@/utils";

const USER = "0x0000000000000000000000000000000000000011";
const RECIPIENT = "0x0000000000000000000000000000000000000022";
const ASSET = "0x0000000000000000000000000000000000000003";
const NATIVE = "0x0000000000000000000000000000000000000000";
const CLEARING_HOUSE = "0x0000000000000000000000000000000000000009";
const CYCLE_ID = `0x${"aa".repeat(32)}`;
const PROOF = [`0x${"dd".repeat(32)}`];
const DOMAIN = new Uint8Array(32).fill(0x11);

const { secretKey, publicKey } = bls12_381.longSignatures.keygen();
const OPERATOR_KEY = publicKey.toBytes(true);

function blsSign(message: Uint8Array): string {
  const signature = bls12_381.longSignatures.sign(
    bls12_381.longSignatures.hash(message),
    secretKey,
  );
  return `0x${Buffer.from(signature.toBytes(true)).toString("hex")}`;
}

function fakeCtx(overrides: Partial<Record<string, unknown>> = {}): ClientCtx {
  const params = new CorePublicParameters(
    OPERATOR_KEY,
    "0x0000000000000000000000000000000000000000",
    "4mica",
    "1",
    84532,
  );
  return {
    signerAddress: RECIPIENT,
    publicParams: params,
    operatorPublicKey: OPERATOR_KEY,
    guaranteeDomain: DOMAIN,
    guaranteeDomains: new Map([[1, DOMAIN]]),
    guaranteeDomainForVersion(version: number) {
      return this.guaranteeDomains.get(version);
    },
    rpc: {},
    facilitator: { isConfigured: () => false },
    gateway: async () => {
      throw new Error("no gateway in this test");
    },
    ...overrides,
  } as unknown as ClientCtx;
}

const certFor = (claimsHex: string): BLSCert =>
  new BLSCert(claimsHex, blsSign(bytesFromHex(claimsHex)));

const encodedClaims = (domain: Uint8Array = DOMAIN): string =>
  encodeGuaranteeClaims({
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

describe("PaymentClient", () => {
  it("issues a guarantee with the tagged claims payload", async () => {
    const issueGuarantee = vi
      .fn()
      .mockResolvedValue(new BLSCert("0xabc", "0xdef"));
    const payment = new PaymentClient(
      fakeCtx({ rpc: { issueGuarantee } as unknown as RpcProxy }),
    );

    const claims = PaymentGuaranteeRequestClaims.new(
      USER,
      RECIPIENT,
      0x30,
      0x20,
      1234,
      ASSET,
    );
    const cert = await payment.issueGuarantee(claims, "0xsig");

    expect(issueGuarantee).toHaveBeenCalledWith({
      claims: {
        version: "v1",
        user_address: USER,
        recipient_address: RECIPIENT,
        req_id: "0x30",
        amount: "0x20",
        asset_address: ASSET,
        timestamp: 1234,
      },
      signature: "0xsig",
      scheme: "eip712",
    });
    expect(cert.claims).toBe("0xabc");
  });

  it("refuses to issue a guarantee crediting someone else", async () => {
    const payment = new PaymentClient(fakeCtx());
    const claims = PaymentGuaranteeRequestClaims.new(
      USER,
      USER, // recipient != this signer
      1,
      1,
      1,
      ASSET,
    );
    await expect(payment.issueGuarantee(claims, "0xsig")).rejects.toThrow(
      InvalidParamsError,
    );
  });

  it("verifies an operator-signed certificate end to end", async () => {
    const payment = new PaymentClient(fakeCtx());
    const encoded = encodedClaims();
    const decoded = await payment.verifyGuarantee(certFor(encoded));
    expect(decoded.cycleId).toBe(1n);
    expect(decoded.reqId).toBe(2n);
    expect(decoded.userAddress.toLowerCase()).toBe(USER);
  });

  it("rejects a certificate whose BLS signature does not verify", async () => {
    const payment = new PaymentClient(fakeCtx());
    const encoded = encodedClaims();
    const other = encodeGuaranteeClaims({
      domain: DOMAIN,
      userAddress: USER,
      recipientAddress: RECIPIENT,
      cycleId: 999n,
      reqId: 2n,
      amount: 3n,
      assetAddress: ASSET,
      timestamp: 123,
      version: 1,
    });
    await expect(
      payment.verifyGuarantee(
        new BLSCert(encoded, blsSign(bytesFromHex(other))),
      ),
    ).rejects.toThrow(CertificateMismatchError);
  });

  it("rejects a certificate under the wrong domain", async () => {
    const payment = new PaymentClient(fakeCtx());
    const encoded = encodedClaims(new Uint8Array(32).fill(0x99));
    await expect(payment.verifyGuarantee(certFor(encoded))).rejects.toThrow(
      GuaranteeDomainMismatchError,
    );
  });
});

describe("SettlementClient", () => {
  const payAction = (overrides: Record<string, unknown> = {}) => ({
    contract_address: CLEARING_HOUSE,
    function_name: "payNetDebit",
    action: "pay_net_debit",
    cycle_id: CYCLE_ID,
    cycle_id_text: "c",
    asset_address: NATIVE,
    participant: RECIPIENT,
    amount: "0x64",
    payable_value: "0x64",
    proof: PROOF,
    ...overrides,
  });

  const claimAction = (overrides: Record<string, unknown> = {}) => ({
    contract_address: CLEARING_HOUSE,
    function_name: "claimNetCreditFor",
    action: "claim_net_credit",
    cycle_id: CYCLE_ID,
    cycle_id_text: "c",
    asset_address: NATIVE,
    participant: RECIPIENT,
    amount: "0x64",
    payable_value: "0",
    proof: PROOF,
    ...overrides,
  });

  const rpcWith = (raw: Record<string, unknown>) =>
    ({
      getClearingPayNetDebitAction: vi
        .fn()
        .mockImplementation(async (_cycle: string, _participant: string) => {
          const { ClearingSettlementActionResponse } = await import("@/models");
          return ClearingSettlementActionResponse.fromRpc(raw);
        }),
      getClearingClaimNetCreditAction: vi.fn().mockImplementation(async () => {
        const { ClearingSettlementActionResponse } = await import("@/models");
        return ClearingSettlementActionResponse.fromRpc(raw);
      }),
    }) as unknown as RpcProxy;

  it("pays a native net debit and forwards the payable value", async () => {
    const payNetDebit = vi
      .fn()
      .mockResolvedValue({ transactionHash: "0xtx", status: "success" });
    const settlement = new SettlementClient(
      fakeCtx({
        rpc: rpcWith(payAction()),
        gateway: async () => ({ payNetDebit }) as unknown as ContractGateway,
      }),
    );

    const receipt = await settlement.pay(CYCLE_ID).send();

    expect(payNetDebit).toHaveBeenCalledWith(
      CLEARING_HOUSE,
      CYCLE_ID,
      100n,
      PROOF,
      100n,
      undefined,
    );
    expect(receipt.txHash).toBe("0xtx");
    expect(receipt.account).toBe(RECIPIENT);
  });

  it("refuses a pay action prepared for someone else", async () => {
    const settlement = new SettlementClient(
      fakeCtx({ rpc: rpcWith(payAction({ participant: USER })) }),
    );
    await expect(settlement.pay(CYCLE_ID).send()).rejects.toThrow(
      InvalidParamsError,
    );
  });

  it("refuses a pay action naming the wrong function", async () => {
    const settlement = new SettlementClient(
      fakeCtx({
        rpc: rpcWith(payAction({ function_name: "claimNetCreditFor" })),
      }),
    );
    await expect(settlement.pay(CYCLE_ID).send()).rejects.toThrow(
      InvalidParamsError,
    );
  });

  it("requires an ERC-20 allowance before a token debit", async () => {
    const erc20Allowance = vi.fn().mockResolvedValue(1n);
    const settlement = new SettlementClient(
      fakeCtx({
        rpc: rpcWith(payAction({ asset_address: ASSET, payable_value: "0" })),
        gateway: async () => ({ erc20Allowance }) as unknown as ContractGateway,
      }),
    );
    await expect(settlement.pay(CYCLE_ID).send()).rejects.toThrow(
      Erc20AllowanceRequiredError,
    );
    expect(erc20Allowance).toHaveBeenCalledWith(ASSET, CLEARING_HOUSE);
  });

  it("claims a net credit for the committed creditor", async () => {
    const claimNetCreditFor = vi
      .fn()
      .mockResolvedValue({ transactionHash: "0xtx", status: "success" });
    const settlement = new SettlementClient(
      fakeCtx({
        rpc: rpcWith(claimAction()),
        gateway: async () =>
          ({ claimNetCreditFor }) as unknown as ContractGateway,
      }),
    );

    const receipt = await settlement.claim(CYCLE_ID).send();

    expect(claimNetCreditFor).toHaveBeenCalledWith(
      CLEARING_HOUSE,
      RECIPIENT,
      CYCLE_ID,
      100n,
      PROOF,
      undefined,
    );
    expect(receipt.account).toBe(RECIPIENT);
  });

  it("claims on behalf of another creditor", async () => {
    const claimNetCreditFor = vi
      .fn()
      .mockResolvedValue({ transactionHash: "0xtx", status: "success" });
    const rpc = rpcWith(claimAction({ participant: USER }));
    const settlement = new SettlementClient(
      fakeCtx({
        rpc,
        gateway: async () =>
          ({ claimNetCreditFor }) as unknown as ContractGateway,
      }),
    );

    const receipt = await settlement.claim(CYCLE_ID).creditor(USER).send();
    expect(claimNetCreditFor).toHaveBeenCalledWith(
      CLEARING_HOUSE,
      expect.stringMatching(/0x0*11$/i),
      CYCLE_ID,
      100n,
      PROOF,
      undefined,
    );
    expect(receipt.account.toLowerCase()).toBe(USER);
  });

  it("refuses a native-asset approve", async () => {
    const settlement = new SettlementClient(
      fakeCtx({ rpc: rpcWith(payAction()) }),
    );
    await expect(
      settlement.pay(CYCLE_ID).selfFunded().approve(),
    ).rejects.toThrow(InvalidParamsError);
  });
});

import { describe, expect, it } from "vitest";
import { X402Error } from "@/errors";
import {
  type PaymentGuaranteeRequestClaims,
  type PaymentSignature,
  SigningScheme,
} from "@/models";
import type { FetchFn } from "@/rpc";
import {
  type PaymentRequirementsV1,
  type PaymentRequirementsV2,
  X402Flow,
  type X402PaymentRequired,
} from "@/x402";

const SCHEME = "4mica-credit";

class StubSigner {
  async signPayment(
    _claims: PaymentGuaranteeRequestClaims,
    _scheme: SigningScheme,
  ) {
    void _claims;
    void _scheme;
    return {
      signature: "deadbeef",
      scheme: SigningScheme.EIP712,
    } as PaymentSignature;
  }
}

describe("X402Flow", () => {
  it("rejects invalid scheme", async () => {
    const flow = new X402Flow(new StubSigner());
    const requirements: PaymentRequirementsV1 = {
      scheme: "http+pay",
      network: "testnet",
      maxAmountRequired: "1",
      payTo: "0x0000000000000000000000000000000000000003",
      asset: "0x0000000000000000000000000000000000000000",
      extra: { reqId: "7" },
    };
    await expect(
      flow.signPayment(
        requirements,
        "0x0000000000000000000000000000000000000001",
      ),
    ).rejects.toThrow(X402Error);
  });

  it("builds header and payload", async () => {
    const flow = new X402Flow(new StubSigner());
    const requirements: PaymentRequirementsV1 = {
      scheme: SCHEME,
      network: "testnet",
      maxAmountRequired: "5",
      payTo: "0x0000000000000000000000000000000000000003",
      asset: "0x0000000000000000000000000000000000000000",
      extra: { reqId: "7" },
    };
    const userAddress = "0x0000000000000000000000000000000000000001";
    const signed = await flow.signPayment(requirements, userAddress);
    const decoded = Buffer.from(signed.header, "base64").toString("utf8");
    const envelope = JSON.parse(decoded);

    expect(envelope.x402Version).toBe(1);
    expect(envelope.scheme).toBe(SCHEME);
    expect(envelope.payload.claims.req_id).toBe("0x7");
    expect(signed.payload.claims.req_id).toBe("0x7");
    expect(signed.payload.claims.amount).toBe("0x5");
  });

  it("defaults req_id to 0x0 when extra.reqId is absent", async () => {
    const flow = new X402Flow(new StubSigner());
    const requirements: PaymentRequirementsV1 = {
      scheme: SCHEME,
      network: "testnet",
      maxAmountRequired: "5",
      payTo: "0x0000000000000000000000000000000000000003",
      asset: "0x0000000000000000000000000000000000000000",
      extra: {},
    };
    const signed = await flow.signPayment(
      requirements,
      "0x0000000000000000000000000000000000000001",
    );
    expect(signed.payload.claims.req_id).toBe("0x0");
  });

  it("builds header and payload for V2", async () => {
    const flow = new X402Flow(new StubSigner());
    const accepted: PaymentRequirementsV2 = {
      scheme: SCHEME,
      network: "testnet",
      amount: "10",
      payTo: "0x0000000000000000000000000000000000000003",
      asset: "0x0000000000000000000000000000000000000000",
      extra: { reqId: "7" },
    };
    const paymentRequired: X402PaymentRequired = {
      x402Version: 2,
      resource: {
        url: "https://api.example.com/data",
        description: "Premium data access",
        mimeType: "application/json",
      },
      accepts: [accepted],
    };
    const userAddress = "0x0000000000000000000000000000000000000001";
    const signed = await flow.signPaymentV2(
      paymentRequired,
      accepted,
      userAddress,
    );
    const decoded = Buffer.from(signed.header, "base64").toString("utf8");
    const envelope = JSON.parse(decoded);

    expect(envelope.x402Version).toBe(2);
    expect(envelope.accepted.scheme).toBe(SCHEME);
    expect(envelope.accepted.amount).toBe("10");
    expect(envelope.resource.url).toBe("https://api.example.com/data");
    expect(envelope.payload.claims.req_id).toBe("0x7");
    expect(signed.payload.claims.req_id).toBe("0x7");
    expect(signed.payload.claims.amount).toBe("0xa");
  });

  it("settles payment through facilitator", async () => {
    const userAddress = "0x0000000000000000000000000000000000000009";
    const facilitatorUrl = "http://facilitator.test";
    const requirements: PaymentRequirementsV1 = {
      scheme: SCHEME,
      network: "testnet",
      maxAmountRequired: "5",
      payTo: "0x00000000000000000000000000000000000000ff",
      asset: "0x0000000000000000000000000000000000000000",
      extra: { reqId: "4" },
    };

    const fetch = async (url: string, init?: RequestInit) => {
      const u = new URL(url);
      if (u.pathname === "/settle") {
        const payload = JSON.parse(init?.body as string);
        expect(payload.paymentRequirements.payTo).toBe(requirements.payTo);
        return new Response(
          JSON.stringify({ settled: true, networkId: requirements.network }),
          {
            status: 200,
          },
        );
      }
      return new Response("not found", { status: 404 });
    };

    const flow = new X402Flow(new StubSigner(), fetch as FetchFn);
    const payment = await flow.signPayment(requirements, userAddress);
    expect(payment.payload.claims.req_id).toBe("0x4");

    const settled = await flow.settlePayment(
      payment,
      requirements,
      facilitatorUrl,
    );
    expect((settled.settlement as Record<string, unknown>).settled).toBe(true);
    expect((settled.settlement as Record<string, unknown>).networkId).toBe(
      requirements.network,
    );
    expect(settled.payment.payload.claims.recipient_address).toBe(
      requirements.payTo,
    );
  });

  it("rejects invalid payment header during settlement", async () => {
    const flow = new X402Flow(new StubSigner());
    const requirements: PaymentRequirementsV1 = {
      scheme: SCHEME,
      network: "testnet",
      maxAmountRequired: "5",
      payTo: "0x0000000000000000000000000000000000000003",
      asset: "0x0000000000000000000000000000000000000000",
      extra: { reqId: "7" },
    };
    const payment = await flow.signPayment(
      requirements,
      "0x0000000000000000000000000000000000000001",
    );
    payment.header = "not-base64";
    await expect(
      flow.settlePayment(payment, requirements, "http://fac.test"),
    ).rejects.toThrow(X402Error);
  });

  it("rejects settlement when facilitator responds with error", async () => {
    const userAddress = "0x0000000000000000000000000000000000000009";
    const facilitatorUrl = "http://facilitator.test";
    const requirements: PaymentRequirementsV1 = {
      scheme: SCHEME,
      network: "testnet",
      maxAmountRequired: "5",
      payTo: "0x00000000000000000000000000000000000000ff",
      asset: "0x0000000000000000000000000000000000000000",
      extra: { reqId: "4" },
    };

    const fetch = async (url: string) => {
      const u = new URL(url);
      if (u.pathname === "/settle") {
        return new Response("bad", { status: 500 });
      }
      return new Response("not found", { status: 404 });
    };

    const flow = new X402Flow(new StubSigner(), fetch as FetchFn);
    const payment = await flow.signPayment(requirements, userAddress);
    await expect(
      flow.settlePayment(payment, requirements, facilitatorUrl),
    ).rejects.toThrow(X402Error);
  });

  it("signPaymentV2 with validation policy produces V2 claims payload", async () => {
    const flow = new X402Flow(new StubSigner());
    const accepted: PaymentRequirementsV2 = {
      scheme: SCHEME,
      network: "testnet",
      amount: "10",
      payTo: "0x0000000000000000000000000000000000000003",
      asset: "0x0000000000000000000000000000000000000000",
      extra: {
        reqId: "7",
        validationRegistryAddress: "0x0000000000000000000000000000000000000011",
        validationChainId: 1,
        validatorAddress: "0x0000000000000000000000000000000000000022",
        validatorAgentId: "7",
        minValidationScore: 80,
        jobHash: "0x" + "11".repeat(32),
        requiredValidationTag: "trust",
      },
    };
    const paymentRequired: X402PaymentRequired = {
      x402Version: 2,
      resource: {
        url: "https://api.example.com/data",
        description: "desc",
        mimeType: "application/json",
      },
      accepts: [accepted],
    };
    const userAddress = "0x0000000000000000000000000000000000000001";
    const signed = await flow.signPaymentV2(
      paymentRequired,
      accepted,
      userAddress,
    );
    const envelope = JSON.parse(
      Buffer.from(signed.header, "base64").toString("utf8"),
    );

    expect(envelope.x402Version).toBe(2);
    const claims = envelope.payload.claims;
    expect(claims.version).toBe("v2");
    expect(claims.validation_registry_address).toBe(
      "0x0000000000000000000000000000000000000011",
    );
    expect(claims.validator_address).toBe(
      "0x0000000000000000000000000000000000000022",
    );
    expect(claims.min_validation_score).toBe(80);
    expect(claims.job_hash).toBe("0x" + "11".repeat(32));
    expect(claims.required_validation_tag).toBe("trust");
    expect(typeof claims.validation_request_hash).toBe("string");
    expect(typeof claims.validation_subject_hash).toBe("string");
    expect(claims.validation_request_hash).not.toBe("0x" + "00".repeat(32));
  });

  it("signPaymentV2 without validation policy falls back to V1 claims", async () => {
    const flow = new X402Flow(new StubSigner());
    const accepted: PaymentRequirementsV2 = {
      scheme: SCHEME,
      network: "testnet",
      amount: "10",
      payTo: "0x0000000000000000000000000000000000000003",
      asset: "0x0000000000000000000000000000000000000000",
      extra: { reqId: "7" },
    };
    const paymentRequired: X402PaymentRequired = {
      x402Version: 2,
      resource: {
        url: "https://api.example.com/data",
        description: "desc",
        mimeType: "application/json",
      },
      accepts: [accepted],
    };
    const signed = await flow.signPaymentV2(
      paymentRequired,
      accepted,
      "0x0000000000000000000000000000000000000001",
    );
    const envelope = JSON.parse(
      Buffer.from(signed.header, "base64").toString("utf8"),
    );
    expect(envelope.payload.claims.version).toBe("v1");
  });

  it("validation_request_hash is deterministic", async () => {
    const flow = new X402Flow(new StubSigner());
    const accepted: PaymentRequirementsV2 = {
      scheme: SCHEME,
      network: "testnet",
      amount: "10",
      payTo: "0x0000000000000000000000000000000000000003",
      asset: "0x0000000000000000000000000000000000000000",
      extra: {
        reqId: "7",
        validationRegistryAddress: "0x0000000000000000000000000000000000000011",
        validationChainId: 1,
        validatorAddress: "0x0000000000000000000000000000000000000022",
        validatorAgentId: "7",
        minValidationScore: 80,
        jobHash: "0x" + "11".repeat(32),
      },
    };
    const paymentRequired: X402PaymentRequired = {
      x402Version: 2,
      resource: {
        url: "https://api.example.com/data",
        description: "desc",
        mimeType: "application/json",
      },
      accepts: [accepted],
    };
    const userAddress = "0x0000000000000000000000000000000000000001";
    const s1 = await flow.signPaymentV2(paymentRequired, accepted, userAddress);
    const s2 = await flow.signPaymentV2(paymentRequired, accepted, userAddress);
    const c1 = JSON.parse(Buffer.from(s1.header, "base64").toString("utf8"))
      .payload.claims;
    const c2 = JSON.parse(Buffer.from(s2.header, "base64").toString("utf8"))
      .payload.claims;
    expect(c1.validation_request_hash).toBe(c2.validation_request_hash);
    expect(c1.validation_subject_hash).toBe(c2.validation_subject_hash);
  });

  it("rejects v2 requirements without amount", async () => {
    const flow = new X402Flow(new StubSigner());
    const accepted = {
      scheme: SCHEME,
      network: "testnet",
      payTo: "0x0000000000000000000000000000000000000003",
      asset: "0x0000000000000000000000000000000000000000",
      extra: { reqId: "7" },
    } as unknown as PaymentRequirementsV2;
    const paymentRequired: X402PaymentRequired = {
      x402Version: 2,
      resource: {
        url: "https://api.example.com/data",
        description: "Premium data access",
        mimeType: "application/json",
      },
      accepts: [accepted],
    };
    await expect(
      flow.signPaymentV2(
        paymentRequired,
        accepted,
        "0x0000000000000000000000000000000000000001",
      ),
    ).rejects.toThrow();
  });
});

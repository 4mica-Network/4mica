import { describe, expect, it } from "vitest";
import { X402Error } from "@/errors";
import {
  type PaymentGuaranteeRequestClaims,
  type PaymentSignature,
  SigningScheme,
} from "@/models";
import type { FetchFn } from "@/rpc";
import {
  PaymentRequirementsV1,
  PaymentRequirementsV2,
  SCHEME_4MICA_CREDIT,
  X402Flow,
  X402PaymentRequired,
  X402ResourceInfo,
} from "@/x402";

const USER = "0x0000000000000000000000000000000000000001";
const PAY_TO = "0x0000000000000000000000000000000000000003";
const NATIVE = "0x0000000000000000000000000000000000000000";

class StubSigner {
  signedClaims: PaymentGuaranteeRequestClaims[] = [];

  async signPayment(
    claims: PaymentGuaranteeRequestClaims,
    _scheme: SigningScheme,
  ): Promise<PaymentSignature> {
    void _scheme;
    this.signedClaims.push(claims);
    return { signature: "0xdeadbeef", scheme: SigningScheme.EIP712 };
  }
}

const v1Requirements = (extra: Record<string, unknown> = {}) =>
  new PaymentRequirementsV1({
    scheme: SCHEME_4MICA_CREDIT,
    network: "testnet",
    maxAmountRequired: "5",
    payTo: PAY_TO,
    asset: NATIVE,
    extra,
  });

const v2Accepted = (extra: Record<string, unknown> = {}) =>
  new PaymentRequirementsV2({
    scheme: SCHEME_4MICA_CREDIT,
    network: "testnet",
    amount: "10",
    payTo: PAY_TO,
    asset: NATIVE,
    extra,
  });

const paymentRequired = (accepted: PaymentRequirementsV2) =>
  new X402PaymentRequired({
    x402Version: 2,
    resource: new X402ResourceInfo({
      url: "https://api.example.com/data",
      description: "Premium data access",
      mimeType: "application/json",
    }),
    accepts: [accepted],
  });

const decodeHeader = (header: string) =>
  JSON.parse(Buffer.from(header, "base64").toString("utf8"));

describe("X402Flow", () => {
  it("rejects any scheme but 4mica-credit", async () => {
    const flow = new X402Flow(new StubSigner());
    await expect(
      flow.signPayment(
        new PaymentRequirementsV1({
          scheme: "http+pay",
          network: "testnet",
          maxAmountRequired: "1",
          payTo: PAY_TO,
          asset: NATIVE,
        }),
        USER,
      ),
    ).rejects.toThrow(X402Error);
  });

  it("signs a v1 payment with a random reqId and no server round-trip", async () => {
    const signer = new StubSigner();
    const failingFetch: FetchFn = async () => {
      throw new Error("no HTTP call belongs in signing");
    };
    const flow = new X402Flow(signer, failingFetch);
    const signed = await flow.signPayment(v1Requirements(), USER);

    const envelope = decodeHeader(signed.header);
    expect(envelope.x402Version).toBe(1);
    expect(envelope.scheme).toBe(SCHEME_4MICA_CREDIT);
    expect(envelope.network).toBe("testnet");
    expect(signed.x402Version).toBe(1);
    expect(signed.envelope).toEqual(envelope);

    const claims = envelope.payload.claims;
    expect(claims.version).toBe("v1");
    expect(claims.amount).toBe("0x5");
    expect(claims.recipient_address).toBe(PAY_TO);
    expect(claims.validation).toBeUndefined();
    // 32 random bytes: astronomically unlikely to be small.
    expect(BigInt(claims.req_id)).toBeGreaterThan(2n ** 64n);
  });

  it("draws a fresh reqId per payment", async () => {
    const flow = new X402Flow(new StubSigner());
    const first = await flow.signPayment(v1Requirements(), USER);
    const second = await flow.signPayment(v1Requirements(), USER);
    expect(decodeHeader(first.header).payload.claims.req_id).not.toBe(
      decodeHeader(second.header).payload.claims.req_id,
    );
  });

  it("signs a v2 payment and echoes resource and extensions", async () => {
    const accepted = v2Accepted();
    const required = paymentRequired(accepted);
    required.extensions = { quota: "10" };
    const flow = new X402Flow(new StubSigner());
    const signed = await flow.signPaymentV2(required, accepted, USER);

    const envelope = decodeHeader(signed.header);
    expect(envelope.x402Version).toBe(2);
    expect(envelope.accepted.amount).toBe("10");
    expect(envelope.resource.url).toBe("https://api.example.com/data");
    expect(envelope.extensions).toEqual({ quota: "10" });
    expect(envelope.payload.claims.amount).toBe("0xa");
    expect(signed.x402Version).toBe(2);
  });

  it("refuses a v2 signing against a non-v2 challenge", async () => {
    const accepted = v2Accepted();
    const required = paymentRequired(accepted);
    required.x402Version = 1;
    const flow = new X402Flow(new StubSigner());
    await expect(flow.signPaymentV2(required, accepted, USER)).rejects.toThrow(
      X402Error,
    );
  });

  it("attaches extra.validation to the signed claims", async () => {
    const signer = new StubSigner();
    const flow = new X402Flow(signer);
    const accepted = v2Accepted({
      validation: {
        validator: "eip155:1:0x1111111111111111111111111111111111111111",
        subject: `0x${"42".repeat(32)}`,
        deadline: 1700000600,
        params: "0xdeadbeef",
      },
    });
    const signed = await flow.signPaymentV2(
      paymentRequired(accepted),
      accepted,
      USER,
    );

    const claims = decodeHeader(signed.header).payload.claims;
    expect(claims.version).toBe("v1");
    expect(claims.validation).toEqual({
      validator: "eip155:1:0x1111111111111111111111111111111111111111",
      subject: `0x${"42".repeat(32)}`,
      deadline: 1700000600,
      params: "0xdeadbeef",
    });
    expect(signer.signedClaims.at(-1)?.validation?.validator).toBe(
      "eip155:1:0x1111111111111111111111111111111111111111",
    );
  });

  it("rejects malformed extra.validation", async () => {
    const flow = new X402Flow(new StubSigner());
    const accepted = v2Accepted({ validation: { validator: "v" } });
    await expect(
      flow.signPaymentV2(paymentRequired(accepted), accepted, USER),
    ).rejects.toThrow(X402Error);
  });

  it("parses raw requirement objects", async () => {
    const flow = new X402Flow(new StubSigner());
    const signed = await flow.signPayment(
      {
        scheme: SCHEME_4MICA_CREDIT,
        network: "testnet",
        maxAmountRequired: "5",
        payTo: PAY_TO,
        asset: NATIVE,
      },
      USER,
    );
    expect(decodeHeader(signed.header).payload.claims.amount).toBe("0x5");

    await expect(
      flow.signPayment(
        { scheme: SCHEME_4MICA_CREDIT, network: "testnet", payTo: PAY_TO },
        USER,
      ),
    ).rejects.toThrow(X402Error);
  });

  it("settles through the facilitator with the envelope object, not the header", async () => {
    const requirements = v1Requirements();
    let settleBody: Record<string, unknown> | undefined;
    const fetch: FetchFn = async (url, init) => {
      expect(new URL(String(url)).pathname).toBe("/settle");
      settleBody = JSON.parse(String(init?.body));
      return new Response(
        JSON.stringify({
          success: true,
          txHash: "0xabc",
          networkId: "testnet",
          certificate: { claims: "0x01", signature: "0x02" },
        }),
        { status: 200 },
      );
    };
    const flow = new X402Flow(new StubSigner(), fetch);
    const payment = await flow.signPayment(requirements, USER);
    const settled = await flow.settlePayment(
      payment,
      requirements,
      "http://facilitator.test/",
    );

    expect(settleBody?.x402Version).toBe(1);
    expect(settleBody?.paymentPayload).toEqual(payment.envelope);
    expect(settleBody).not.toHaveProperty("paymentHeader");
    expect(
      (settleBody?.paymentRequirements as Record<string, unknown>).payTo,
    ).toBe(PAY_TO);

    expect(settled.settlement.success).toBe(true);
    expect(settled.settlement.txHash).toBe("0xabc");
    expect(settled.settlement.certificate?.claims).toBe("0x01");
  });

  it("reports a rejected settlement as success: false, not an exception", async () => {
    const requirements = v1Requirements();
    const fetch: FetchFn = async () =>
      new Response(
        JSON.stringify({ success: false, errorReason: "insufficient_funds" }),
        { status: 200 },
      );
    const flow = new X402Flow(new StubSigner(), fetch);
    const payment = await flow.signPayment(requirements, USER);
    const settled = await flow.settlePayment(
      payment,
      requirements,
      "http://facilitator.test",
    );
    expect(settled.settlement.success).toBe(false);
    expect(settled.settlement.error).toBe("insufficient_funds");
  });

  it("refuses to settle when the requirements version disagrees with the payment", async () => {
    const flow = new X402Flow(new StubSigner());
    const payment = await flow.signPayment(v1Requirements(), USER);
    await expect(
      flow.settlePayment(payment, v2Accepted(), "http://facilitator.test"),
    ).rejects.toThrow(X402Error);
  });

  it("surfaces non-2xx settlement responses as errors", async () => {
    const requirements = v1Requirements();
    const fetch: FetchFn = async () =>
      new Response(JSON.stringify({ error: "boom" }), { status: 500 });
    const flow = new X402Flow(new StubSigner(), fetch);
    const payment = await flow.signPayment(requirements, USER);
    await expect(
      flow.settlePayment(payment, requirements, "http://facilitator.test"),
    ).rejects.toThrow(X402Error);
  });

  it("rejects an invalid facilitator url", async () => {
    const flow = new X402Flow(new StubSigner());
    const payment = await flow.signPayment(v1Requirements(), USER);
    await expect(
      flow.settlePayment(payment, v1Requirements(), "not-a-url"),
    ).rejects.toThrow(X402Error);
  });
});

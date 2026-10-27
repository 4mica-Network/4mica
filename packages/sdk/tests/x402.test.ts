import { type Hex, recoverAddress } from "viem";
import { afterEach, describe, expect, it } from "vitest";
import type { Asset } from "@/client/model";
import { X402Error } from "@/errors";
import { clearingHouseDomain } from "@/guarantee";
import { PaymentRequest, PaymentRequestPayload } from "@/models";
import type { FetchFn } from "@/rpc";
import { randomU256 } from "@/utils";
import {
  PaymentRequirementsV1,
  PaymentRequirementsV2,
  SCHEME_4MICA_CREDIT,
  X402Flow,
  X402PaymentRequired,
  X402ResourceInfo,
} from "@/x402";
import {
  CLEARING_HOUSE_ADDRESS,
  connect,
  MOCK_CORE_CHAIN_ID,
  MockCore,
  ok,
  PAYER,
} from "./helpers/core";

const USER = "0x0000000000000000000000000000000000000001";
const PAY_TO = "0x0000000000000000000000000000000000000003";
const NATIVE = "0x0000000000000000000000000000000000000000";

const CYCLE = `0x${"11".repeat(32)}`;

class StubSigner {
  built: [string, bigint, Asset][] = [];
  signed: PaymentRequestPayload[] = [];

  async newPayment(
    recipient: string,
    amount: bigint,
    asset: Asset,
  ): Promise<PaymentRequestPayload> {
    this.built.push([recipient, amount, asset]);
    return PaymentRequestPayload.new({
      userAddress: USER,
      recipientAddress: recipient,
      cycleId: CYCLE,
      reqId: randomU256(),
      amount,
      timestamp: 1_700_000_000,
      erc20Token: asset.erc20Token,
    });
  }

  async signPayment(payload: PaymentRequestPayload): Promise<PaymentRequest> {
    this.signed.push(payload);
    return new PaymentRequest(payload, "0xdeadbeef");
  }
}

afterEach(() => {
  // connect() stubs the global fetch.
  globalThis.fetch = fetch;
});

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
      ),
    ).rejects.toThrow(X402Error);
  });

  it("signs a v1 payment the signer built for the live cycle", async () => {
    const signer = new StubSigner();
    const failingFetch: FetchFn = async () => {
      throw new Error("signing makes no facilitator call");
    };
    const flow = new X402Flow(signer, failingFetch);
    const signed = await flow.signPayment(v1Requirements());

    const envelope = decodeHeader(signed.header);
    expect(envelope.x402Version).toBe(1);
    expect(envelope.scheme).toBe(SCHEME_4MICA_CREDIT);
    expect(envelope.network).toBe("testnet");
    expect(signed.x402Version).toBe(1);
    expect(signed.envelope).toEqual(envelope);

    expect(Object.keys(envelope.payload).sort()).toEqual([
      "payload",
      "signature",
    ]);
    expect(envelope.payload.signature).toBe("0xdeadbeef");
    const payment = envelope.payload.payload;
    expect(payment.version).toBe("v1");
    expect(payment.amount).toBe("0x5");
    expect(payment.cycle_id).toBe(CYCLE);
    expect(payment.recipient_address).toBe(PAY_TO);
    expect(payment.validation).toBeUndefined();
    expect(signed.payload).toEqual(envelope.payload);
    expect(signed.request.toPayload()).toEqual(envelope.payload);
    expect(signer.built).toHaveLength(1);
    expect(signer.built[0][2].isNative).toBe(true);
  });

  it("draws a fresh reqId per payment", async () => {
    const flow = new X402Flow(new StubSigner());
    const first = await flow.signPayment(v1Requirements());
    const second = await flow.signPayment(v1Requirements());
    expect(decodeHeader(first.header).payload.payload.req_id).not.toBe(
      decodeHeader(second.header).payload.payload.req_id,
    );
  });

  it("signs a v2 payment and echoes resource and extensions", async () => {
    const accepted = v2Accepted();
    const required = paymentRequired(accepted);
    required.extensions = { quota: "10" };
    const flow = new X402Flow(new StubSigner());
    const signed = await flow.signPaymentV2(required, accepted);

    const envelope = decodeHeader(signed.header);
    expect(envelope.x402Version).toBe(2);
    expect(envelope.accepted.amount).toBe("10");
    expect(envelope.resource.url).toBe("https://api.example.com/data");
    expect(envelope.extensions).toEqual({ quota: "10" });
    expect(envelope.payload.payload.amount).toBe("0xa");
    expect(signed.x402Version).toBe(2);
  });

  it("refuses a v2 signing against a non-v2 challenge", async () => {
    const accepted = v2Accepted();
    const required = paymentRequired(accepted);
    required.x402Version = 1;
    const flow = new X402Flow(new StubSigner());
    await expect(flow.signPaymentV2(required, accepted)).rejects.toThrow(
      X402Error,
    );
  });

  it("attaches extra.validation to the signed payment", async () => {
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
    );

    const payment = decodeHeader(signed.header).payload.payload;
    expect(payment.version).toBe("v1");
    expect(payment.validation).toEqual({
      validator: "eip155:1:0x1111111111111111111111111111111111111111",
      subject: `0x${"42".repeat(32)}`,
      deadline: 1700000600,
      params: "0xdeadbeef",
    });
    expect(signer.signed.at(-1)?.validation?.validator).toBe(
      "eip155:1:0x1111111111111111111111111111111111111111",
    );
  });

  it("rejects malformed extra.validation", async () => {
    const flow = new X402Flow(new StubSigner());
    const accepted = v2Accepted({ validation: { validator: "v" } });
    await expect(
      flow.signPaymentV2(paymentRequired(accepted), accepted),
    ).rejects.toThrow(X402Error);
  });

  it("parses raw requirement objects", async () => {
    const flow = new X402Flow(new StubSigner());
    const signed = await flow.signPayment({
      scheme: SCHEME_4MICA_CREDIT,
      network: "testnet",
      maxAmountRequired: "5",
      payTo: PAY_TO,
      asset: NATIVE,
    });
    expect(decodeHeader(signed.header).payload.payload.amount).toBe("0x5");

    await expect(
      flow.signPayment({
        scheme: SCHEME_4MICA_CREDIT,
        network: "testnet",
        payTo: PAY_TO,
      }),
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
          payer: "0x00000000000000000000000000000000000000aa",
          transaction: "",
          network: "testnet",
          extra: { receipt: { receipt: "0x01", signature: "0x02" } },
        }),
        { status: 200 },
      );
    };
    const flow = new X402Flow(new StubSigner(), fetch);
    const payment = await flow.signPayment(requirements);
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
    expect(settled.settlement.transaction).toBeUndefined();
    expect(settled.settlement.network).toBe("testnet");
    expect(settled.settlement.receipt?.receipt).toBe("0x01");
  });

  it("reads a refused settlement's reason, message and details", async () => {
    const requirements = v1Requirements();
    const details = { uncheckpointed: 64, max_uncheckpointed: 64 };
    const fetch: FetchFn = async () =>
      new Response(
        JSON.stringify({
          success: false,
          errorReason: "invalid_4mica_credit_checkpoint_required",
          errorMessage: "checkpoint required",
          transaction: "",
          network: "testnet",
          extra: { retryable: false, details },
        }),
        { status: 200 },
      );
    const flow = new X402Flow(new StubSigner(), fetch);
    const { settlement } = await flow.settlePayment(
      await flow.signPayment(requirements),
      requirements,
      "http://facilitator.test",
    );
    expect(settlement.success).toBe(false);
    expect(settlement.errorReason).toBe(
      "invalid_4mica_credit_checkpoint_required",
    );
    expect(settlement.errorMessage).toBe("checkpoint required");
    expect(settlement.retryable).toBe(false);
    expect(settlement.details).toEqual(details);
  });

  it("reports a rejected settlement as success: false, not an exception", async () => {
    const requirements = v1Requirements();
    const fetch: FetchFn = async () =>
      new Response(
        JSON.stringify({ success: false, errorReason: "insufficient_funds" }),
        { status: 200 },
      );
    const flow = new X402Flow(new StubSigner(), fetch);
    const payment = await flow.signPayment(requirements);
    const settled = await flow.settlePayment(
      payment,
      requirements,
      "http://facilitator.test",
    );
    expect(settled.settlement.success).toBe(false);
    expect(settled.settlement.errorReason).toBe("insufficient_funds");
  });

  it("refuses to settle when the requirements version disagrees with the payment", async () => {
    const flow = new X402Flow(new StubSigner());
    const payment = await flow.signPayment(v1Requirements());
    await expect(
      flow.settlePayment(payment, v2Accepted(), "http://facilitator.test"),
    ).rejects.toThrow(X402Error);
  });

  it("surfaces non-2xx settlement responses as errors", async () => {
    const requirements = v1Requirements();
    const fetch: FetchFn = async () =>
      new Response(JSON.stringify({ error: "boom" }), { status: 500 });
    const flow = new X402Flow(new StubSigner(), fetch);
    const payment = await flow.signPayment(requirements);
    await expect(
      flow.settlePayment(payment, requirements, "http://facilitator.test"),
    ).rejects.toThrow(X402Error);
  });

  it("rejects an invalid facilitator url", async () => {
    const flow = new X402Flow(new StubSigner());
    const payment = await flow.signPayment(v1Requirements());
    await expect(
      flow.settlePayment(payment, v1Requirements(), "not-a-url"),
    ).rejects.toThrow(X402Error);
  });

  it("echoes the recipient as the server spelled it", async () => {
    // A resource server that compares payTo as a string must still match;
    // the payer commits to the address either way.
    const lowered = PAY_TO.toLowerCase();
    const flow = new X402Flow(new StubSigner());
    const signed = await flow.signPayment(
      new PaymentRequirementsV1({
        scheme: SCHEME_4MICA_CREDIT,
        network: "testnet",
        maxAmountRequired: "5",
        payTo: ` ${lowered} `,
        asset: NATIVE,
      }),
    );
    expect(signed.request.payload.recipientAddress).toBe(lowered);
  });

  it.each([
    ["payTo", "nope"],
    ["asset", "0x12"],
    ["maxAmountRequired", "lots"],
  ])("refuses a malformed %s before building a payment", async (field, value) => {
    const signer = new StubSigner();
    const requirements = {
      scheme: SCHEME_4MICA_CREDIT,
      network: "testnet",
      maxAmountRequired: "5",
      payTo: PAY_TO,
      asset: NATIVE,
      [field]: value,
    };
    await expect(
      new X402Flow(signer).signPayment(requirements),
    ).rejects.toThrow(/invalid payment requirements/);
    expect(signer.built).toHaveLength(0);
  });

  it("reads the receipt only from extra, and only when receipt-shaped", async () => {
    const requirements = v1Requirements();
    const fetch: FetchFn = async () =>
      new Response(
        JSON.stringify({
          success: true,
          receipt: { receipt: "0x01", signature: "0x02" },
          extra: { receipt: { claims: "0x01", signature: "0x02" } },
        }),
        { status: 200 },
      );
    const flow = new X402Flow(new StubSigner(), fetch);
    const settled = await flow.settlePayment(
      await flow.signPayment(requirements),
      requirements,
      "http://facilitator.test",
    );
    expect(settled.settlement.receipt).toBeUndefined();
    expect(settled.settlement.raw.extra).toBeDefined();
  });

  it("signs for the live cycle through a connected Client", async () => {
    // The Client is a FlowSigner: the payment is scoped to the cycle core
    // reports, for the advertised asset, and signed by the client's own key.
    const token = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
    const core = new MockCore({
      "GET /core/cycles/active": (request) =>
        ok({
          cycle_id: CYCLE,
          cycle_id_text: "t",
          asset_address: request.url.searchParams.get("asset"),
          period_start: 1_700_000_000,
          period_end: Math.floor(Date.now() / 1000) + 86_400,
        }),
    });
    const client = await connect(core);

    const signed = await X402Flow.fromClient(client).signPayment(
      new PaymentRequirementsV1({
        scheme: SCHEME_4MICA_CREDIT,
        network: "testnet",
        maxAmountRequired: "5",
        payTo: PAY_TO,
        asset: token,
      }),
    );

    const payload = signed.request.payload;
    expect(payload.cycleId).toBe(CYCLE);
    expect(payload.userAddress).toBe(PAYER.address);
    expect(payload.assetAddress).toBe(token);
    expect(core.requests.at(-1)?.url.searchParams.get("asset")).toBe(token);
    await expect(
      recoverAddress({
        hash: payload.signingDigest(
          clearingHouseDomain(MOCK_CORE_CHAIN_ID, CLEARING_HOUSE_ADDRESS),
        ),
        signature: signed.request.signature as Hex,
      }),
    ).resolves.toBe(PAYER.address);
  });
});

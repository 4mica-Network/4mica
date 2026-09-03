import { describe, expect, it, vi } from "vitest";
import type { PaywallConfig, PaywallInput } from "@/server";
import { createPaywall, SCHEME_4MICA_CREDIT, utf8ToBase64 } from "@/server";

const config: PaywallConfig = {
  payTo: "0x1111111111111111111111111111111111111111",
  asset: "0x0000000000000000000000000000000000000000",
  network: "base-sepolia",
  amount: "1000",
};

function inputWith(header: string | null): PaywallInput {
  return {
    method: "GET",
    url: "https://api.example/protected",
    header: (name) => (name.toLowerCase() === "x-payment" ? header : null),
  };
}

function paymentHeader(payload: unknown): string {
  return utf8ToBase64(
    JSON.stringify({
      x402Version: 1,
      scheme: SCHEME_4MICA_CREDIT,
      network: "base-sepolia",
      payload,
    }),
  );
}

describe("createPaywall", () => {
  it("responds 402 with requirements when the X-PAYMENT header is absent", async () => {
    const verifier = { issueGuarantee: vi.fn() };
    const paywall = createPaywall(verifier, config);

    const decision = await paywall.protect(inputWith(null));

    expect(decision.ok).toBe(false);
    if (decision.ok) throw new Error("expected 402");
    expect(decision.status).toBe(402);
    const accepts = decision.body.accepts[0];
    expect(accepts?.payTo).toBe(config.payTo);
    expect(accepts?.scheme).toBe(SCHEME_4MICA_CREDIT);
    expect(accepts?.extra).toEqual({});
    expect(verifier.issueGuarantee).not.toHaveBeenCalled();
  });

  it("advertises extra.validation when configured", async () => {
    const validation = {
      validator: "eip155:1:0x1111111111111111111111111111111111111111",
      subject: `0x${"42".repeat(32)}`,
    };
    const paywall = createPaywall(
      { issueGuarantee: vi.fn() },
      { ...config, extra: { validation } },
    );
    const decision = await paywall.protect(inputWith(null));
    if (decision.ok) throw new Error("expected 402");
    expect(decision.body.accepts[0]?.extra.validation).toEqual(validation);
  });

  it("allows the request and sets X-PAYMENT-RESPONSE when the guarantee is issued", async () => {
    const verifier = {
      issueGuarantee: vi
        .fn()
        .mockResolvedValue({ claims: "0xabc", signature: "0xdef" }),
    };
    const paywall = createPaywall(verifier, config);

    const decision = await paywall.protect(
      inputWith(paymentHeader({ any: "payload" })),
    );

    expect(decision.ok).toBe(true);
    if (!decision.ok) throw new Error("expected allow");
    expect(decision.guarantee.claims).toBe("0xabc");
    expect(decision.responseHeaders["X-PAYMENT-RESPONSE"]).toBeTruthy();
    expect(verifier.issueGuarantee).toHaveBeenCalledWith({ any: "payload" });
  });

  it("responds 402 when the verifier rejects the payment", async () => {
    const verifier = {
      issueGuarantee: vi
        .fn()
        .mockRejectedValue(new Error("insufficient collateral")),
    };
    const paywall = createPaywall(verifier, config);

    const decision = await paywall.protect(inputWith(paymentHeader({})));

    expect(decision.ok).toBe(false);
    if (decision.ok) throw new Error("expected 402");
    expect(decision.body.error).toContain("insufficient collateral");
  });

  it("responds 402 when the X-PAYMENT header is malformed", async () => {
    const verifier = { issueGuarantee: vi.fn() };
    const paywall = createPaywall(verifier, config);

    const decision = await paywall.protect(inputWith("!!!not-base64-json!!!"));

    expect(decision.ok).toBe(false);
    expect(verifier.issueGuarantee).not.toHaveBeenCalled();
  });

  it("accepts a verifier exposed at .rpc (the SDK Client shape)", async () => {
    const client = {
      rpc: {
        issueGuarantee: vi
          .fn()
          .mockResolvedValue({ claims: "0x1", signature: "0x2" }),
      },
    };
    const paywall = createPaywall(client, config);

    const decision = await paywall.protect(inputWith(paymentHeader({})));

    expect(decision.ok).toBe(true);
    expect(client.rpc.issueGuarantee).toHaveBeenCalledOnce();
  });

  it("handle() returns a 402 Response and an allow result via Web Fetch", async () => {
    const verifier = {
      issueGuarantee: vi
        .fn()
        .mockResolvedValue({ claims: "0xa", signature: "0xb" }),
    };
    const paywall = createPaywall(verifier, config);

    const denied = await paywall.handle(
      new Request("https://api.example/protected"),
    );
    expect(denied).toBeInstanceOf(Response);
    expect((denied as Response).status).toBe(402);
    const body = await (denied as Response).json();
    expect(body.accepts[0].payTo).toBe(config.payTo);
    expect(body.accepts[0].extra).toBeUndefined();

    const allowed = await paywall.handle(
      new Request("https://api.example/protected", {
        headers: { "x-payment": paymentHeader({}) },
      }),
    );
    expect(allowed).not.toBeInstanceOf(Response);
    if (allowed instanceof Response) throw new Error("expected allow");
    expect(allowed.headers.get("X-PAYMENT-RESPONSE")).toBeTruthy();
  });
});

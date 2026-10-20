import { describe, expect, it, vi } from "vitest";
import {
  AppClient,
  AppError,
  createAppClient,
  DEFAULT_APP_BASE_URL,
  fromAppNetwork,
  paymentFromHeader,
  toAppNetwork,
  toDisplayAmount,
} from "@/app";
import { ConfigError, InvalidParamsError, X402Error } from "@/errors";
import type { FetchFn } from "@/http";
import { utf8ToBase64 } from "@/server/base64";

const API_KEY = "4mica_sk_test";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const resourceBody = {
  kind: "listing",
  listing: { id: "listing_1", slug: "weather", name: "Weather" },
  agent: null,
  policy: { id: "policy_1", refundPolicy: "Any 5xx is refunded." },
  faqs: [],
};

const resolution = {
  customerId: null,
  allowed: true,
  deniedReason: null,
  needsApproval: false,
  gross: "0.01",
  quotaApplied: "0",
  couponApplied: "0",
  discountApplied: "0",
  creditApplied: "0",
  payable: "0.01",
  couponSkippedReason: null,
};

const payment = {
  id: "pay_1",
  reqId: "0xabc",
  status: "SETTLED",
  amount: "0.01",
};

const lastRequest = (fetchFn: ReturnType<typeof vi.fn<FetchFn>>) => {
  const [url, init] = fetchFn.mock.calls.at(-1) as [string, RequestInit];
  return {
    url,
    method: init.method,
    headers: init.headers as Record<string, string>,
    body: init.body ? JSON.parse(String(init.body)) : undefined,
  };
};

describe("AppClient", () => {
  it("requires an API key", () => {
    expect(() => createAppClient({ apiKey: "" })).toThrow(ConfigError);
    expect(() => createAppClient({ apiKey: "   " })).toThrow(ConfigError);
  });

  it("sends the key as a bearer token to the default host", async () => {
    const fetchFn = vi.fn<FetchFn>(async () => json(resourceBody));
    const client = new AppClient({ apiKey: API_KEY, fetch: fetchFn });

    const context = await client.resource();

    expect(context.kind).toBe("listing");
    expect(context.listing?.slug).toBe("weather");
    const sent = lastRequest(fetchFn);
    expect(sent.url).toBe(`${DEFAULT_APP_BASE_URL}/v1/resource`);
    expect(sent.method).toBe("GET");
    expect(sent.headers.authorization).toBe(`Bearer ${API_KEY}`);
    expect(sent.headers["x-4mica-sdk"]).toMatch(/^ts-sdk-4mica\//);
    expect(sent.body).toBeUndefined();
  });

  it("strips a trailing slash from a custom base url", async () => {
    const fetchFn = vi.fn<FetchFn>(async () => json(resourceBody));
    const client = createAppClient({
      apiKey: API_KEY,
      baseUrl: "http://localhost:4000/",
      fetch: fetchFn,
    });

    await client.resource();

    expect(lastRequest(fetchFn).url).toBe("http://localhost:4000/v1/resource");
  });

  it("resolves a customer, translating the network name", async () => {
    const fetchFn = vi.fn<FetchFn>(async () => json(resolution));
    const client = createAppClient({ apiKey: API_KEY, fetch: fetchFn });

    const result = await client.resolveCustomer({
      payerAddress: "0x3d8e1f5a7c9b2d4e6a8c0f2b4d6e8a1c3f5b7d09",
      network: "base-sepolia",
      amount: "0.01",
      couponCode: "LAUNCH10",
    });

    expect(result.allowed).toBe(true);
    expect(result.payable).toBe("0.01");
    const sent = lastRequest(fetchFn);
    expect(sent.url).toBe(`${DEFAULT_APP_BASE_URL}/v1/customers/resolve`);
    expect(sent.method).toBe("POST");
    expect(sent.headers["content-type"]).toBe("application/json");
    expect(sent.body).toEqual({
      payerAddress: "0x3d8e1f5a7c9b2d4e6a8c0f2b4d6e8a1c3f5b7d09",
      network: "BASE_SEPOLIA",
      amount: "0.01",
      couponCode: "LAUNCH10",
    });
  });

  it("reports a payment and says whether it was new", async () => {
    const fetchFn = vi
      .fn<FetchFn>()
      .mockResolvedValueOnce(json(payment, 201))
      .mockResolvedValueOnce(json(payment, 200));
    const client = createAppClient({ apiKey: API_KEY, fetch: fetchFn });

    const input = {
      reqId: "0xabc",
      payerAddress: "0x3d8e1f5a7c9b2d4e6a8c0f2b4d6e8a1c3f5b7d09",
      recipientAddress: "0x6c5cc69e4c4863dbc3439ab2673806ea7715ebd5",
      network: "eip155:84532",
      amount: "0.01",
    };

    const first = await client.reportPayment(input);
    const second = await client.reportPayment(input);

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(first.payment.id).toBe("pay_1");
    expect(lastRequest(fetchFn).body.network).toBe("BASE_SEPOLIA");
    expect(lastRequest(fetchFn).url).toBe(
      `${DEFAULT_APP_BASE_URL}/v1/payments`,
    );
  });

  it("surfaces the API's error envelope", async () => {
    const fetchFn = vi.fn<FetchFn>(async () =>
      json(
        {
          error: "invalid_request",
          message: "The request body failed validation.",
          issues: [{ path: "listingSlug", message: "does not match this key" }],
        },
        400,
      ),
    );
    const client = createAppClient({ apiKey: API_KEY, fetch: fetchFn });

    const failure = await client
      .reportPayment({
        reqId: "0xabc",
        payerAddress: "0x3d8e1f5a7c9b2d4e6a8c0f2b4d6e8a1c3f5b7d09",
        recipientAddress: "0x6c5cc69e4c4863dbc3439ab2673806ea7715ebd5",
        network: "BASE",
        amount: "1",
        listingSlug: "other",
      })
      .catch((err: unknown) => err);

    expect(failure).toBeInstanceOf(AppError);
    const error = failure as AppError;
    expect(error.status).toBe(400);
    expect(error.code).toBe("invalid_request");
    expect(error.message).toBe("The request body failed validation.");
    expect(error.issues).toEqual([
      { path: "listingSlug", message: "does not match this key" },
    ]);
  });

  it("turns a rejected key into an AppError with the status", async () => {
    const fetchFn = vi.fn<FetchFn>(async () =>
      json(
        { error: "unauthorized", message: "A valid API key is required." },
        401,
      ),
    );
    const client = createAppClient({ apiKey: API_KEY, fetch: fetchFn });

    await expect(client.resource()).rejects.toMatchObject({
      status: 401,
      code: "unauthorized",
    });
  });

  it("wraps transport failures", async () => {
    const fetchFn = vi.fn<FetchFn>(async () => {
      throw new Error("ECONNREFUSED");
    });
    const client = createAppClient({ apiKey: API_KEY, fetch: fetchFn });

    await expect(client.resource()).rejects.toThrow(AppError);
    await expect(client.resource()).rejects.toThrow(/ECONNREFUSED/);
  });

  it("rejects an unknown network before calling the API", async () => {
    const fetchFn = vi.fn<FetchFn>(async () => json(resolution));
    const client = createAppClient({ apiKey: API_KEY, fetch: fetchFn });

    await expect(
      client.resolveCustomer({
        payerAddress: "0x3d8e1f5a7c9b2d4e6a8c0f2b4d6e8a1c3f5b7d09",
        network: "polygon",
        amount: "1",
      }),
    ).rejects.toThrow(InvalidParamsError);
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe("toAppNetwork", () => {
  it("accepts shorthand, CAIP-2 and the API's own names", () => {
    expect(toAppNetwork("base")).toBe("BASE");
    expect(toAppNetwork("base-sepolia")).toBe("BASE_SEPOLIA");
    expect(toAppNetwork("ethereum-sepolia")).toBe("ETHEREUM_SEPOLIA");
    expect(toAppNetwork("eip155:8453")).toBe("BASE");
    expect(toAppNetwork("eip155:84532")).toBe("BASE_SEPOLIA");
    expect(toAppNetwork("eip155:11155111")).toBe("ETHEREUM_SEPOLIA");
    expect(toAppNetwork("BASE_SEPOLIA")).toBe("BASE_SEPOLIA");
    expect(toAppNetwork(" base_sepolia ")).toBe("BASE_SEPOLIA");
  });
});

describe("fromAppNetwork", () => {
  it("returns the shorthand the core client and paywall take", () => {
    expect(fromAppNetwork("BASE")).toBe("base");
    expect(fromAppNetwork("BASE_SEPOLIA")).toBe("base-sepolia");
    expect(fromAppNetwork("ETHEREUM_SEPOLIA")).toBe("ethereum-sepolia");
    expect(fromAppNetwork("eip155:84532")).toBe("base-sepolia");
    expect(() => fromAppNetwork("polygon")).toThrow(InvalidParamsError);
  });
});

describe("paymentFromHeader", () => {
  const header = (claims: Record<string, unknown>) =>
    utf8ToBase64(
      JSON.stringify({
        x402Version: 1,
        scheme: "4mica-credit",
        network: "eip155:84532",
        payload: { claims, signature: "0xsig" },
      }),
    );

  it("reads the id, payer and amount from the payment envelope", () => {
    const parsed = paymentFromHeader(
      header({
        req_id: "0xabc",
        user_address: "0x3d8e1f5a7c9b2d4e6a8c0f2b4d6e8a1c3f5b7d09",
        amount: "1500000",
      }),
      6,
    );

    expect(parsed).toEqual({
      reqId: "0xabc",
      payerAddress: "0x3d8e1f5a7c9b2d4e6a8c0f2b4d6e8a1c3f5b7d09",
      amountRaw: 1500000n,
      amount: "1.5",
    });
  });

  it("accepts camelCase claim names and defaults to 18 decimals", () => {
    const parsed = paymentFromHeader(
      header({
        reqId: "0xdef",
        userAddress: "0xpayer",
        amount: "1000000000000000000",
      }),
    );

    expect(parsed.reqId).toBe("0xdef");
    expect(parsed.amount).toBe("1");
  });

  it("rejects an envelope without the payment facts", () => {
    expect(() => paymentFromHeader(header({ req_id: "0xabc" }))).toThrow(
      InvalidParamsError,
    );
    expect(() => paymentFromHeader("not-base64-json")).toThrow(X402Error);
  });
});

describe("toDisplayAmount", () => {
  it("formats base units as a decimal string", () => {
    expect(toDisplayAmount(1500000n, 6)).toBe("1.5");
    expect(toDisplayAmount(1000n, 6)).toBe("0.001");
    expect(toDisplayAmount(0n, 18)).toBe("0");
    expect(toDisplayAmount(42n, 0)).toBe("42");
    expect(toDisplayAmount(-2500000n, 6)).toBe("-2.5");
  });
});

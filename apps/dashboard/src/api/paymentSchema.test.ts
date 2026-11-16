import { describe, expect, it } from "vitest";
import { parsePayment, parsePaymentList } from "./paymentSchema";

describe("payment response parsing", () => {
  it("keeps an https resource and unrelated fields", () => {
    const payment = parsePayment({
      id: "pay_1",
      resource: "https://example.com/api",
      amount: "1.5",
    });

    expect(payment.resource).toBe("https://example.com/api");
    expect(payment.amount).toBe("1.5");
  });

  it.each([
    "http://example.com/api",
    "javascript:alert(1)",
    "data:text/html,x",
  ])("nulls the unsafe resource %s", (resource) => {
    expect(parsePayment({ id: "pay_1", resource }).resource).toBeNull();
  });

  it("sanitises every item of a list", () => {
    const list = parsePaymentList({
      items: [
        { id: "pay_1", resource: "javascript:alert(1)" },
        { id: "pay_2", resource: "https://example.com" },
        { id: "pay_3", resource: null },
      ],
      total: 3,
      page: 1,
      limit: 20,
    });

    expect(list.items.map((item) => item.resource)).toEqual([
      null,
      "https://example.com",
      null,
    ]);
  });

  it("rejects a response that is not a payment list", () => {
    expect(() => parsePaymentList({ items: "nope" })).toThrow();
  });
});

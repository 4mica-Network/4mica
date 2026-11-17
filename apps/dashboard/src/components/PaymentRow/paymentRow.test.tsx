import type { Payment } from "@stores/payment/type";
import type { User } from "@stores/user/type";
import { render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { createStore } from "redux";
import { describe, expect, it } from "vitest";
import "@/i18n";
import { PaymentRow } from "./index";

const payment = (resource: string | null): Payment => ({
  id: "pay_1",
  listingId: null,
  agentId: null,
  payerAddress: "0x1111111111111111111111111111111111111111",
  recipientAddress: "0x2222222222222222222222222222222222222222",
  network: "BASE",
  assetAddress: null,
  amount: "1.5",
  status: "SETTLED",
  failureReason: null,
  reqId: "req_1",
  txHash: null,
  resource,
  description: "Test payment",
  settledAt: null,
  createdAt: "2026-08-05T00:00:00.000Z",
  updatedAt: "2026-08-05T00:00:00.000Z",
  listingSlug: null,
  listingName: null,
  agentSlug: null,
  agentName: null,
  direction: "received",
  onCore: false,
});

const renderRow = (row: Payment, privacyMode = false) =>
  render(
    <Provider
      store={createStore(() => ({
        user: { user: { privacyMode } as User },
      }))}
    >
      <PaymentRow payment={row} />
    </Provider>,
  );

const hrefs = () =>
  screen.queryAllByRole("link").map((link) => link.getAttribute("href"));

describe("PaymentRow", () => {
  it("links to an https resource", () => {
    renderRow(payment("https://example.com/api"));

    expect(hrefs()).toContain("https://example.com/api");
  });

  it.each([
    "http://example.com/api",
    "javascript:alert(1)",
    "data:text/html,x",
  ])("renders no link for the unsafe resource %s", (resource) => {
    renderRow(payment(resource));

    expect(hrefs()).not.toContain(resource);
    expect(hrefs().every((href) => href?.startsWith("https://"))).toBe(true);
  });

  describe("in privacy mode", () => {
    it("masks the amount and the counterparty", () => {
      renderRow(payment(null), true);

      expect(screen.getByTestId("payment-amount-pay_1")).toHaveTextContent(
        "+••••",
      );
      expect(document.body.textContent).not.toContain("0x1111");
      expect(document.body.textContent).not.toContain("1.5");
      expect(screen.getAllByText("Hidden").length).toBeGreaterThan(0);
    });

    it("drops the explorer link that would reveal the counterparty", () => {
      renderRow(payment(null), true);

      expect(hrefs().some((href) => href?.includes("0x1111"))).toBe(false);
    });

    it("shows everything when privacy mode is off", () => {
      renderRow(payment(null));

      expect(screen.getByTestId("payment-amount-pay_1")).toHaveTextContent(
        "+1.5",
      );
      expect(hrefs().some((href) => href?.includes("0x1111"))).toBe(true);
    });
  });
});

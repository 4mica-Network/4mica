import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { messages } from "@/i18n";
import { PriceHeadline, pricingNote } from ".";

describe("PriceHeadline", () => {
  it("leads with the price per request", () => {
    render(
      <PriceHeadline
        amount="0.020000000000000000"
        currency="USD"
        label="Usage-based"
      />,
    );

    expect(screen.getByText("$0.02")).toBeInTheDocument();
    expect(screen.getByText(messages.api.perRequest)).toBeInTheDocument();
    expect(screen.queryByText("Usage-based")).not.toBeInTheDocument();
  });

  it("formats a token price", () => {
    render(<PriceHeadline amount="1.5" currency="USDC" label={null} />);

    expect(screen.getByText("1.5 USDC")).toBeInTheDocument();
  });

  it("falls back to the label when there is no machine price", () => {
    render(<PriceHeadline amount={null} currency={null} label="Contact us" />);

    expect(screen.getByText("Contact us")).toBeInTheDocument();
    expect(screen.queryByText(messages.api.perRequest)).not.toBeInTheDocument();
  });

  it("says the price is unset when the seller gave neither", () => {
    render(<PriceHeadline amount={null} currency={null} label={null} />);

    expect(screen.getByText(messages.api.priceUnset)).toBeInTheDocument();
  });
});

describe("pricingNote", () => {
  it("keeps a label that adds something to the price", () => {
    expect(
      pricingNote({ amount: "0.02", currency: "USD", label: "Usage-based" }),
    ).toBe("Usage-based");
  });

  it("drops a label that only repeats the price", () => {
    expect(
      pricingNote({
        amount: "0.002",
        currency: "USD",
        label: "$0.002 per research run",
      }),
    ).toBeNull();
  });

  it("has nothing to add when the label is already the headline", () => {
    expect(
      pricingNote({ amount: null, currency: null, label: "Contact us" }),
    ).toBeNull();
  });
});

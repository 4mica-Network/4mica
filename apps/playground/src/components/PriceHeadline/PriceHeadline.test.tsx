import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { messages } from "@/i18n";
import { PriceHeadline } from ".";

const USDC = "0x036cbd53842c5426634e7929541ec2318f3dcf7e";

describe("PriceHeadline", () => {
  it("leads with the price even when the seller also wrote a label", () => {
    render(
      <PriceHeadline
        amount="0.020000000000000000"
        assetAddress={null}
        currency="USD"
        label="Usage-based"
        network="BASE_SEPOLIA"
      />,
    );

    expect(screen.getByText("$0.02")).toBeInTheDocument();
    expect(screen.getByText(messages.api.perRequest)).toBeInTheDocument();
    expect(
      screen.getByText(/Base Sepolia · Native asset · Usage-based/),
    ).toBeInTheDocument();
  });

  it("drops a label that only repeats the price", () => {
    render(
      <PriceHeadline
        amount="0.002"
        assetAddress={null}
        currency="USD"
        label="$0.002 per research run"
        network="BASE_SEPOLIA"
      />,
    );

    expect(screen.getByText("$0.002")).toBeInTheDocument();
    expect(screen.getByText("Base Sepolia · Native asset")).toBeInTheDocument();
  });

  it("names the token an ERC-20 listing settles in", () => {
    render(
      <PriceHeadline
        amount="1.5"
        assetAddress={USDC}
        currency="USDC"
        label={null}
        network="BASE_SEPOLIA"
      />,
    );

    expect(screen.getByText("1.5 USDC")).toBeInTheDocument();
    expect(screen.getByText(/0x036c…cf7e/)).toBeInTheDocument();
  });

  it("falls back to the label when there is no machine price", () => {
    render(
      <PriceHeadline
        amount={null}
        assetAddress={null}
        currency={null}
        label="Contact us"
        network="BASE_SEPOLIA"
      />,
    );

    expect(screen.getByText("Contact us")).toBeInTheDocument();
    expect(screen.queryByText(messages.api.perRequest)).not.toBeInTheDocument();
  });

  it("says the price is unset when the seller gave neither", () => {
    render(
      <PriceHeadline
        amount={null}
        assetAddress={null}
        currency={null}
        label={null}
        network={null}
      />,
    );

    expect(screen.getByText(messages.api.priceUnset)).toBeInTheDocument();
  });
});

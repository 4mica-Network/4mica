import type { PaymentNetwork } from "@4mica/rules";
import { render, screen } from "@testing-library/react";
import { FormProvider, useForm } from "react-hook-form";
import { describe, expect, it } from "vitest";
import "@/i18n";
import {
  fromAssetFormValue,
  NATIVE_ASSET,
  PriceField,
  toAssetFormValue,
} from ".";

const USDC_BASE_SEPOLIA = "0x036cbd53842c5426634e7929541ec2318f3dcf7e";

let latest: Record<string, unknown> = {};

function Harness({
  network,
  assetAddress,
}: {
  network: PaymentNetwork | null;
  assetAddress: string;
}) {
  const form = useForm({
    defaultValues: { priceAmount: "0.01", assetAddress },
  });
  latest = form.watch();
  return (
    <FormProvider {...form}>
      <PriceField
        network={network}
        idPrefix="t"
        title="Price"
        description="What a call costs"
        placeholder="0.01"
      />
    </FormProvider>
  );
}

describe("PriceField", () => {
  it("maps the native coin to and from the form", () => {
    expect(toAssetFormValue(null)).toBe(NATIVE_ASSET);
    expect(fromAssetFormValue(NATIVE_ASSET)).toBeNull();
    expect(fromAssetFormValue("")).toBeNull();
    expect(fromAssetFormValue(USDC_BASE_SEPOLIA)).toBe(USDC_BASE_SEPOLIA);
  });

  it("shows the chosen token's symbol beside the price", () => {
    render(<Harness network="BASE_SEPOLIA" assetAddress={USDC_BASE_SEPOLIA} />);

    expect(screen.getAllByText("USDC").length).toBeGreaterThan(0);
  });

  it("falls back to the native coin when the token is not on the network", () => {
    render(<Harness network="BASE" assetAddress={USDC_BASE_SEPOLIA} />);

    expect(latest.assetAddress).toBe(NATIVE_ASSET);
  });

  it("waits for a network before offering tokens", () => {
    render(<Harness network={null} assetAddress={NATIVE_ASSET} />);

    expect(
      screen.getByText(
        "Choose a receiving wallet to pick the token buyers pay in",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Token" })).toBeDisabled();
  });
});

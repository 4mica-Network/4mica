import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { messages } from "@/i18n";
import { parseView, ViewSwitch } from ".";

describe("parseView", () => {
  it("shows the owner the seller view unless they ask for the buyer's", () => {
    expect(parseView(true, undefined)).toBe("seller");
    expect(parseView(true, "seller")).toBe("seller");
    expect(parseView(true, "nonsense")).toBe("seller");
    expect(parseView(true, "buyer")).toBe("buyer");
  });

  it("never shows a visitor the seller view", () => {
    expect(parseView(false, undefined)).toBe("buyer");
    expect(parseView(false, "seller")).toBe("buyer");
  });
});

describe("ViewSwitch", () => {
  it("links to both views and marks the current one", () => {
    render(<ViewSwitch view="buyer" />);

    const seller = screen.getByRole("link", { name: messages.view.seller });
    const buyer = screen.getByRole("link", { name: messages.view.buyer });

    expect(seller.getAttribute("href")).toBe("?view=seller");
    expect(buyer.getAttribute("href")).toBe("?view=buyer");
    expect(buyer.getAttribute("aria-current")).toBe("page");
    expect(seller.hasAttribute("aria-current")).toBe(false);
  });
});

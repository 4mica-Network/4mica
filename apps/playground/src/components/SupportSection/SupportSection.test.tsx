import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { messages } from "@/i18n";
import type { PublicProfile } from "@/types";
import { SupportSection } from ".";

const profile = (over: Partial<PublicProfile> = {}): PublicProfile =>
  ({
    username: "mo",
    name: "Mohsen Shafiei",
    bio: null,
    description: null,
    avatarUrl: null,
    verified: false,
    memberSince: "2026-01-01",
    email: "seller@example.com",
    phoneNumber: null,
    primaryBrandColor: null,
    secondaryBrandColor: null,
    allowSEOIndexing: true,
    showBranding: true,
    isOwner: false,
    isPublished: true,
    ...over,
  }) as PublicProfile;

describe("SupportSection", () => {
  it("asks one plain question and offers three ways in", () => {
    render(<SupportSection profile={profile()} resourceName="Dad's Joke" />);

    expect(screen.getByText(messages.support.heading)).toBeInTheDocument();
    expect(screen.getAllByRole("link")).toHaveLength(3);
  });

  it("names the seller and prefills a subject about the listing", () => {
    render(<SupportSection profile={profile()} resourceName="Dad's Joke" />);

    expect(
      screen.getByRole("link", { name: /Ask Mohsen Shafiei/ }),
    ).toHaveAttribute(
      "href",
      "mailto:seller@example.com?subject=Question%20about%20Dad's%20Joke",
    );
  });

  it("falls back to a phone number when that is all the seller published", () => {
    render(
      <SupportSection
        profile={profile({ email: null, phoneNumber: "+1 555 0100" })}
        resourceName="Dad's Joke"
      />,
    );

    expect(
      screen.getByRole("link", { name: /Ask Mohsen Shafiei/ }),
    ).toHaveAttribute("href", "tel:+1 555 0100");
  });

  it("falls back to the profile when the seller published no contact", () => {
    render(
      <SupportSection
        profile={profile({ email: null, phoneNumber: null })}
        resourceName="Dad's Joke"
      />,
    );

    expect(
      screen.getByRole("link", { name: /Ask Mohsen Shafiei/ }),
    ).toHaveAttribute("href", "/mo");
  });

  it("never renders a contact the profile withheld", () => {
    const { container } = render(
      <SupportSection
        profile={profile({ email: null, phoneNumber: null })}
        resourceName="Dad's Joke"
      />,
    );

    expect(container.querySelector('a[href^="mailto:seller"]')).toBeNull();
    expect(container.querySelector('a[href^="tel:"]')).toBeNull();
  });

  it("always offers the 4Mica team and the docs", () => {
    render(<SupportSection profile={profile()} resourceName="Dad's Joke" />);

    expect(
      screen.getByRole("link", { name: /Ask the 4Mica team/ }),
    ).toHaveAttribute(
      "href",
      expect.stringContaining("mailto:support@4mica.io?subject="),
    );
    expect(screen.getByRole("link", { name: /Read the docs/ })).toHaveAttribute(
      "target",
      "_blank",
    );
  });

  it("stays off the brand link colours, which are hard to read in a list", () => {
    const { container } = render(
      <SupportSection profile={profile()} resourceName="Dad's Joke" />,
    );

    expect(container.querySelector(".link-accent")).toBeNull();
    expect(container.querySelector(".link-muted")).toBeNull();
  });
});

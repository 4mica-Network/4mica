import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RevealLink } from ".";

describe("RevealLink", () => {
  it("renders its text as the link", () => {
    render(<RevealLink href="/docs">Read the docs</RevealLink>);

    expect(screen.getByRole("link", { name: "Read the docs" })).toHaveAttribute(
      "href",
      "/docs",
    );
  });

  it("opens an external link safely", () => {
    render(
      <RevealLink external href="https://docs.4mica.io">
        Read the docs
      </RevealLink>,
    );

    const link = screen.getByRole("link");

    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noreferrer noopener");
  });

  it("keeps a same-tab link in this tab", () => {
    render(<RevealLink href="/mo">Visit</RevealLink>);

    expect(screen.getByRole("link")).not.toHaveAttribute("target");
  });

  it("hides the icon from the accessible name so the label reads cleanly", () => {
    render(
      <RevealLink external href="https://docs.4mica.io">
        Read the docs
      </RevealLink>,
    );

    expect(screen.getByRole("link").textContent).toBe("Read the docs");
    expect(
      screen.getByRole("link").querySelector('[aria-hidden="true"]'),
    ).not.toBeNull();
  });

  it("stays off the brand link colours", () => {
    const { container } = render(<RevealLink href="/docs">Docs</RevealLink>);

    expect(container.querySelector(".link-accent")).toBeNull();
    expect(container.querySelector(".link-muted")).toBeNull();
  });
});

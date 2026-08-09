import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Prose } from ".";

/**
 * Prose renders user-authored bio/description text, so the escaping behaviour
 * is a security property rather than a styling detail. This also exercises the
 * jsdom vitest project.
 */
describe("Prose", () => {
  it("renders nothing for empty or whitespace-only input", () => {
    const { container: empty } = render(<Prose text={null} />);
    expect(empty).toBeEmptyDOMElement();

    // Braces, not a quoted attribute: in JSX "\n" inside quotes is a literal
    // backslash followed by n, not a newline.
    const { container: blank } = render(<Prose text={"   \n  "} />);
    expect(blank).toBeEmptyDOMElement();
  });

  it("splits on blank lines into paragraphs", () => {
    render(<Prose text={"First para.\n\nSecond para."} />);

    expect(screen.getByText("First para.")).toBeInTheDocument();
    expect(screen.getByText("Second para.")).toBeInTheDocument();
  });

  it("keeps a single newline inside one paragraph", () => {
    const { container } = render(<Prose text={"One line\nstill same para"} />);

    expect(container.querySelectorAll("p")).toHaveLength(1);
  });

  it("escapes markup rather than rendering it", () => {
    const { container } = render(
      <Prose text={'<img src=x onerror="alert(1)"> <b>bold</b>'} />,
    );

    // No element was created from the input — it is text, not markup.
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("b")).toBeNull();
    expect(container.textContent).toContain("<b>bold</b>");
  });
});

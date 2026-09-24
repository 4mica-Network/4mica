import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { Disclosure, DisclosureList } from ".";

const renderList = () =>
  render(
    <DisclosureList>
      <Disclosure index={1} lead="Add the package" title="Install the SDK">
        <pre>pnpm add @4mica/sdk</pre>
      </Disclosure>
      <Disclosure index={2} title="Call this API">
        <pre>await fetch(url)</pre>
      </Disclosure>
    </DisclosureList>,
  );

describe("Disclosure", () => {
  it("shows the titles with the bodies collapsed", () => {
    renderList();

    expect(screen.getByText("Install the SDK")).toBeInTheDocument();
    expect(screen.getByText("Call this API")).toBeInTheDocument();
    expect(screen.queryByText("pnpm add @4mica/sdk")).not.toBeInTheDocument();
  });

  it("reveals only the step that was opened", async () => {
    const user = userEvent.setup();

    renderList();
    await user.click(screen.getByRole("button", { name: /Install the SDK/ }));

    expect(await screen.findByText("pnpm add @4mica/sdk")).toBeInTheDocument();
    expect(screen.queryByText("await fetch(url)")).not.toBeInTheDocument();
  });

  it("points the trigger at the panel it controls", async () => {
    const user = userEvent.setup();

    renderList();
    const trigger = screen.getByRole("button", { name: /Install the SDK/ });

    expect(trigger).toHaveAttribute("aria-expanded", "false");

    await user.click(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(
      document.getElementById(trigger.getAttribute("aria-controls") ?? ""),
    ).toContainElement(screen.getByText("pnpm add @4mica/sdk"));
  });
});

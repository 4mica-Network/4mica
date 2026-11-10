import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { messages, t } from "@/i18n";
import { StepFlow } from ".";

const groups = [
  {
    id: "about",
    steps: [
      {
        id: "overview",
        title: "Overview",
        icon: "overview" as const,
        content: <p>About it</p>,
      },
    ],
  },
  {
    id: "integrate",
    label: "Integrate",
    numbered: true,
    steps: [
      {
        id: "setup",
        title: "Set up payment",
        done: true,
        content: <p>Set up</p>,
      },
      { id: "install", title: "Install the SDK", content: <p>npm install</p> },
    ],
  },
];

const renderFlow = () =>
  render(<StepFlow groups={groups} identity={<h1>Atlas</h1>} />);

describe("StepFlow", () => {
  it("opens on the first step and hides the rest", () => {
    renderFlow();

    expect(screen.getByRole("region", { name: "Overview" })).toHaveTextContent(
      "About it",
    );
    expect(
      screen.queryByRole("region", { name: "Install the SDK" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Overview" })).toHaveAttribute(
      "aria-current",
      "step",
    );
  });

  it("switches the panel when a step is picked", async () => {
    const user = userEvent.setup();
    renderFlow();

    await user.click(screen.getByRole("button", { name: /Install the SDK/ }));

    expect(
      screen.getByRole("region", { name: "Install the SDK" }),
    ).toHaveTextContent("npm install");
    expect(
      screen.queryByRole("region", { name: "Overview" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: "Install the SDK" }),
    ).toBeInTheDocument();
  });

  it("walks forward with the next control and stops at the end", async () => {
    const user = userEvent.setup();
    renderFlow();

    await user.click(
      screen.getByRole("button", {
        name: t(messages.flow.next, { title: "Set up payment" }),
      }),
    );
    await user.click(
      screen.getByRole("button", {
        name: t(messages.flow.next, { title: "Install the SDK" }),
      }),
    );

    expect(
      screen.getByRole("region", { name: "Install the SDK" }),
    ).toHaveTextContent("npm install");
    expect(
      screen.queryByRole("button", { name: /^Next:/ }),
    ).not.toBeInTheDocument();
  });

  it("marks a completed step for screen readers", () => {
    renderFlow();

    expect(
      screen.getByRole("button", {
        name: `Set up payment, ${messages.flow.done}`,
      }),
    ).toBeInTheDocument();
  });

  describe("a collapsible group", () => {
    const collapsible = [
      groups[0],
      { ...groups[1], icon: "integrate" as const, collapsible: true },
    ];

    it("keeps its steps folded until it is opened", async () => {
      const user = userEvent.setup();
      render(<StepFlow groups={collapsible} identity={<h1>Atlas</h1>} />);

      const header = screen.getByRole("button", { name: /Integrate/ });
      expect(header).toHaveAttribute("aria-expanded", "false");
      expect(
        screen.queryByRole("button", { name: /Install the SDK/ }),
      ).not.toBeInTheDocument();

      await user.click(header);

      expect(header).toHaveAttribute("aria-expanded", "true");
      expect(
        screen.getByRole("button", { name: /Install the SDK/ }),
      ).toBeInTheDocument();
    });

    it("opens itself when the next control walks into it", async () => {
      const user = userEvent.setup();
      render(<StepFlow groups={collapsible} identity={<h1>Atlas</h1>} />);

      await user.click(
        screen.getByRole("button", {
          name: t(messages.flow.next, { title: "Set up payment" }),
        }),
      );

      expect(screen.getByRole("button", { name: /Integrate/ })).toHaveAttribute(
        "aria-expanded",
        "true",
      );
      expect(
        screen.getByRole("button", {
          name: `Set up payment, ${messages.flow.done}`,
        }),
      ).toHaveAttribute("aria-current", "step");
    });
  });
});

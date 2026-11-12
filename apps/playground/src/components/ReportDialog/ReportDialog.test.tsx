import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { messages } from "@/i18n";

vi.mock("@/actions/trust", () => ({
  fileReport: vi.fn(async () => ({ ok: true })),
}));

const { ReportDialog } = await import(".");

const resource = {
  kind: "listing" as const,
  id: "l1",
  username: "atlas",
  ref: "weather",
};

describe("ReportDialog", () => {
  it("exposes the reasons as pressed toggles and moves focus to the thanks", async () => {
    const user = userEvent.setup();
    render(
      <ReportDialog canReport resource={resource} signInHref="/sign-in" />,
    );

    const toggle = screen.getByRole("button", {
      name: messages.trust.reportAction,
    });
    toggle.focus();
    await user.keyboard("{Enter}");

    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(
      document.getElementById(toggle.getAttribute("aria-controls") ?? ""),
    ).not.toBeNull();

    const spam = screen.getByRole("button", {
      name: messages.trust.reasonSpam,
    });
    expect(spam).toHaveAttribute("aria-pressed", "false");
    await user.click(spam);
    expect(spam).toHaveAttribute("aria-pressed", "true");

    await user.click(
      screen.getByRole("button", { name: messages.trust.reportSubmit }),
    );

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        messages.trust.reportThanks,
      ),
    );
    expect(screen.getByRole("status")).toHaveFocus();
  });
});

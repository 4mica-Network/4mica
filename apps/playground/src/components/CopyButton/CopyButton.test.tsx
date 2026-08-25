import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { messages } from "@/i18n";
import { CopyButton } from ".";

const CODE = 'const a = 1; // "quoted"';

/**
 * Must run AFTER `userEvent.setup()`: setup installs its own
 * `navigator.clipboard` stub to back the copy/paste APIs, which would otherwise
 * replace this one and the assertions would silently observe the wrong object.
 */
const stubClipboard = (writeText: () => Promise<void>) => {
  const spy = vi.fn(writeText);

  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: spy },
  });

  return spy;
};

describe("CopyButton", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("writes the raw source to the clipboard", async () => {
    const user = userEvent.setup();
    const writeText = stubClipboard(() => Promise.resolve());

    render(<CopyButton value={CODE} />);
    await user.click(screen.getByRole("button"));

    expect(writeText).toHaveBeenCalledWith(CODE);
    expect(
      await screen.findByRole("button", { name: messages.integration.copied }),
    ).toBeInTheDocument();
  });

  it("stays in its idle state when the clipboard is unavailable", async () => {
    // Insecure contexts and some embedded webviews reject the write. Showing
    // "Copied" then would tell the reader something untrue.
    const user = userEvent.setup();
    stubClipboard(() => Promise.reject(new Error("denied")));

    render(<CopyButton value={CODE} />);
    await user.click(screen.getByRole("button"));

    expect(
      screen.getByRole("button", { name: messages.integration.copy }),
    ).toBeInTheDocument();
  });
});

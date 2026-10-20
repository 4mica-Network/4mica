import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { messages } from "@/i18n";
import { CopyValue } from ".";

const ADDRESS = "0x6c5cc69e4c4863dbc3439ab2673806ea7715ebd5";

const stubClipboard = (writeText: () => Promise<void>) => {
  const spy = vi.fn(writeText);

  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: spy },
  });

  return spy;
};

describe("CopyValue", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("copies the value and confirms it", async () => {
    const user = userEvent.setup();
    const writeText = stubClipboard(() => Promise.resolve());

    render(<CopyValue value={ADDRESS} />);
    await user.click(screen.getByRole("button"));

    expect(writeText).toHaveBeenCalledWith(ADDRESS);
    expect(
      await screen.findByRole("button", { name: messages.integration.copied }),
    ).toBeInTheDocument();
  });

  it("copies the full value even when a shorter label is rendered", async () => {
    const user = userEvent.setup();
    const writeText = stubClipboard(() => Promise.resolve());

    render(<CopyValue label="0x6c5c…ebd5" value={ADDRESS} />);
    await user.click(screen.getByRole("button"));

    expect(writeText).toHaveBeenCalledWith(ADDRESS);
  });

  it("stays in its idle state when the clipboard is unavailable", async () => {
    const user = userEvent.setup();
    stubClipboard(() => Promise.reject(new Error("denied")));

    render(<CopyValue value={ADDRESS} />);
    await user.click(screen.getByRole("button"));

    expect(
      screen.getByRole("button", {
        name: `${messages.integration.copy} ${ADDRESS}`,
      }),
    ).toBeInTheDocument();
  });
});

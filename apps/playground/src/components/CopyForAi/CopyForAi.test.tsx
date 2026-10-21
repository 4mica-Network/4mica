import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { messages } from "@/i18n";
import { CopyForAi } from ".";

const stubClipboard = (writeText: () => Promise<void>) => {
  const spy = vi.fn(writeText);

  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: spy },
  });

  return spy;
};

const open = async (
  writeText: () => Promise<void> = () => Promise.resolve(),
) => {
  const user = userEvent.setup();
  const spy = stubClipboard(writeText);
  render(<CopyForAi markdown="# Credit Limits API" prompt="Integrate it" />);
  await user.click(screen.getByRole("button", { name: messages.ai.trigger }));
  return { user, spy };
};

describe("CopyForAi", () => {
  it("offers both hand-offs in a menu", async () => {
    await open();

    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: messages.ai.markdown }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: messages.ai.prompt }),
    ).toBeInTheDocument();
  });

  it.each([
    [messages.ai.markdown, "# Credit Limits API"],
    [messages.ai.prompt, "Integrate it"],
  ])("%s copies its own text and confirms", async (label, expected) => {
    const { user, spy } = await open();

    await user.click(screen.getByRole("menuitem", { name: label }));

    expect(spy).toHaveBeenCalledWith(expected);
    expect(
      await screen.findByRole("menuitem", { name: messages.ai.copied }),
    ).toBeInTheDocument();
  });

  it("claims nothing when the clipboard is unavailable", async () => {
    const { user } = await open(() => Promise.reject(new Error("denied")));

    await user.click(
      screen.getByRole("menuitem", { name: messages.ai.markdown }),
    );

    expect(
      screen.queryByRole("menuitem", { name: messages.ai.copied }),
    ).not.toBeInTheDocument();
  });
});

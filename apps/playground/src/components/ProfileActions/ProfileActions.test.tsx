import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { messages } from "@/i18n";
import { ProfileActions } from ".";

const URL = "https://4mica.io/ada";

const stubClipboard = (writeText: () => Promise<void>) => {
  const spy = vi.fn(writeText);

  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: spy },
  });

  return spy;
};

const stubShare = (share: (() => Promise<void>) | undefined) => {
  Object.defineProperty(navigator, "share", {
    configurable: true,
    value: share && vi.fn(share),
  });

  return navigator.share as ReturnType<typeof vi.fn> | undefined;
};

describe("ProfileActions", () => {
  afterEach(() => {
    stubShare(undefined);
  });

  it("copies the profile link and confirms it", async () => {
    const user = userEvent.setup();
    const writeText = stubClipboard(() => Promise.resolve());

    render(<ProfileActions title="Ada" url={URL} />);
    await user.click(
      screen.getByRole("button", { name: messages.profile.copyLink }),
    );

    expect(writeText).toHaveBeenCalledWith(URL);
    expect(
      await screen.findByRole("button", { name: messages.profile.linkCopied }),
    ).toBeInTheDocument();
  });

  it("shares through the native sheet when the browser has one", async () => {
    const user = userEvent.setup();
    const share = stubShare(() => Promise.resolve());

    render(<ProfileActions title="Ada" url={URL} />);
    await user.click(
      screen.getByRole("button", { name: messages.profile.share }),
    );

    expect(share).toHaveBeenCalledWith({ title: "Ada", url: URL });
    expect(
      await screen.findByRole("button", { name: messages.profile.shared }),
    ).toBeInTheDocument();
  });

  it("falls back to copying the link without a native share sheet", async () => {
    const user = userEvent.setup();
    const writeText = stubClipboard(() => Promise.resolve());
    stubShare(undefined);

    render(<ProfileActions title="Ada" url={URL} />);
    await user.click(
      screen.getByRole("button", { name: messages.profile.share }),
    );

    expect(writeText).toHaveBeenCalledWith(URL);
    expect(
      await screen.findByRole("button", { name: messages.profile.linkCopied }),
    ).toBeInTheDocument();
  });

  it("claims nothing when the clipboard is unavailable", async () => {
    const user = userEvent.setup();
    stubClipboard(() => Promise.reject(new Error("denied")));

    render(<ProfileActions title="Ada" url={URL} />);
    await user.click(
      screen.getByRole("button", { name: messages.profile.copyLink }),
    );

    expect(
      screen.queryByRole("button", { name: messages.profile.linkCopied }),
    ).not.toBeInTheDocument();
  });
});

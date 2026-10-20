import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { messages } from "@/i18n";
import { ProfileContact } from ".";

const EMAIL = "ada@4mica.io";
const PHONE = "+15550100";

const stubClipboard = () => {
  const spy = vi.fn(() => Promise.resolve());

  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: spy },
  });

  return spy;
};

describe("ProfileContact", () => {
  it("copies the email instead of showing it", async () => {
    const user = userEvent.setup();
    const writeText = stubClipboard();

    render(
      <ProfileContact email={EMAIL} emailVerified={true} phoneNumber={null} />,
    );

    expect(screen.queryByText(EMAIL)).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", {
        name: messages.profile.copyVerifiedEmail,
      }),
    );

    expect(writeText).toHaveBeenCalledWith(EMAIL);
    expect(
      await screen.findByRole("button", { name: messages.profile.emailCopied }),
    ).toBeInTheDocument();
  });

  it("copies the phone number", async () => {
    const user = userEvent.setup();
    const writeText = stubClipboard();

    render(
      <ProfileContact email={null} emailVerified={false} phoneNumber={PHONE} />,
    );

    await user.click(
      screen.getByRole("button", { name: messages.profile.copyPhone }),
    );

    expect(writeText).toHaveBeenCalledWith(PHONE);
    expect(
      await screen.findByRole("button", { name: messages.profile.phoneCopied }),
    ).toBeInTheDocument();
  });

  it("names a verified email for screen readers", () => {
    const { rerender } = render(
      <ProfileContact email={EMAIL} emailVerified={true} phoneNumber={null} />,
    );

    expect(
      screen.getByRole("button", { name: messages.profile.copyVerifiedEmail }),
    ).toBeInTheDocument();

    rerender(
      <ProfileContact email={EMAIL} emailVerified={false} phoneNumber={null} />,
    );

    expect(
      screen.getByRole("button", { name: messages.profile.copyEmail }),
    ).toBeInTheDocument();
  });

  it("renders nothing without any public contact", () => {
    const { container } = render(
      <ProfileContact email={null} emailVerified={false} phoneNumber={null} />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});

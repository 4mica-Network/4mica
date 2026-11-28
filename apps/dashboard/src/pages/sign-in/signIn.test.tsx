import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "@/i18n";

const { getPublicInvitationPreview } = vi.hoisted(() => ({
  getPublicInvitationPreview: vi.fn(),
}));

vi.mock("@api/organization", () => ({ getPublicInvitationPreview }));

vi.mock("@clerk/clerk-react", () => ({
  useAuth: () => ({ isSignedIn: false }),
  useSignIn: () => ({
    isLoaded: true,
    signIn: { authenticateWithRedirect: vi.fn() },
  }),
}));

vi.mock("@clerk/clerk-react/errors", () => ({
  isClerkAPIResponseError: () => false,
}));

const { SignInPage } = await import("./index");

const TOKEN = "4mica_inv_abcdefghijklmnopqrstuvwxyz0123456789";

const renderAt = (redirect: string | null) =>
  render(
    <MemoryRouter
      initialEntries={[
        redirect === null
          ? "/sign-in"
          : `/sign-in?redirect_url=${encodeURIComponent(redirect)}`,
      ]}
    >
      <SignInPage />
    </MemoryRouter>,
  );

const google = () =>
  screen.getByRole("button", { name: /Continue with Google/ });

describe("sign-in from an invitation", () => {
  beforeEach(() => {
    getPublicInvitationPreview.mockReset();
  });

  it("says who invited them, where, and which address to use", async () => {
    getPublicInvitationPreview.mockResolvedValue({
      organization: { name: "Acme", avatarUrl: null },
      invitedBy: { name: "Grace Hopper" },
      emailHint: "a***@example.com",
      expiresAt: "2026-12-01T00:00:00.000Z",
    });
    renderAt(`/invitations/${TOKEN}`);

    const context = await screen.findByTestId("sign-in-invitation");

    expect(getPublicInvitationPreview).toHaveBeenCalledWith(TOKEN);
    expect(context).toHaveTextContent(
      "Grace Hopper invited you to join Acme on 4Mica. Sign in with Google using a***@example.com to accept.",
    );
    expect(
      context.compareDocumentPosition(google()) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("leaves the inviter out when there is none", async () => {
    getPublicInvitationPreview.mockResolvedValue({
      organization: { name: "Acme", avatarUrl: null },
      invitedBy: null,
      emailHint: "a***@example.com",
      expiresAt: "2026-12-01T00:00:00.000Z",
    });
    renderAt(`/invitations/${TOKEN}`);

    expect(await screen.findByTestId("sign-in-invitation")).toHaveTextContent(
      "You've been invited to join Acme on 4Mica.",
    );
  });

  it("falls back to the plain sign-in page when the preview fails", async () => {
    getPublicInvitationPreview.mockRejectedValue(new Error("gone"));
    renderAt(`/invitations/${TOKEN}`);

    await vi.waitFor(() =>
      expect(getPublicInvitationPreview).toHaveBeenCalled(),
    );
    expect(screen.queryByTestId("sign-in-invitation")).toBeNull();
    expect(google()).toBeEnabled();
  });

  it.each([
    null,
    "/payments",
    "/invitations/not-a-token",
  ])("does not look anything up for %s", (redirect) => {
    renderAt(redirect);

    expect(getPublicInvitationPreview).not.toHaveBeenCalled();
    expect(google()).toBeInTheDocument();
  });
});

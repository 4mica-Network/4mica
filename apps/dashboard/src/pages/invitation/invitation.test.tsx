import { INITIAL_STATE as ORGANIZATION_INITIAL_STATE } from "@stores/organization/reducer";
import type { InvitationState } from "@stores/organization/type";
import { fireEvent, render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { createStore } from "redux";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "@/i18n";

const { signOut } = vi.hoisted(() => ({ signOut: vi.fn() }));

vi.mock("@clerk/clerk-react", () => ({
  useClerk: () => ({ signOut }),
}));

const { InvitationPage } = await import("./index");

const TOKEN = "4mica_inv_abcdefghijklmnopqrstuvwxyz0123456789";

const PREVIEW = {
  organization: { id: "acme", name: "Acme", handle: "acme", avatarUrl: null },
  email: "grace@example.com",
  role: "DEVELOPER" as const,
  invitedBy: { name: "Ada" },
  expiresAt: "2026-12-01T00:00:00.000Z",
};

const renderWith = (invitation: Partial<InvitationState>) => {
  const state = {
    organization: {
      ...ORGANIZATION_INITIAL_STATE,
      invitation: {
        ...ORGANIZATION_INITIAL_STATE.invitation,
        token: TOKEN,
        ...invitation,
      },
    },
  };
  return render(
    <Provider store={createStore(() => state)}>
      <MemoryRouter initialEntries={[`/invitations/${TOKEN}`]}>
        <Routes>
          <Route path="/invitations/:token" element={<InvitationPage />} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  );
};

describe("invitation sent to another address", () => {
  beforeEach(() => {
    signOut.mockReset();
  });

  it("names the invited address and the Google account to use", () => {
    renderWith({
      status: "failed",
      errorCode: "invitation_email_mismatch",
      preview: PREVIEW,
    });

    expect(
      screen.getByTestId("invitation-invitation_email_mismatch"),
    ).toHaveTextContent(
      "This invitation was sent to grace@example.com. To accept it, sign in with that Google account.",
    );
  });

  it("signs out and comes back to the same invitation", () => {
    renderWith({
      status: "failed",
      errorCode: "invitation_email_mismatch",
      preview: PREVIEW,
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Sign out and use another account" }),
    );

    expect(signOut).toHaveBeenCalledWith({
      redirectUrl: `/invitations/${TOKEN}`,
    });
  });

  it("keeps the generic explanation without a preview", () => {
    renderWith({ status: "failed", errorCode: "invitation_email_mismatch" });

    expect(
      screen.getByTestId("invitation-invitation_email_mismatch"),
    ).toHaveTextContent("Sign in with the address the invitation was sent to");
    expect(
      screen.getByRole("button", { name: "Sign out and use another account" }),
    ).toBeInTheDocument();
  });

  it("offers no account switch for other failures", () => {
    renderWith({ status: "failed", errorCode: "invitation_unavailable" });

    expect(
      screen.queryByRole("button", {
        name: "Sign out and use another account",
      }),
    ).toBeNull();
  });
});

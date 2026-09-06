import { INITIAL_STATE } from "@stores/user/reducer";
import type { User } from "@stores/user/type";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "@/i18n";

const { notifySuccess, notifyError } = vi.hoisted(() => ({
  notifySuccess: vi.fn(),
  notifyError: vi.fn(),
}));
vi.mock("@utils/notification", () => ({ notifySuccess, notifyError }));

const { ProfileSettings } = await import("./index");
const actionTypes = (await import("@stores/user/actionTypes")).default;

const BASE_USER = {
  name: "Ada Lovelace",
  username: "ada",
  bio: "",
  description: "",
  primaryBrandColor: "",
  secondaryBrandColor: "",
  verified: false,
  emailVerified: false,
  private: true,
  hidden: false,
  allowSEOIndexing: false,
  allowEmailVisibility: true,
  allowPhoneNumberVisibility: true,
  allowCustomBrandColor: false,
  disableBranding: false,
} as unknown as User;

const renderPage = (
  user: Partial<User>,
  { path = "/settings/profile", saving = false } = {},
) => {
  const dispatched: { type: string }[] = [];
  const state = {
    user: {
      ...INITIAL_STATE,
      user: { ...BASE_USER, ...user },
      savingSections: saving ? { emailVerification: true } : {},
    },
    developer: {},
    banner: {},
  };

  const store = {
    getState: () => state,
    subscribe: () => () => {},
    dispatch: (action: { type: string }) => {
      dispatched.push(action);
      return action;
    },
  };

  render(
    // biome-ignore lint/suspicious/noExplicitAny: a minimal store stub, deliberately not a full redux Store.
    <Provider store={store as any}>
      <MemoryRouter initialEntries={[path]}>
        <ProfileSettings />
      </MemoryRouter>
    </Provider>,
  );

  return dispatched;
};

describe("profile account status", () => {
  beforeEach(() => {
    notifySuccess.mockReset();
    notifyError.mockReset();
  });

  it("offers a way to act while the address is unverified", async () => {
    const dispatched = renderPage({ emailVerified: false });

    const button = screen.getByRole("button", { name: "Verify email" });
    expect(screen.queryByText("Unverified")).not.toBeInTheDocument();

    await userEvent.click(button);

    expect(dispatched.map((a) => a.type)).toContain(
      actionTypes.SEND_EMAIL_VERIFICATION_REQUESTED,
    );
  });

  it("shows the badge, and no button, once verified", () => {
    renderPage({ emailVerified: true });

    expect(screen.getByText("Verified")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Verify email" }),
    ).not.toBeInTheDocument();
  });

  it("reads email verification, not the separate account-verified flag", () => {
    renderPage({ verified: true, emailVerified: false });

    expect(screen.queryByText("Verified")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Verify email" }),
    ).toBeInTheDocument();
  });

  it("disables the button while the send is in flight", () => {
    renderPage({ emailVerified: false }, { saving: true });

    expect(screen.getByRole("button", { name: "Verify email" })).toBeDisabled();
  });

  it("reports the outcome carried back from the verification link", () => {
    renderPage(
      { emailVerified: true },
      { path: "/settings/profile?verify=success" },
    );

    expect(notifySuccess).toHaveBeenCalledTimes(1);
    expect(notifyError).not.toHaveBeenCalled();
  });

  it("reports a link that did not work", () => {
    renderPage(
      { emailVerified: false },
      { path: "/settings/profile?verify=expired" },
    );

    expect(notifyError).toHaveBeenCalledTimes(1);
    expect(notifySuccess).not.toHaveBeenCalled();
  });

  it("stays quiet on a normal visit", () => {
    renderPage({ emailVerified: true });

    expect(notifySuccess).not.toHaveBeenCalled();
    expect(notifyError).not.toHaveBeenCalled();
  });
});

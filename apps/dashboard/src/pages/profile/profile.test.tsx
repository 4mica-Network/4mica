import { INITIAL_STATE } from "@stores/user/reducer";
import type { User } from "@stores/user/type";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "@/i18n";

const { notifySuccess, notifyError } = vi.hoisted(() => ({
  notifySuccess: vi.fn(),
  notifyError: vi.fn(),
}));
vi.mock("@/lib/notify", () => ({ notifySuccess, notifyError }));

const { ProfileSettings } = await import("./index");
const actionTypes = (await import("@stores/user/actionTypes")).default;

const BASE_USER = {
  name: "Ada Lovelace",
  username: "ada",
  bio: "",
  primaryBrandColor: "",
  secondaryBrandColor: "",
  verified: false,
  emailVerified: false,
  private: true,
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

const statusCard = () =>
  within(
    screen.getByText("Account status").parentElement
      ?.parentElement as HTMLElement,
  );

describe("profile account status", () => {
  beforeEach(() => {
    notifySuccess.mockReset();
    notifyError.mockReset();
  });

  it("offers a way to act while the address is unverified", async () => {
    const dispatched = renderPage({ emailVerified: false });

    const button = screen.getByRole("button", { name: "Verify email" });
    expect(statusCard().queryByText("Unverified")).not.toBeInTheDocument();

    await userEvent.click(button);

    expect(dispatched.map((a) => a.type)).toContain(
      actionTypes.SEND_EMAIL_VERIFICATION_REQUESTED,
    );
  });

  it("shows the badge, and no button, once verified", () => {
    renderPage({ emailVerified: true });

    expect(statusCard().getByText("Verified")).toBeInTheDocument();
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

  it("asks before spending a link, so a page load alone verifies nothing", async () => {
    const dispatched = renderPage(
      { emailVerified: false },
      { path: "/settings/profile?verifyToken=4mica_ev_good" },
    );

    expect(dispatched.map((a) => a.type)).not.toContain(
      actionTypes.CONFIRM_EMAIL_VERIFICATION_REQUESTED,
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Confirm email" }),
    );

    expect(dispatched).toContainEqual(
      expect.objectContaining({
        type: actionTypes.CONFIRM_EMAIL_VERIFICATION_REQUESTED,
        payload: "4mica_ev_good",
      }),
    );
  });

  it("shows no confirmation prompt without a link token", () => {
    renderPage({ emailVerified: false });

    expect(
      screen.queryByRole("button", { name: "Confirm email" }),
    ).not.toBeInTheDocument();
  });
});

describe("profile visibility", () => {
  it("hides the email toggle until the address is verified", () => {
    renderPage({ emailVerified: false });

    expect(
      screen.queryByText("Show email on public profile"),
    ).not.toBeInTheDocument();
  });

  it("offers the email toggle once the address is verified", () => {
    renderPage({ emailVerified: true });

    expect(
      screen.getByText("Show email on public profile"),
    ).toBeInTheDocument();
  });

  it("no longer offers a discovery toggle or a description field", () => {
    renderPage({ emailVerified: true });

    expect(screen.queryByText("Hide from discovery")).not.toBeInTheDocument();
    expect(screen.queryByText("Description")).not.toBeInTheDocument();
  });
});

describe("profile credentials", () => {
  it("edits the sign-in email and phone number here", () => {
    renderPage({ email: "ada@4mica.io", phoneNumber: "+15550100" });

    expect(screen.getByText("Contact details")).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i, { selector: "input" })).toHaveValue(
      "ada@4mica.io",
    );
    expect(screen.getByLabelText(/phone/i, { selector: "input" })).toHaveValue(
      "+15550100",
    );
  });
});

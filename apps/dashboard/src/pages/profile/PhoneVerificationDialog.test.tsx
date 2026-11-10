import { INITIAL_STATE } from "@stores/user/reducer";
import type { User } from "@stores/user/type";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "@/i18n";

const { useUser } = vi.hoisted(() => ({ useUser: vi.fn() }));

vi.mock("@clerk/clerk-react", () => ({ useUser }));
vi.mock("@clerk/clerk-react/errors", () => ({
  isClerkAPIResponseError: (error: { clerk?: boolean }) =>
    Boolean(error?.clerk),
}));

const { PhoneVerificationDialog } = await import("./PhoneVerificationDialog");
const actionTypes = (await import("@stores/user/actionTypes")).default;

const PHONE = "+15550100123";

const clerkPhone = (status: string) => ({
  phoneNumber: PHONE,
  verification: { status },
  prepareVerification: vi.fn(async () => ({})),
  attemptVerification: vi.fn(async () => ({
    verification: { status: "verified" },
  })),
});

const renderDialog = (clerkUser: Record<string, unknown>) => {
  useUser.mockReturnValue({ user: clerkUser });
  const dispatched: { type: string }[] = [];
  const state = {
    user: {
      ...INITIAL_STATE,
      user: { phoneNumberVerified: false } as User,
      savingSections: {},
    },
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
      <PhoneVerificationDialog isOpen onClose={() => {}} phoneNumber={PHONE} />
    </Provider>,
  );

  return dispatched;
};

describe("PhoneVerificationDialog", () => {
  beforeEach(() => {
    useUser.mockReset();
  });

  it("adds the number to Clerk and texts a code", async () => {
    const phone = clerkPhone("unverified");
    const createPhoneNumber = vi.fn(async () => phone);
    renderDialog({ phoneNumbers: [], createPhoneNumber, reload: vi.fn() });

    await userEvent.click(screen.getByRole("button", { name: "Send code" }));

    expect(createPhoneNumber).toHaveBeenCalledWith({ phoneNumber: PHONE });
    expect(phone.prepareVerification).toHaveBeenCalled();
    expect(
      await screen.findByLabelText("Verification code"),
    ).toBeInTheDocument();
  });

  it("asks the backend to record it once the code is right", async () => {
    const phone = clerkPhone("unverified");
    const reload = vi.fn(async () => {});
    const dispatched = renderDialog({
      phoneNumbers: [phone],
      createPhoneNumber: vi.fn(),
      reload,
    });

    await userEvent.click(screen.getByRole("button", { name: "Send code" }));
    await userEvent.type(
      await screen.findByLabelText("Verification code"),
      "424242",
    );
    await userEvent.click(screen.getByRole("button", { name: "Verify" }));

    expect(phone.attemptVerification).toHaveBeenCalledWith({ code: "424242" });
    expect(reload).toHaveBeenCalled();
    expect(dispatched.map((a) => a.type)).toContain(
      actionTypes.SYNC_PHONE_VERIFICATION_REQUESTED,
    );
  });

  it("skips the text when Clerk already verified the number", async () => {
    const phone = clerkPhone("verified");
    const dispatched = renderDialog({
      phoneNumbers: [phone],
      createPhoneNumber: vi.fn(),
      reload: vi.fn(),
    });

    await userEvent.click(screen.getByRole("button", { name: "Send code" }));

    expect(phone.prepareVerification).not.toHaveBeenCalled();
    expect(dispatched.map((a) => a.type)).toContain(
      actionTypes.SYNC_PHONE_VERIFICATION_REQUESTED,
    );
  });

  it("shows Clerk's reason when a code is wrong", async () => {
    const phone = clerkPhone("unverified");
    phone.attemptVerification.mockRejectedValue({
      clerk: true,
      errors: [{ message: "Incorrect code", longMessage: "Incorrect code." }],
    });
    const dispatched = renderDialog({
      phoneNumbers: [phone],
      createPhoneNumber: vi.fn(),
      reload: vi.fn(),
    });

    await userEvent.click(screen.getByRole("button", { name: "Send code" }));
    await userEvent.type(
      await screen.findByLabelText("Verification code"),
      "000000",
    );
    await userEvent.click(screen.getByRole("button", { name: "Verify" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Incorrect code.",
    );
    expect(dispatched.map((a) => a.type)).not.toContain(
      actionTypes.SYNC_PHONE_VERIFICATION_REQUESTED,
    );
  });
});

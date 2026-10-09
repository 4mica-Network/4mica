import { HttpError } from "@4mica/http";
import { runSaga } from "redux-saga";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  upsertBusiness,
  updateAccount,
  checkUsernameAvailability,
  sendEmailVerificationRequest,
  confirmEmailVerificationRequest,
} = vi.hoisted(() => ({
  upsertBusiness: vi.fn(),
  updateAccount: vi.fn(),
  checkUsernameAvailability: vi.fn(),
  sendEmailVerificationRequest: vi.fn(),
  confirmEmailVerificationRequest: vi.fn(),
}));

vi.mock("@api/user", () => ({
  getMe: vi.fn(),
  updateProfile: vi.fn(),
  updateNotifications: vi.fn(),
  updateAccount,
  upsertBusiness,
  checkUsernameAvailability,
  sendEmailVerification: sendEmailVerificationRequest,
  confirmEmailVerification: confirmEmailVerificationRequest,
}));

const { notifyError, notifySuccess } = vi.hoisted(() => ({
  notifyError: vi.fn(),
  notifySuccess: vi.fn(),
}));
vi.mock("@/lib/notify", () => ({ notifyError, notifySuccess }));

const {
  checkUsername,
  completeOnboarding,
  confirmEmailVerification,
  sendEmailVerification,
} = await import("./saga");
const actionTypes = (await import("./actionTypes")).default;

interface Dispatched {
  type: string;
  meta?: { section: string };
}

/**
 * Runs a saga through redux-saga's own runtime rather than stepping the
 * generator by hand, so `call` rejection, `select` and `put` behave exactly as
 * they do under the store's middleware.
 */
const record = async <TArgs extends unknown[]>(
  saga: (...args: TArgs) => Generator,
  ...args: TArgs
): Promise<Dispatched[]> => {
  const dispatched: Dispatched[] = [];

  await runSaga(
    {
      dispatch: (action: Dispatched) => dispatched.push(action),
      getState: () => ({ user: { user: null } }),
    },
    saga as (...a: TArgs) => Generator,
    ...args,
  ).toPromise();

  return dispatched;
};

const types = (dispatched: Dispatched[]) => dispatched.map((a) => a.type);

describe("completeOnboarding saga", () => {
  beforeEach(() => {
    upsertBusiness.mockReset();
    updateAccount.mockReset();
    notifyError.mockReset();
  });

  const action = {
    type: actionTypes.COMPLETE_ONBOARDING_REQUESTED,
    payload: { legalName: "Analytical Engines Ltd" },
    meta: { section: "onboarding.business" },
  };

  it("writes the business before flipping the flag", async () => {
    upsertBusiness.mockResolvedValue({ legalName: "Analytical Engines Ltd" });
    updateAccount.mockResolvedValue({ completeOnboarding: true });

    const dispatched = await record(completeOnboarding, action);

    expect(upsertBusiness).toHaveBeenCalledWith({
      legalName: "Analytical Engines Ltd",
    });
    expect(updateAccount).toHaveBeenCalledWith({ completeOnboarding: true });
    expect(types(dispatched)).toEqual([
      actionTypes.UPDATE_BUSINESS_SUCCEEDED,
      actionTypes.UPDATE_USER_SUCCEEDED,
    ]);
  });

  it("never marks the account onboarded when the business write fails", async () => {
    // Otherwise a failed entity write leaves an account that looks set up but
    // has nothing to pay out to.
    upsertBusiness.mockRejectedValue(new Error("boom"));

    const dispatched = await record(completeOnboarding, action);

    expect(updateAccount).not.toHaveBeenCalled();
    expect(types(dispatched)).toEqual([actionTypes.UPDATE_BUSINESS_FAILED]);
  });

  it("reports the flag write separately when only that fails", async () => {
    upsertBusiness.mockResolvedValue({ legalName: "Analytical Engines Ltd" });
    updateAccount.mockRejectedValue(new Error("boom"));

    const dispatched = await record(completeOnboarding, action);

    expect(types(dispatched)).toEqual([
      actionTypes.UPDATE_BUSINESS_SUCCEEDED,
      actionTypes.UPDATE_USER_FAILED,
    ]);
    // The business did land, so its own section must not be left spinning.
    expect(dispatched[1].meta?.section).toBe("onboarding.complete");
  });
});

describe("checkUsername saga", () => {
  beforeEach(() => {
    checkUsernameAvailability.mockReset();
    notifyError.mockReset();
  });

  const action = {
    type: actionTypes.CHECK_USERNAME_REQUESTED,
    payload: "ada",
  };

  it("forwards the server's verdict", async () => {
    checkUsernameAvailability.mockResolvedValue({
      username: "ada",
      available: false,
      reason: "taken",
    });

    const dispatched = await record(checkUsername, action);

    expect(types(dispatched)).toEqual([actionTypes.CHECK_USERNAME_SUCCEEDED]);
  });

  it("fails quietly, without a toast", async () => {
    // The probe is advisory — a 429 from the sensitive limiter must not raise
    // an error toast on every other keystroke.
    checkUsernameAvailability.mockRejectedValue(new Error("429"));

    const dispatched = await record(checkUsername, action);

    expect(types(dispatched)).toEqual([actionTypes.CHECK_USERNAME_FAILED]);
    expect(notifyError).not.toHaveBeenCalled();
  });
});

describe("sendEmailVerification saga", () => {
  beforeEach(() => {
    sendEmailVerificationRequest.mockReset();
    notifySuccess.mockReset();
    notifyError.mockReset();
  });

  const action = {
    type: actionTypes.SEND_EMAIL_VERIFICATION_REQUESTED,
    meta: { section: "emailVerification" },
  };

  it("tells the user to check their inbox", async () => {
    sendEmailVerificationRequest.mockResolvedValue({ sent: true });

    const dispatched = await record(sendEmailVerification, action);

    expect(types(dispatched)).toEqual([
      actionTypes.SEND_EMAIL_VERIFICATION_SUCCEEDED,
    ]);
    expect(notifySuccess).toHaveBeenCalledTimes(1);
    expect(notifyError).not.toHaveBeenCalled();
  });

  it("surfaces the server's reason when the send is refused", async () => {
    sendEmailVerificationRequest.mockRejectedValue(new Error("boom"));

    const dispatched = await record(sendEmailVerification, action);

    expect(types(dispatched)).toEqual([
      actionTypes.SEND_EMAIL_VERIFICATION_FAILED,
    ]);
    expect(notifyError).toHaveBeenCalledTimes(1);
    expect(notifySuccess).not.toHaveBeenCalled();
  });
});

describe("confirmEmailVerification saga", () => {
  beforeEach(() => {
    confirmEmailVerificationRequest.mockReset();
    notifySuccess.mockReset();
    notifyError.mockReset();
  });

  const action = {
    type: actionTypes.CONFIRM_EMAIL_VERIFICATION_REQUESTED,
    payload: "4mica_ev_good",
    meta: { section: "emailVerification" },
  };

  it("stores the refreshed user once the link is spent", async () => {
    confirmEmailVerificationRequest.mockResolvedValue({ id: "u1" });

    const dispatched = await record(confirmEmailVerification, action);

    expect(confirmEmailVerificationRequest).toHaveBeenCalledWith(
      "4mica_ev_good",
    );
    expect(types(dispatched)).toEqual([actionTypes.UPDATE_USER_SUCCEEDED]);
    expect(notifySuccess).toHaveBeenCalledTimes(1);
  });

  it("explains an address that another account already holds", async () => {
    confirmEmailVerificationRequest.mockRejectedValue(
      new HttpError(409, "Conflict", { error: "email_taken" }),
    );

    const dispatched = await record(confirmEmailVerification, action);

    expect(types(dispatched)).toEqual([
      actionTypes.SEND_EMAIL_VERIFICATION_FAILED,
    ]);
    expect(notifyError.mock.calls[0][0].title).toBe("That address is in use");
  });

  it("falls back to the generic message for an unexpected failure", async () => {
    confirmEmailVerificationRequest.mockRejectedValue(new Error("offline"));

    await record(confirmEmailVerification, action);

    expect(notifyError.mock.calls[0][0].title).toBe("That link didn't work");
  });
});

import { Avatar } from "@4mica/ui";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { runSaga } from "redux-saga";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@/i18n";

const mocks = vi.hoisted(() => ({
  getWallets: vi.fn(),
  createSupportRequest: vi.fn(),
  copy: vi.fn(),
  dispatch: vi.fn(),
  config: { isLoading: false, supportCategories: [] as string[] },
  signIn: { isLoaded: false, authenticateWithRedirect: vi.fn() },
}));

vi.mock("@api/wallet", () => ({ getWallets: mocks.getWallets }));
vi.mock("@api/support", () => ({
  createSupportRequest: mocks.createSupportRequest,
}));
vi.mock("@/lib/notify", () => ({
  notifyError: vi.fn(),
  notifySuccess: vi.fn(),
}));
vi.mock("@4mica/ui/hooks", () => ({
  useCopyToClipboard: () => ({ copied: false, copy: mocks.copy }),
}));
vi.mock("@stores/hooks", () => ({
  useAppDispatch: () => mocks.dispatch,
  useAppSelector: (selector: (s: unknown) => unknown) =>
    selector({
      config: {
        config: { supportCategories: mocks.config.supportCategories },
        isLoading: mocks.config.isLoading,
      },
    }),
}));
vi.mock("@/hooks/useConfigOptions", () => ({
  useConfigList: () => mocks.config.supportCategories,
}));
vi.mock("react-hook-form", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useController: () => ({
    field: { name: "category", value: "", onChange: vi.fn() },
    fieldState: {},
  }),
}));
vi.mock("@clerk/clerk-react", () => ({
  useSignIn: () => ({
    isLoaded: mocks.signIn.isLoaded,
    signIn: { authenticateWithRedirect: mocks.signIn.authenticateWithRedirect },
  }),
  useAuth: () => ({ isSignedIn: false }),
}));
vi.mock("@clerk/clerk-react/errors", () => ({
  isClerkAPIResponseError: () => false,
}));

const { fetchWallets } = await import("@stores/wallet/saga");
const { createSupportRequest } = await import("@stores/support/saga");
const { CategoryPicker } = await import("@/pages/help/CategoryPicker");
const { SecretRevealCard } = await import("@/components/RevealedSecret");
const { SignInPage } = await import("@/pages/sign-in");
const { SLOW_LOAD_MS } = await import("@/auth/FullScreenLoader");
const { MemoryRouter } = await import("react-router-dom");

const run = async (
  saga: (...args: never[]) => Generator,
  ...args: unknown[]
) => {
  const dispatched: { type: string; payload?: { message?: string } }[] = [];
  await runSaga(
    {
      dispatch: (action: { type: string }) => dispatched.push(action),
      getState: () => ({
        wallet: { filters: {}, page: 1, limit: 20 },
      }),
    },
    saga as (...a: unknown[]) => Generator,
    ...args,
  ).toPromise();
  return dispatched;
};

afterEach(() => {
  vi.useRealTimers();
});

describe("connection failures in wallet and support", () => {
  beforeEach(() => {
    mocks.getWallets.mockReset();
    mocks.createSupportRequest.mockReset();
  });

  it("tells the user to check their connection when wallets can't load", async () => {
    mocks.getWallets.mockRejectedValue(new TypeError("Failed to fetch"));

    const [, failure] = await run(fetchWallets);

    expect(failure.payload?.message).toBe(
      "Couldn't load your wallets. Check your connection and try again.",
    );
  });

  it("tells the user to check their connection when a support request can't be sent", async () => {
    mocks.createSupportRequest.mockRejectedValue(
      new TypeError("Failed to fetch"),
    );

    const [failure] = await run(createSupportRequest, {
      type: "",
      payload: { subject: "s", body: "b", category: "ACCOUNT" },
      meta: { pendingKey: "createSupportRequest" },
    });

    expect(failure.payload?.message).toContain(
      "Check your connection and try again.",
    );
  });
});

describe("reference data that failed to load", () => {
  it("explains why no request type can be picked and offers a retry", () => {
    mocks.config.supportCategories = [];
    mocks.dispatch.mockClear();
    render(<CategoryPicker />);

    expect(screen.getByTestId("help-categories-unavailable")).toHaveTextContent(
      "Request types didn't load",
    );
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(mocks.dispatch).toHaveBeenCalledWith({
      type: "FETCH_CONFIG_REQUESTED",
    });
  });
});

describe("copying a one-time secret", () => {
  it("says so when the copy fails, so the secret isn't lost", async () => {
    mocks.copy.mockResolvedValue(false);
    render(
      <SecretRevealCard
        title="New key"
        plaintext="4mica_sk_secret"
        onDismiss={() => {}}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /copy/i }));
    });

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Couldn't copy automatically",
    );
  });

  it("stays quiet when the copy works", async () => {
    mocks.copy.mockResolvedValue(true);
    render(
      <SecretRevealCard
        title="New key"
        plaintext="4mica_sk_secret"
        onDismiss={() => {}}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /copy/i }));
    });

    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("avatar image that fails to load", () => {
  it("reports the failure so the caller can fall back to initials", () => {
    const onError = vi.fn();
    const { container } = render(
      <Avatar
        src="https://img.example/broken.png"
        name="Ada"
        onError={onError}
      />,
    );

    fireEvent.error(container.querySelector("img") as HTMLImageElement);

    expect(onError).toHaveBeenCalledTimes(1);
  });
});

describe("sign-in page when the sign-in service is slow or down", () => {
  it("explains the delay instead of showing a dead button forever", () => {
    vi.useFakeTimers();
    mocks.signIn.isLoaded = false;
    render(
      <MemoryRouter>
        <SignInPage />
      </MemoryRouter>,
    );
    expect(screen.queryByText(/taking longer than usual/)).toBeNull();

    act(() => {
      vi.advanceTimersByTime(SLOW_LOAD_MS);
    });

    expect(screen.getByText(/taking longer than usual/)).toBeInTheDocument();
  });

  it("starts one sign-in however often the button is clicked", () => {
    mocks.signIn.isLoaded = true;
    mocks.signIn.authenticateWithRedirect.mockReset();
    mocks.signIn.authenticateWithRedirect.mockReturnValue(
      new Promise(() => {}),
    );
    render(
      <MemoryRouter>
        <SignInPage />
      </MemoryRouter>,
    );

    const button = screen.getByRole("button", { name: /google/i });
    fireEvent.click(button);
    fireEvent.click(button);
    fireEvent.click(button);

    expect(mocks.signIn.authenticateWithRedirect).toHaveBeenCalledTimes(1);
  });
});

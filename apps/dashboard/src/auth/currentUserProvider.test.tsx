import { render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  setAuthTokenProvider,
  setUnauthorizedHandler,
  resolveAuthToken,
  useAuth,
  signOut,
  dispatch,
} = vi.hoisted(() => {
  let provider: (() => Promise<string | null>) | null = null;
  return {
    setAuthTokenProvider: vi.fn((next: typeof provider) => {
      provider = next;
    }),
    setUnauthorizedHandler: vi.fn(),
    resolveAuthToken: vi.fn(async () => (provider ? provider() : null)),
    useAuth: vi.fn(),
    signOut: vi.fn(async () => undefined),
    dispatch: vi.fn(),
  };
});

vi.mock("@api/client", () => ({
  setAuthTokenProvider,
  setUnauthorizedHandler,
}));
vi.mock("@clerk/clerk-react", () => ({
  useAuth,
  useClerk: () => ({ signOut }),
}));
vi.mock("@stores/hooks", () => ({
  useAppDispatch: () => dispatch,
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({
      organization: { status: "loaded", activeId: "org_1" },
      project: {
        status: "loaded",
        activeId: "project_1",
        environment: "sandbox",
      },
    }),
}));
vi.mock("@stores/user/actions", () => ({
  fetchUser: () => ({ type: "FETCH_USER_REQUESTED" }),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const { CurrentUserProvider } = await import("./CurrentUserProvider");

function PageThatFetchesOnMount({
  record,
}: {
  record: (token: string | null) => void;
}) {
  useEffect(() => {
    void resolveAuthToken().then(record);
  }, [record]);

  return <div data-testid="page">page</div>;
}

describe("CurrentUserProvider", () => {
  beforeEach(() => {
    setAuthTokenProvider.mockClear();
    setUnauthorizedHandler.mockClear();
    signOut.mockClear();
    dispatch.mockClear();
    useAuth.mockReturnValue({
      isSignedIn: true,
      userId: "user_123",
      getToken: async () => "jwt-token",
    });
  });

  it("does not mount children until the auth token provider is installed", async () => {
    const seen: (string | null)[] = [];

    render(
      <CurrentUserProvider>
        <PageThatFetchesOnMount record={(token) => seen.push(token)} />
      </CurrentUserProvider>,
    );

    expect(await screen.findByTestId("page")).toBeInTheDocument();
    await vi.waitFor(() => {
      expect(seen).toHaveLength(1);
    });
    expect(seen[0]).toBe("jwt-token");
  });

  it("shows the loader instead of children while the token is not ready", () => {
    const { container } = render(
      <CurrentUserProvider>
        <div data-testid="page" />
      </CurrentUserProvider>,
    );

    expect(setAuthTokenProvider).toHaveBeenCalled();
    expect(container.querySelector("[data-testid='page']")).not.toBeNull();
  });

  it("signs out once, back to the current page, when the API rejects the session", () => {
    window.history.replaceState(null, "", "/payments?page=2");

    render(
      <CurrentUserProvider>
        <div />
      </CurrentUserProvider>,
    );

    const handler = setUnauthorizedHandler.mock.calls.at(-1)?.[0] as () => void;
    handler();
    handler();

    expect(signOut).toHaveBeenCalledTimes(1);
    expect(signOut).toHaveBeenCalledWith({
      redirectUrl: `/sign-in?redirect_url=${encodeURIComponent("/payments?page=2")}`,
    });
  });
});

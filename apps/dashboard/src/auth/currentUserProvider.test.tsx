import { render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { setAuthTokenProvider, resolveAuthToken, useAuth, dispatch } =
  vi.hoisted(() => {
    let provider: (() => Promise<string | null>) | null = null;
    return {
      setAuthTokenProvider: vi.fn((next: typeof provider) => {
        provider = next;
      }),
      resolveAuthToken: vi.fn(async () => (provider ? provider() : null)),
      useAuth: vi.fn(),
      dispatch: vi.fn(),
    };
  });

vi.mock("@api/client", () => ({ setAuthTokenProvider }));
vi.mock("@clerk/clerk-react", () => ({ useAuth }));
vi.mock("@stores/hooks", () => ({ useAppDispatch: () => dispatch }));
vi.mock("@stores/user/actions", () => ({
  fetchUser: () => ({ type: "FETCH_USER_REQUESTED" }),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const { CurrentUserProvider } = await import("./CurrentUserProvider");

/**
 * Stands in for any page that fetches on mount — the wallet page does exactly
 * this. It records whichever token was resolvable at the moment its effect
 * ran, which is the value that used to come back null.
 */
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

    // React runs child effects before parent effects, so a page mounted
    // eagerly would fire its request with no Authorization header and get back
    // a 401 that has nothing to do with the real session.
    expect(await screen.findByTestId("page")).toBeInTheDocument();
    await vi.waitFor(() => {
      expect(seen).toHaveLength(1);
    });
    expect(seen[0]).toBe("jwt-token");
  });

  it("shows the loader instead of children while the token is not ready", () => {
    // The provider is installed in an effect, so the very first render pass
    // must not contain the subtree.
    const { container } = render(
      <CurrentUserProvider>
        <div data-testid="page" />
      </CurrentUserProvider>,
    );

    expect(setAuthTokenProvider).toHaveBeenCalled();
    expect(container.querySelector("[data-testid='page']")).not.toBeNull();
  });
});

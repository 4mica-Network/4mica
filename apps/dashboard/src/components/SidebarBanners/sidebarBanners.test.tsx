import { INITIAL_STATE as BANNER_INITIAL_STATE } from "@stores/banner/reducer";
import type { Banner } from "@stores/banner/type";
import { INITIAL_STATE as USER_INITIAL_STATE } from "@stores/user/reducer";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "@/i18n";

const { useUser } = vi.hoisted(() => ({ useUser: vi.fn() }));

vi.mock("@clerk/clerk-react", () => ({
  useUser,
  useClerk: () => ({ signOut: vi.fn() }),
}));

const { SidebarBanners } = await import("./index");
const { Sidebar } = await import("../Sidebar");

const banner = (over: Partial<Banner> = {}): Banner => ({
  id: "ban_1",
  title: "Instant payouts",
  message: "Settle to your wallet the moment a payment clears.",
  url: "https://4mica.io",
  thumbnailUrl: null,
  videoUrl: null,
  alt: null,
  isVideo: false,
  ...over,
});

const makeStore = (banners: Banner[], user: unknown = { id: "usr_1" }) => {
  const dispatched: { type: string; payload?: unknown }[] = [];
  const state = {
    user: { ...USER_INITIAL_STATE, user },
    developer: {},
    banner: { ...BANNER_INITIAL_STATE, banners, hasLoaded: true },
  };
  return {
    dispatched,
    store: {
      getState: () => state,
      subscribe: () => () => {},
      dispatch: (action: { type: string; payload?: unknown }) => {
        dispatched.push(action);
        return action;
      },
    },
  };
};

const renderDeck = (banners: Banner[], user: unknown = { id: "usr_1" }) => {
  const { store, dispatched } = makeStore(banners, user);
  const view = render(
    // biome-ignore lint/suspicious/noExplicitAny: a minimal store stub, deliberately not a full redux Store.
    <Provider store={store as any}>
      <MemoryRouter>
        <SidebarBanners />
      </MemoryRouter>
    </Provider>,
  );
  return { ...view, dispatched };
};

describe("sidebar banners", () => {
  beforeEach(() => {
    localStorage.clear();
    useUser.mockReturnValue({ user: null });
  });

  // CurrentUserProvider registers the auth token provider in a mount effect, and
  // React runs child effects before parent ones. Fetching on bare mount sends the
  // request before any token exists, which 401s and leaves the deck empty.
  it("does not fetch before the user has loaded", () => {
    const { dispatched } = renderDeck([], null);

    expect(dispatched.some((a) => a.type === "FETCH_BANNERS_REQUESTED")).toBe(
      false,
    );
  });

  it("fetches once the user is present", () => {
    const { dispatched } = renderDeck([]);

    expect(dispatched.some((a) => a.type === "FETCH_BANNERS_REQUESTED")).toBe(
      true,
    );
  });

  it("renders a card per banner", () => {
    renderDeck([banner(), banner({ id: "ban_2", title: "Agent credit" })]);

    expect(screen.getByText("Instant payouts")).toBeInTheDocument();
    expect(screen.getByText("Agent credit")).toBeInTheDocument();
  });

  it("renders nothing when there are no banners", () => {
    const { container } = renderDeck([]);

    expect(container).toBeEmptyDOMElement();
  });

  it("reports VIEWED once per banner, not once per render", () => {
    const { dispatched, rerender } = renderDeck([banner()]);
    rerender(<div />);

    const viewed = dispatched.filter(
      (action) =>
        (action.payload as { interaction?: string } | undefined)
          ?.interaction === "VIEWED",
    );
    expect(viewed).toHaveLength(1);
  });

  it("dismisses optimistically and remembers it locally", async () => {
    const { dispatched } = renderDeck([banner()]);

    await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));

    expect(dispatched.some((a) => a.type === "DISMISS_BANNER_REQUESTED")).toBe(
      true,
    );
    expect(
      JSON.parse(localStorage.getItem("4mica:banners:dismissed") ?? "[]"),
    ).toContain("ban_1");
  });

  it("hides a banner the browser already recorded as dismissed", () => {
    localStorage.setItem("4mica:banners:dismissed", JSON.stringify(["ban_1"]));

    renderDeck([banner()]);

    expect(screen.queryByText("Instant payouts")).toBeNull();
  });
});

describe("sidebar banner placement", () => {
  const renderSidebar = (path: string, collapsed: boolean) => {
    const { store } = makeStore([banner()]);
    return render(
      // biome-ignore lint/suspicious/noExplicitAny: see above.
      <Provider store={store as any}>
        <MemoryRouter initialEntries={[path]}>
          <Sidebar collapsed={collapsed} />
        </MemoryRouter>
      </Provider>,
    );
  };

  beforeEach(() => {
    localStorage.clear();
    useUser.mockReturnValue({ user: null });
  });

  it("shows the deck on a main page with the sidebar expanded", () => {
    renderSidebar("/", false);

    expect(screen.getByText("Instant payouts")).toBeInTheDocument();
  });

  it.each([
    ["settings", "/settings/profile", false],
    ["a collapsed sidebar", "/", true],
    ["a collapsed settings sidebar", "/settings/profile", true],
  ])("hides the deck in %s", (_case, path, collapsed) => {
    renderSidebar(path, collapsed);

    expect(screen.queryByText("Instant payouts")).toBeNull();
  });
});

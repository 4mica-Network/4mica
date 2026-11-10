import { INITIAL_STATE as BANNER_INITIAL_STATE } from "@stores/banner/reducer";
import { INITIAL_STATE } from "@stores/user/reducer";
import type { User } from "@stores/user/type";
import { render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { MemoryRouter } from "react-router-dom";
import { createStore } from "redux";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "@/i18n";

const { useUser } = vi.hoisted(() => ({ useUser: vi.fn() }));

vi.mock("@clerk/clerk-react", () => ({
  useUser,
  useClerk: () => ({ signOut: vi.fn() }),
}));

const { Sidebar } = await import("./index");

const renderAt = (path: string, user: Partial<User> | null) => {
  const state = {
    user: { ...INITIAL_STATE, user },
    developer: {},
    banner: BANNER_INITIAL_STATE,
  };
  const store = createStore(() => state);
  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[path]}>
        <Sidebar collapsed={false} />
      </MemoryRouter>
    </Provider>,
  );
};

describe("sidebar identity", () => {
  beforeEach(() => {
    useUser.mockReturnValue({ user: null });
  });

  it.each([
    ["the app", "/"],
    ["settings", "/settings/profile"],
  ])("shows the user's name in %s", (_where, path) => {
    renderAt(path, { name: "Ada Lovelace" } as User);

    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    expect(screen.queryByText("4Mica Workspace")).toBeNull();
  });

  it.each([
    ["the app", "/"],
    ["settings", "/settings/profile"],
  ])("falls back to New user when the name is blank in %s", (_where, path) => {
    renderAt(path, { name: "", email: null } as unknown as User);

    expect(screen.getByText("New user")).toBeInTheDocument();
  });

  it("prefers an email over the placeholder", () => {
    renderAt("/settings/profile", {
      name: "   ",
      email: "ada@example.com",
    } as User);

    expect(screen.getByText("ada@example.com")).toBeInTheDocument();
  });

  it("falls back to the Clerk name before any email", () => {
    useUser.mockReturnValue({
      user: {
        fullName: "Ada L",
        primaryEmailAddress: { emailAddress: "ada@example.com" },
      },
    });
    renderAt("/", { name: "", email: "ada@example.com" } as unknown as User);

    expect(screen.getByText("Ada L")).toBeInTheDocument();
  });

  it("shows the placeholder before the user has loaded", () => {
    renderAt("/", null);

    expect(screen.getByText("New user")).toBeInTheDocument();
  });
});

describe("sidebar footer", () => {
  beforeEach(() => {
    useUser.mockReturnValue({ user: null });
  });

  it("offers the profile shortcuts and help in the app", () => {
    renderAt("/", { name: "Ada", username: "ada" } as User);

    expect(screen.getByText("View public profile")).toBeInTheDocument();
    expect(screen.getByText("Copy public profile")).toBeInTheDocument();
    expect(screen.getByText("Help")).toBeInTheDocument();
  });

  it("leaves them out of settings", () => {
    renderAt("/settings/profile", { name: "Ada", username: "ada" } as User);

    expect(screen.queryByText("View public profile")).toBeNull();
    expect(screen.queryByText("Copy public profile")).toBeNull();
    expect(screen.queryByText("Help")).toBeNull();
  });
});

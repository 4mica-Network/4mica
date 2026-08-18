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
  const state = { user: { ...INITIAL_STATE, user }, developer: {} };
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
    // `User.name` is @default("") — blank, not null, is the unset case.
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

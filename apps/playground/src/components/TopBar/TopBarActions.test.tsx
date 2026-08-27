import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { messages } from "@/i18n";
import { links } from "@/services/links";
import type { SessionIdentity } from "@/types";

const { useUser } = vi.hoisted(() => ({ useUser: vi.fn() }));

vi.mock("@clerk/nextjs", () => ({ useUser }));

vi.mock("next/navigation", () => ({
  usePathname: () => "/4mica-workspace/api/credit-limits",
}));

const { TopBarActions } = await import("./TopBarActions");

const identity = (over: Partial<SessionIdentity> = {}): SessionIdentity => ({
  name: "Ada Lovelace",
  username: "ada",
  avatarUrl: null,
  ...over,
});

describe("TopBarActions, signed out", () => {
  beforeEach(() => {
    useUser.mockReturnValue({ user: null });
  });

  it("carries the current page through as the redirect target", () => {
    render(<TopBarActions identity={null} />);

    const encoded = encodeURIComponent("/4mica-workspace/api/credit-limits");

    expect(
      screen.getByRole("link", { name: messages.auth.join }),
    ).toHaveAttribute("href", `/sign-up?redirect_url=${encoded}`);
    expect(
      screen.getByRole("link", { name: messages.auth.signIn }),
    ).toHaveAttribute("href", `/sign-in?redirect_url=${encoded}`);
  });

  it("shows no avatar", () => {
    render(<TopBarActions identity={null} />);

    expect(
      screen.queryByRole("link", { name: messages.auth.dashboard }),
    ).not.toBeInTheDocument();
  });
});

describe("TopBarActions, signed in", () => {
  beforeEach(() => {
    useUser.mockReturnValue({ user: null });
  });

  it("replaces the join buttons with an avatar linking to the dashboard", () => {
    render(<TopBarActions identity={identity()} />);

    expect(
      screen.queryByRole("link", { name: messages.auth.join }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: messages.auth.dashboard }),
    ).toHaveAttribute("href", links.app);
  });

  it("links to the dashboard even before apps/be provisions the row", () => {
    render(<TopBarActions identity={identity({ username: null, name: "" })} />);

    expect(
      screen.getByRole("link", { name: messages.auth.dashboard }),
    ).toHaveAttribute("href", links.app);
  });

  it("falls back to Clerk's own user when the row carries no name or image", () => {
    useUser.mockReturnValue({
      user: { fullName: "Grace Hopper", imageUrl: "https://img.clerk.com/g" },
    });

    render(
      <TopBarActions identity={identity({ name: "", avatarUrl: null })} />,
    );

    expect(screen.getByRole("img")).toHaveAttribute(
      "src",
      "https://img.clerk.com/g",
    );
  });
});

import { fireEvent, render, screen } from "@testing-library/react";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import "@/i18n";

vi.mock("@/components/Sidebar", () => ({
  COLLAPSED_WIDTH: 60,
  Sidebar: ({ collapsed }: { collapsed: boolean }) => (
    <aside data-testid="sidebar" data-collapsed={collapsed} />
  ),
}));
vi.mock("@/components/Onboarding", () => ({ OnboardingGate: () => null }));
vi.mock("@/components/OrganizationRail", () => ({
  OrganizationRail: () => <nav data-testid="organization-rail" />,
}));
vi.mock("@/components/Project/EnvironmentToggle", () => ({
  EnvironmentBar: () => <div data-testid="environment-bar">Sandbox</div>,
}));

const { AppShell } = await import("./index");

const setWidth = (width: number) => {
  window.matchMedia = ((query: string) => {
    const min = Number(/min-width:\s*(\d+)px/.exec(query)?.[1] ?? 0);
    return {
      matches: width >= min,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    };
  }) as unknown as typeof window.matchMedia;
};

const renderShell = () =>
  render(
    <MemoryRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route
            index
            element={
              <>
                <p>page</p>
                <Link to="/next">next</Link>
              </>
            }
          />
          <Route path="next" element={<p>next page</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );

describe("AppShell", () => {
  const original = window.matchMedia;
  afterEach(() => {
    window.matchMedia = original;
  });

  it("asks for a larger screen on phones instead of rendering the app", () => {
    setWidth(390);
    renderShell();

    expect(
      screen.getByRole("heading", { name: "Open 4Mica on a larger screen" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("page")).not.toBeInTheDocument();
  });

  it("offers a skip link that targets the focusable main content", () => {
    setWidth(1440);
    renderShell();
    const main = screen.getByRole("main");

    expect(
      screen.getByRole("link", { name: "Skip to content" }),
    ).toHaveAttribute("href", `#${main.id}`);
    expect(main).toHaveAttribute("tabindex", "-1");
  });

  it("moves focus to the main content after a route change", () => {
    setWidth(1440);
    renderShell();
    const link = screen.getByRole("link", { name: "next" });
    link.focus();

    fireEvent.click(link);

    expect(screen.getByText("next page")).toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveFocus();
  });

  it("leaves focus alone on the first render", () => {
    setWidth(1440);
    renderShell();

    expect(screen.getByRole("main")).not.toHaveFocus();
  });

  it("starts collapsed on medium screens and opens over the content", () => {
    setWidth(900);
    renderShell();

    expect(screen.getByTestId("sidebar")).toHaveAttribute(
      "data-collapsed",
      "true",
    );

    fireEvent.click(screen.getByRole("button", { name: "Expand sidebar" }));
    expect(screen.getByTestId("sidebar")).toHaveAttribute(
      "data-collapsed",
      "false",
    );

    fireEvent.click(screen.getByRole("button", { name: "Close sidebar" }));
    expect(screen.getByTestId("sidebar")).toHaveAttribute(
      "data-collapsed",
      "true",
    );
  });

  it("starts expanded on desktop without a backdrop", () => {
    setWidth(1440);
    renderShell();

    expect(screen.getByTestId("sidebar")).toHaveAttribute(
      "data-collapsed",
      "false",
    );
    expect(
      screen.queryByRole("button", { name: "Close sidebar" }),
    ).not.toBeInTheDocument();
  });

  it("runs the environment banner across the top, outside the content", () => {
    setWidth(1440);
    renderShell();
    const banner = screen.getByTestId("environment-bar");

    expect(screen.getByRole("main")).not.toContainElement(banner);
    expect(banner.parentElement?.firstElementChild).toHaveTextContent(
      "Skip to content",
    );
    const rail = screen.getByTestId("organization-rail");
    expect(
      banner.compareDocumentPosition(rail) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      banner.compareDocumentPosition(screen.getByTestId("sidebar")) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("keeps the organization rail beside the sidebar on desktop, even collapsed", () => {
    setWidth(1440);
    renderShell();

    expect(screen.getByTestId("organization-rail")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Collapse sidebar" }));
    expect(screen.getByTestId("organization-rail")).toBeInTheDocument();
  });

  it("shows the rail only inside the open drawer on medium screens", () => {
    setWidth(900);
    renderShell();

    expect(screen.queryByTestId("organization-rail")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Expand sidebar" }));
    const rail = screen.getByTestId("organization-rail");
    expect(rail.nextElementSibling).toBe(screen.getByTestId("sidebar"));

    fireEvent.click(screen.getByRole("button", { name: "Close sidebar" }));
    expect(screen.queryByTestId("organization-rail")).toBeNull();
  });
});

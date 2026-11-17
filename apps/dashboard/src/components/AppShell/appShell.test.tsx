import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import "@/i18n";

vi.mock("@/components/Sidebar", () => ({
  COLLAPSED_WIDTH: 60,
  Sidebar: ({ collapsed }: { collapsed: boolean }) => (
    <aside data-testid="sidebar" data-collapsed={collapsed} />
  ),
}));
vi.mock("@/components/Onboarding", () => ({ OnboardingGate: () => null }));

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
          <Route index element={<p>page</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );

describe("AppShell", () => {
  const original = window.matchMedia;
  afterEach(() => {
    window.matchMedia = original;
  });

  it("keeps the app usable on narrow viewports such as 200% zoom", () => {
    setWidth(390);
    renderShell();

    expect(screen.getByText("page")).toBeInTheDocument();
    expect(screen.getByRole("main")).toBeInTheDocument();
    expect(screen.getByTestId("sidebar")).toHaveAttribute(
      "data-collapsed",
      "true",
    );
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
});

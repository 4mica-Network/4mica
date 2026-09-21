import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { useAppSelector } = vi.hoisted(() => ({ useAppSelector: vi.fn() }));
vi.mock("@stores/hooks", () => ({ useAppSelector, useAppDispatch: vi.fn() }));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("react-router-dom", () => ({
  Link: ({
    children,
    to,
    ...rest
  }: {
    children: React.ReactNode;
    to: string;
  }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("@/lib/links", () => ({
  links: { profile: (username: string) => `http://localhost:3100/${username}` },
}));

const { IntegrationGuideLink } = await import("./index");

const user = (over: Record<string, unknown> = {}) => ({
  id: "u1",
  username: "mo",
  private: false,
  hidden: false,
  banned: false,
  ...over,
});

const withUser = (value: unknown) => {
  useAppSelector.mockImplementation((selector: (state: unknown) => unknown) =>
    selector({ user: { user: value } }),
  );
};

describe("IntegrationGuideLink", () => {
  beforeEach(() => {
    useAppSelector.mockReset();
  });

  it("links an API listing at profile/api/slug", () => {
    withUser(user());

    render(
      <IntegrationGuideLink
        kind="api"
        ref="credit-limits"
        visibility="PUBLIC"
        isPayable
        data-testid="guide"
      />,
    );

    expect(screen.getByTestId("guide-link")).toHaveAttribute(
      "href",
      "http://localhost:3100/mo/api/credit-limits",
    );
  });

  it("links an agent under /agents, not /api", () => {
    withUser(user());

    render(
      <IntegrationGuideLink
        kind="agent"
        ref="atlas-research"
        visibility="PUBLIC"
        isPayable
        data-testid="guide"
      />,
    );

    expect(screen.getByTestId("guide-link")).toHaveAttribute(
      "href",
      "http://localhost:3100/mo/agents/atlas-research",
    );
  });

  it("offers no link while the profile is private", () => {
    withUser(user({ private: true }));

    render(
      <IntegrationGuideLink
        kind="api"
        ref="credit-limits"
        visibility="PUBLIC"
        isPayable
        data-testid="guide"
      />,
    );

    expect(screen.queryByTestId("guide-link")).toBeNull();
    expect(screen.getByText("integration.guide.profilePrivate")).toBeTruthy();
    expect(screen.getByTestId("guide-settings")).toBeTruthy();
  });

  it("offers no link and no settings CTA to a banned account", () => {
    withUser(user({ banned: true }));

    render(
      <IntegrationGuideLink
        kind="api"
        ref="credit-limits"
        visibility="PUBLIC"
        isPayable
        data-testid="guide"
      />,
    );

    expect(screen.queryByTestId("guide-link")).toBeNull();
    expect(screen.queryByTestId("guide-settings")).toBeNull();
  });

  it("asks for a handle before anything else", () => {
    withUser(user({ username: null }));

    render(
      <IntegrationGuideLink
        kind="api"
        ref="credit-limits"
        visibility="PUBLIC"
        isPayable
        data-testid="guide"
      />,
    );

    expect(screen.getByText("integration.guide.noHandle")).toBeTruthy();
  });

  it("marks a private listing as an owner-only preview", () => {
    withUser(user());

    render(
      <IntegrationGuideLink
        kind="api"
        ref="credit-limits"
        visibility="PRIVATE"
        isPayable
        data-testid="guide"
      />,
    );

    expect(screen.getByTestId("guide-link")).toBeTruthy();
    expect(screen.getByText("integration.guide.previewOnly")).toBeTruthy();
  });

  it("warns that the guide has no code when no wallet is set", () => {
    withUser(user());

    render(
      <IntegrationGuideLink
        kind="api"
        ref="credit-limits"
        visibility="PUBLIC"
        isPayable={false}
        data-testid="guide"
      />,
    );

    expect(screen.getByText("integration.guide.notPayable")).toBeTruthy();
  });

  it("nudges when the handle was auto-generated", () => {
    withUser(user({ username: "user-a1b2c3d4" }));

    render(
      <IntegrationGuideLink
        kind="api"
        ref="credit-limits"
        visibility="PUBLIC"
        isPayable
        data-testid="guide"
      />,
    );

    expect(screen.getByTestId("guide-link")).toBeTruthy();
    expect(screen.getByText("integration.guide.generatedHandle")).toBeTruthy();
  });
});

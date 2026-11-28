import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const { sessions } = vi.hoisted(() => ({
  sessions: [
    {
      id: "bound",
      kind: "DEVICE",
      name: "ada-laptop",
      prefix: "4mica_cli_ab",
      last4: "wxyz",
      scopes: ["account:read"],
      lastUsedAt: null,
      expiresAt: "2027-01-01T00:00:00.000Z",
      createdAt: "2026-11-01T00:00:00.000Z",
      organization: { id: "acme-id", name: "Acme", handle: "acme" },
    },
    {
      id: "unbound",
      kind: "TOKEN",
      name: "ci",
      prefix: "4mica_cli_cd",
      last4: "abcd",
      scopes: ["account:read"],
      lastUsedAt: null,
      expiresAt: "2027-01-01T00:00:00.000Z",
      createdAt: "2026-11-01T00:00:00.000Z",
      organization: null,
    },
  ],
}));

vi.mock("@stores/developer", () => ({
  createCliToken: vi.fn(),
  developerPendingKeys: { cliSession: (id: string) => `cliSession:${id}` },
  fetchCliSessions: vi.fn(() => ({ type: "fetch" })),
  revokeCliSession: vi.fn(),
  selectCliSessions: () => sessions,
  selectCliSessionsState: () => ({
    isLoading: false,
    hasLoaded: true,
    error: null,
  }),
  selectDeveloperError: () => null,
  selectIsDeveloperPending: () => () => false,
}));

vi.mock("@stores/hooks", () => ({
  useAppDispatch: () => vi.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({}),
}));

vi.mock("react-i18next", () => ({
  initReactI18next: { type: "3rdParty", init: () => {} },
  useTranslation: () => ({ t: (key: string) => key }),
}));

const { CliSessionsCard } = await import("./CliSessionsCard");

describe("CliSessionsCard", () => {
  it("names the organization a session is limited to", () => {
    render(<CliSessionsCard onReveal={vi.fn()} />);

    const [bound, unbound] = screen.getAllByTestId("cli-session-organization");
    expect(bound).toHaveTextContent("developer.cli.organization: Acme");
    expect(unbound).toHaveTextContent(
      "developer.cli.organization: developer.cli.anyOrganization",
    );
  });
});

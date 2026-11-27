import { HttpError } from "@4mica/http";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { api } = vi.hoisted(() => ({
  api: {
    getCliDeviceRequest: vi.fn(),
    approveCliDeviceRequest: vi.fn(),
    denyCliDeviceRequest: vi.fn(),
  },
}));

vi.mock("@/api/cli", () => api);

vi.mock("@stores/hooks", () => ({
  useAppSelector: (selector: (s: unknown) => unknown) =>
    selector({ user: { user: { email: "ada@example.com", name: "Ada" } } }),
}));

vi.mock("react-i18next", () => ({
  initReactI18next: { type: "3rdParty", init: () => {} },
  useTranslation: () => ({
    t: (key: string, values?: Record<string, string>) =>
      values ? `${key} ${Object.values(values).join(" ")}` : key,
  }),
}));

const { CliAuthorize } = await import("./index");

const REQUEST = {
  userCode: "BCDF-GHJK",
  clientName: "ada-laptop",
  scopes: ["account:read", "wallets:read", "wallets:write"],
  requestIp: "203.0.113.7",
  createdAt: "2026-11-26T10:00:00.000Z",
  expiresAt: "2026-11-26T10:10:00.000Z",
};

const notFound = () =>
  new HttpError(404, "Not Found", { error: "not_found", message: "gone" });

const open = (search = "") =>
  render(
    <MemoryRouter initialEntries={[`/cli/authorize${search}`]}>
      <CliAuthorize />
    </MemoryRouter>,
  );

const button = (key: string) => screen.getByRole("button", { name: key });

describe("CliAuthorize", () => {
  beforeEach(() => {
    for (const fn of Object.values(api)) {
      fn.mockReset();
    }
    api.getCliDeviceRequest.mockResolvedValue(REQUEST);
    api.approveCliDeviceRequest.mockResolvedValue(undefined);
    api.denyCliDeviceRequest.mockResolvedValue(undefined);
  });

  it("shows who is asking and what they would get before anything is granted", async () => {
    open("?code=BCDF-GHJK");

    expect(await screen.findByTestId("cli-user-code")).toHaveTextContent(
      "BCDF-GHJK",
    );
    expect(api.getCliDeviceRequest).toHaveBeenCalledWith("BCDF-GHJK");
    expect(screen.getByText("ada-laptop")).toBeInTheDocument();
    expect(screen.getByText("203.0.113.7")).toBeInTheDocument();
    expect(screen.getByText("ada@example.com")).toBeInTheDocument();
    expect(
      screen.getByText(
        ["accountRead", "walletsRead", "walletsWrite"]
          .map((scope) => `developer.cli.authorize.scope.${scope}`)
          .join(", "),
      ),
    ).toBeInTheDocument();
    expect(api.approveCliDeviceRequest).not.toHaveBeenCalled();
  });

  it("approves only when Approve is pressed", async () => {
    open("?code=BCDF-GHJK");
    fireEvent.click(await screen.findByText("developer.cli.authorize.approve"));

    await screen.findByText("developer.cli.authorize.approvedTitle");
    expect(api.approveCliDeviceRequest).toHaveBeenCalledWith("BCDF-GHJK");
    expect(api.denyCliDeviceRequest).not.toHaveBeenCalled();

    expect(button("developer.cli.authorize.home")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "developer.cli.authorize.manage" }),
    ).toHaveAttribute("href", "/settings/developer#cli");
  });

  it("denies when Deny is pressed", async () => {
    open("?code=BCDF-GHJK");
    fireEvent.click(await screen.findByText("developer.cli.authorize.deny"));

    await screen.findByText("developer.cli.authorize.deniedTitle");
    expect(api.denyCliDeviceRequest).toHaveBeenCalledWith("BCDF-GHJK");
    expect(api.approveCliDeviceRequest).not.toHaveBeenCalled();
  });

  it("asks for the code when the link carries none", async () => {
    open();

    const field = document.getElementById("cli-user-code") as HTMLInputElement;
    expect(api.getCliDeviceRequest).not.toHaveBeenCalled();
    fireEvent.change(field, { target: { value: " bcdf ghjk " } });
    fireEvent.click(button("developer.cli.authorize.continue"));

    await waitFor(() =>
      expect(api.getCliDeviceRequest).toHaveBeenCalledWith("bcdf ghjk"),
    );
    expect(await screen.findByTestId("cli-user-code")).toBeInTheDocument();
  });

  it("says so for a code that is unknown or expired, and offers another try", async () => {
    api.getCliDeviceRequest.mockRejectedValue(notFound());
    open("?code=BBBB-BBBB");

    await screen.findByText("developer.cli.authorize.unknownTitle");
    expect(screen.queryByText("developer.cli.authorize.approve")).toBeNull();

    fireEvent.click(button("developer.cli.authorize.tryAnother"));
    expect(document.getElementById("cli-user-code")).not.toBeNull();
  });

  it("treats a request that expired while it was on screen as gone", async () => {
    api.approveCliDeviceRequest.mockRejectedValue(notFound());
    open("?code=BCDF-GHJK");
    fireEvent.click(await screen.findByText("developer.cli.authorize.approve"));

    await screen.findByText("developer.cli.authorize.unknownTitle");
    expect(
      screen.queryByText("developer.cli.authorize.approvedTitle"),
    ).toBeNull();
  });

  it("keeps the request on screen when approving fails for another reason", async () => {
    api.approveCliDeviceRequest.mockRejectedValue(new Error("offline"));
    open("?code=BCDF-GHJK");
    fireEvent.click(await screen.findByText("developer.cli.authorize.approve"));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByTestId("cli-user-code")).toBeInTheDocument();
  });
});

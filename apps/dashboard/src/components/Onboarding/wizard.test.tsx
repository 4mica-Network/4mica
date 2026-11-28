import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { dispatch, usernameCheck, savingSections, workspace } = vi.hoisted(
  () => ({
    dispatch: vi.fn(),
    usernameCheck: { value: "", status: "idle" },
    savingSections: {} as Record<string, boolean>,
    workspace: { activeId: "personal" },
  }),
);

const ORGANIZATIONS = [
  { id: "personal", name: "Ada", personal: true, role: "OWNER" },
  { id: "acme", name: "Acme", personal: false, role: "VIEWER" },
];

vi.mock("@stores/hooks", () => ({
  useAppDispatch: () => dispatch,
  useAppSelector: (selector: (s: unknown) => unknown) =>
    selector({
      user: {
        user: { name: "", username: "ada" },
        business: null,
        validationIssues: {},
        usernameCheck,
        savingSections,
        error: null,
      },
      config: { config: null },
      organization: {
        items: ORGANIZATIONS,
        activeId: workspace.activeId,
        defaultId: "personal",
      },
    }),
}));

vi.mock("@clerk/clerk-react", () => ({
  useClerk: () => ({ signOut: vi.fn() }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const { Wizard } = await import("./Wizard");

const nameField = () =>
  document.getElementById("onboarding-name") as HTMLInputElement;
const continueButton = () =>
  screen.getByRole("button", { name: "onboarding.continue" });

describe("Onboarding wizard", () => {
  beforeEach(() => {
    dispatch.mockClear();
    usernameCheck.value = "";
    usernameCheck.status = "idle";
    for (const key of Object.keys(savingSections)) {
      delete savingSections[key];
    }
    workspace.activeId = "personal";
  });

  it("keeps Continue disabled until a name is typed", () => {
    render(<Wizard />);
    expect(continueButton()).toBeDisabled();

    fireEvent.change(nameField(), { target: { value: "Ada" } });
    expect(continueButton()).toBeEnabled();
  });

  it("explains a too-short name on Continue instead of a dead button", () => {
    render(<Wizard />);
    fireEvent.change(nameField(), { target: { value: "A" } });

    expect(screen.queryByText("validation.minLength")).toBeNull();
    fireEvent.click(continueButton());

    expect(screen.getByText("validation.minLength")).toBeInTheDocument();
    expect(nameField()).toHaveAttribute("aria-invalid", "true");
    expect(dispatch).not.toHaveBeenCalled();

    fireEvent.change(nameField(), { target: { value: "Ada" } });
    expect(screen.queryByText("validation.minLength")).toBeNull();
  });

  it("waits for a new handle's own check, not an earlier handle's result", () => {
    const { rerender } = render(<Wizard />);
    fireEvent.change(nameField(), { target: { value: "Ada" } });
    fireEvent.click(continueButton());
    savingSections["onboarding.name"] = true;
    rerender(<Wizard />);
    savingSections["onboarding.name"] = false;
    rerender(<Wizard />);

    usernameCheck.value = "grace";
    usernameCheck.status = "available";
    const handle = document.getElementById(
      "onboarding-username",
    ) as HTMLInputElement;
    fireEvent.change(handle, { target: { value: "gracie" } });

    expect(continueButton()).toBeDisabled();

    usernameCheck.value = "gracie";
    rerender(<Wizard />);

    expect(continueButton()).toBeEnabled();
  });

  const saveName = (rerender: (ui: ReactElement) => void) => {
    fireEvent.change(nameField(), { target: { value: "Ada" } });
    fireEvent.click(continueButton());
    savingSections["onboarding.name"] = true;
    rerender(<Wizard />);
    savingSections["onboarding.name"] = false;
    rerender(<Wizard />);
  };

  const completions = () =>
    dispatch.mock.calls
      .map(([action]) => action)
      .filter((action) => action.type === "COMPLETE_ONBOARDING_REQUESTED");

  it("skips the business step for someone who joined an organization", () => {
    workspace.activeId = "acme";
    const { rerender } = render(<Wizard />);
    expect(screen.getByText("onboarding.stepOf")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);

    saveName(rerender);
    fireEvent.click(screen.getByRole("button", { name: "onboarding.finish" }));

    expect(document.getElementById("onboarding-legal-name")).toBeNull();
    expect(completions()).toEqual([
      expect.objectContaining({
        payload: null,
        meta: { section: "onboarding.complete" },
      }),
    ]);
  });

  it("finishes after a new handle is saved in an organization", () => {
    workspace.activeId = "acme";
    const { rerender } = render(<Wizard />);
    saveName(rerender);

    usernameCheck.value = "gracie";
    usernameCheck.status = "available";
    fireEvent.change(
      document.getElementById("onboarding-username") as HTMLInputElement,
      { target: { value: "gracie" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "onboarding.finish" }));
    expect(completions()).toEqual([]);

    savingSections["onboarding.username"] = true;
    rerender(<Wizard />);
    savingSections["onboarding.username"] = false;
    rerender(<Wizard />);

    expect(completions()).toEqual([expect.objectContaining({ payload: null })]);
    expect(document.getElementById("onboarding-legal-name")).toBeNull();
  });

  it("saves the business to the personal workspace", () => {
    const { rerender } = render(<Wizard />);
    saveName(rerender);
    fireEvent.click(continueButton());

    fireEvent.change(
      document.getElementById("onboarding-legal-name") as HTMLInputElement,
      { target: { value: "Analytical Engines" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "onboarding.finish" }));

    expect(completions()).toEqual([
      expect.objectContaining({
        payload: expect.objectContaining({ legalName: "Analytical Engines" }),
        meta: { section: "onboarding.business" },
        organizationId: "personal",
      }),
    ]);
  });
});

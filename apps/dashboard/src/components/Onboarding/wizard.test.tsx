import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { dispatch } = vi.hoisted(() => ({ dispatch: vi.fn() }));

vi.mock("@stores/hooks", () => ({
  useAppDispatch: () => dispatch,
  useAppSelector: (selector: (s: unknown) => unknown) =>
    selector({
      user: {
        user: { name: "", username: "ada" },
        business: null,
        validationIssues: {},
        usernameCheck: { status: "idle" },
        savingSections: {},
        error: null,
      },
      config: { config: null },
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
});

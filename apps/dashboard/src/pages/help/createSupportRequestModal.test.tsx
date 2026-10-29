import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { dispatch, state } = vi.hoisted(() => ({
  dispatch: vi.fn(),
  state: {
    error: null as string | null,
    issues: {} as Record<string, string>,
  },
}));

vi.mock("@stores/hooks", () => ({
  useAppDispatch: () => dispatch,
  useAppSelector: (selector: (s: unknown) => unknown) =>
    selector({
      support: {
        error: state.error,
        validationIssues: state.issues,
        pending: {},
      },
      config: {
        config: {
          supportCategories: ["PAYMENTS", "BUG"],
          supportPriorities: ["LOW", "NORMAL", "HIGH", "URGENT"],
        },
      },
    }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const { CreateSupportRequestModal } = await import(
  "./CreateSupportRequestModal"
);
const actionTypes = (await import("@stores/support/actionTypes")).default;

const open = () =>
  render(<CreateSupportRequestModal isOpen onClose={() => {}} />);

const setField = (id: string, value: string) => {
  const field = document.getElementById(id) as HTMLInputElement;
  fireEvent.change(field, { target: { value } });
};

const nextButton = () => screen.getByTestId("create-support-request-next");
const submitButton = () => screen.getByTestId("create-support-request-submit");

const categoryRadio = (category: string) =>
  screen
    .getByTestId(`help-category-${category}`)
    .querySelector("input") as HTMLInputElement;

const lastCreate = () =>
  dispatch.mock.calls
    .map(([action]) => action)
    .filter((a) => a.type === actionTypes.CREATE_SUPPORT_REQUEST_REQUESTED)
    .at(-1);

const pickCategory = async (category: string) => {
  fireEvent.click(categoryRadio(category));
  fireEvent.click(nextButton());
  await waitFor(() =>
    expect(
      document.getElementById("create-support-request-subject"),
    ).not.toBeNull(),
  );
};

describe("CreateSupportRequestModal", () => {
  beforeEach(() => {
    dispatch.mockClear();
    state.error = null;
    state.issues = {};
  });

  it("lists the categories from config and waits for one to be picked", () => {
    open();

    expect(screen.getByTestId("help-category-PAYMENTS")).toBeInTheDocument();
    expect(screen.getByTestId("help-category-BUG")).toBeInTheDocument();
    expect(nextButton()).toBeDisabled();

    fireEvent.click(categoryRadio("BUG"));
    expect(nextButton()).toBeEnabled();
  });

  it("points at the guide for the chosen topic before the form", async () => {
    open();
    await pickCategory("PAYMENTS");

    expect(screen.getByTestId("create-support-request-guide")).toHaveAttribute(
      "href",
      expect.stringContaining("deposits"),
    );
  });

  it("keeps Send disabled until a subject and details are given", async () => {
    open();
    await pickCategory("BUG");

    expect(submitButton()).toBeDisabled();
    setField("create-support-request-subject", "Export button does nothing");
    expect(submitButton()).toBeDisabled();
    setField(
      "create-support-request-description",
      "Clicking it shows nothing.",
    );
    expect(submitButton()).toBeEnabled();
  });

  it("sends a trimmed request with the default urgency", async () => {
    open();
    await pickCategory("BUG");

    setField("create-support-request-subject", "  Export is broken ");
    setField("create-support-request-description", " Nothing downloads. ");
    fireEvent.click(submitButton());

    await waitFor(() => expect(lastCreate()).toBeDefined());
    expect(lastCreate()?.payload).toEqual({
      category: "BUG",
      subject: "Export is broken",
      priority: "NORMAL",
      description: "Nothing downloads.",
      reference: null,
    });
  });

  it("shows the field error when Send finds a problem", async () => {
    open();
    await pickCategory("BUG");

    setField("create-support-request-subject", "x".repeat(161));
    setField("create-support-request-description", "Details");
    fireEvent.click(submitButton());

    expect(
      await screen.findByText("help.errors.subjectTooLong"),
    ).toBeInTheDocument();
    expect(lastCreate()).toBeUndefined();
  });
});

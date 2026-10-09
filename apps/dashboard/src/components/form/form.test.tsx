import { Modal } from "@4mica/ui";
import { zodResolver } from "@hookform/resolvers/zod";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useForm } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { useServerIssues } from "@/hooks/useServerIssues";
import {
  FieldRow,
  Form,
  FormSelect,
  FormTextInput,
  SettingRow,
  TextInput,
} from ".";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const schema = z.object({
  name: z.string().min(1, "errors.nameRequired"),
  plan: z.enum(["FREE", "PRO"]),
});
type Values = z.infer<typeof schema>;

function Harness({
  issues = {},
  onValid = () => {},
}: {
  issues?: Record<string, string>;
  onValid?: (values: Values) => void;
}) {
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    mode: "onTouched",
    defaultValues: { name: "", plan: "FREE" },
  });
  useServerIssues(issues, form.setError);

  return (
    <Form form={form} onSubmit={form.handleSubmit(onValid)}>
      <FieldRow title="Name" description="Shown on invoices" required>
        <FormTextInput name="name" />
      </FieldRow>
      <FieldRow title="Plan">
        <FormSelect
          name="plan"
          options={[
            { value: "FREE", title: "Free" },
            { value: "PRO", title: "Pro" },
          ]}
        />
      </FieldRow>
      <button type="submit">Save</button>
    </Form>
  );
}

describe("FieldRow", () => {
  it("labels every control without hand-written ids", () => {
    render(<Harness />);

    expect(screen.getByLabelText(/Name/)).toHaveAttribute("name", "name");
    expect(screen.getByLabelText("Plan")).toHaveAttribute(
      "aria-haspopup",
      "listbox",
    );
  });

  it("announces the hint and the required state", () => {
    render(<Harness />);
    const input = screen.getByLabelText(/Name/);

    expect(input).toHaveAccessibleDescription("Shown on invoices");
    expect(input).toHaveAttribute("aria-required", "true");
  });

  it("keeps an explicit htmlFor as the control id", () => {
    render(
      <SettingRow title="Email" htmlFor="account-email" error="Taken">
        <TextInput value="" onChange={() => {}} />
      </SettingRow>,
    );
    const input = screen.getByLabelText("Email");

    expect(input).toHaveAttribute("id", "account-email");
    expect(input).toHaveAccessibleDescription("Taken");
  });
});

describe("Form", () => {
  it("focuses the first invalid field on submit and links its error", async () => {
    const onValid = vi.fn();
    render(<Harness onValid={onValid} />);

    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    const input = screen.getByLabelText(/Name/);
    await waitFor(() => expect(input).toHaveFocus());
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription(
      "Shown on invoices errors.nameRequired",
    );
    expect(onValid).not.toHaveBeenCalled();
  });

  it("shows server issues untranslated against their field", async () => {
    render(<Harness issues={{ name: "is already in use" }} />);

    expect(await screen.findByText("is already in use")).toBeInTheDocument();
    expect(screen.getByLabelText(/Name/)).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });

  it("submits the values once valid", async () => {
    const onValid = vi.fn();
    render(<Harness onValid={onValid} />);

    await userEvent.type(screen.getByLabelText(/Name/), "Acme");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(onValid).toHaveBeenCalledWith(
        { name: "Acme", plan: "FREE" },
        expect.anything(),
      ),
    );
  });
});

describe("Select inside a modal", () => {
  it("opens, moves and picks from the keyboard, and Escape only closes the list", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <Modal isOpen onClose={onClose} title="Edit">
        <Harness />
      </Modal>,
    );

    const trigger = screen.getByLabelText("Plan");
    trigger.focus();
    await user.keyboard("{ArrowDown}");

    const listbox = await screen.findByRole("listbox");
    await waitFor(() =>
      expect(screen.getByRole("option", { name: "Free" })).toHaveFocus(),
    );
    expect(trigger).toHaveAttribute("aria-controls", listbox.id);

    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("option", { name: "Pro" })).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(trigger).toHaveFocus();

    await user.keyboard("{ArrowDown}");
    await waitFor(() =>
      expect(screen.getByRole("option", { name: "Free" })).toHaveFocus(),
    );
    await user.keyboard("{ArrowDown}{Enter}");
    expect(trigger).toHaveTextContent("Pro");
  });
});

import type { Meta, StoryObj } from "@storybook/react";
import { fn } from "@storybook/test";
import { Eye, Search, Wallet } from "lucide-react";
import { useState } from "react";
import {
  InputField,
  type InputFieldProps,
  type RegisterLike,
} from "../components/input-field";

/**
 * `InputFieldProps` is a union discriminated on `variant`. Narrowing the meta
 * to the `input` branch keeps arg inference usable; the textarea stories opt
 * back in through `render`.
 */
type InputProps = Extract<InputFieldProps, { variant?: "input" }>;

const meta: Meta<InputProps> = {
  title: "Components/InputField",
  component: InputField,
  parameters: { layout: "centered" },
  args: {
    placeholder: "you@company.com",
    onChange: fn(),
  },
  argTypes: {
    variant: { control: "inline-radio", options: ["input", "textarea"] },
    format: {
      control: "inline-radio",
      options: [undefined, "lowercase", "uppercase"],
    },
    inputMode: {
      control: "select",
      options: [
        "none",
        "text",
        "search",
        "email",
        "tel",
        "url",
        "numeric",
        "decimal",
      ],
    },
    disabled: { control: "boolean" },
    readOnly: { control: "boolean" },
    required: { control: "boolean" },
    allowResizing: { control: "boolean" },
  },
  decorators: [
    (Story) => (
      <div className="w-80">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<InputProps>;

/** Wrapper for stories where seeing the value change as you type is the point. */
const ControlledInput = (args: InputProps) => {
  const [value, setValue] = useState("");
  return (
    <InputField
      {...args}
      value={value}
      onChange={(e) => {
        setValue(e.target.value);
        args.onChange?.(e);
      }}
    />
  );
};

export const Default: Story = {};

export const WithLabel: Story = { args: { label: "Work email" } };

/** `required` renders the danger-coloured asterisk beside the label. */
export const Required: Story = {
  args: { label: "Work email", required: true },
};

/** Red border plus a `role="alert"` message wired up via `aria-describedby`. */
export const WithError: Story = {
  args: {
    label: "Work email",
    required: true,
    value: "not-an-email",
    error: "Enter a valid work email address.",
  },
};

export const WithLeadingIcon: Story = {
  args: { placeholder: "Search invoices", icon: <Search size={14} /> },
};

export const WithTrailingIcon: Story = {
  args: {
    label: "Password",
    type: "password",
    placeholder: "••••••••",
    trailingIcon: <Eye size={14} />,
  },
};

/** `prefix` renders an attached addon and drops the input's left border. */
export const WithPrefix: Story = {
  args: {
    label: "Webhook URL",
    prefix: "https://",
    placeholder: "api.acme.com/4mica",
  },
};

export const Disabled: Story = {
  args: { label: "Account ID", value: "acct_9f2c41", disabled: true },
};

export const ReadOnly: Story = {
  args: { label: "API key", value: "sk_live_4m1ca_…", readOnly: true },
};

/** Native number spinners are suppressed via `[appearance:textfield]`. */
export const NumberInput: Story = {
  args: {
    label: "Credit limit",
    type: "number",
    inputMode: "numeric",
    min: 0,
    max: 100000,
    placeholder: "50000",
    icon: <Wallet size={14} />,
  },
};

/** `format` transforms every keystroke — try typing lowercase. */
export const UppercaseFormat: Story = {
  args: {
    label: "Invoice reference",
    format: "uppercase",
    placeholder: "inv-2048",
  },
  render: (args) => <ControlledInput {...args} />,
};

export const TextArea: Story = {
  args: { label: "Notes", placeholder: "Add context for this credit line…" },
  render: ({ type: _type, ...args }) => (
    <InputField {...args} variant="textarea" rows={4} />
  ),
};

/** Grows with its content up to `maxAutoHeight`, then scrolls. */
export const TextAreaAutoGrow: Story = {
  args: { label: "Memo", placeholder: "Type a few lines…" },
  render: ({ type: _type, ...args }) => (
    <InputField
      {...args}
      variant="textarea"
      allowResizing
      maxAutoHeight={160}
      rows={2}
    />
  ),
};

const mockRegister: RegisterLike = {
  name: "companyName",
  onChange: fn(),
  onBlur: fn(),
  ref: () => {},
  required: true,
  maxLength: 64,
};

/** `register` is structurally react-hook-form's `UseFormRegisterReturn`. */
export const WithRegister: Story = {
  args: {
    label: "Company name",
    required: true,
    placeholder: "Acme Robotics",
    register: mockRegister,
  },
};

import type { Meta, StoryObj } from "@storybook/react";
import { fn } from "@storybook/test";
import { useState } from "react";
import { type Option, Select, type SelectProps } from "../components/select";

const OPTIONS: Option[] = [
  { title: "Net 15", value: "net15" },
  { title: "Net 30", value: "net30" },
  { title: "Net 45", value: "net45" },
  { title: "Net 60", value: "net60" },
  { title: "Due on receipt", value: "immediate" },
];

const meta = {
  title: "Components/Select",
  component: Select,
  parameters: { layout: "centered" },
  args: {
    options: OPTIONS,
    placeholder: "Select payment terms",
    onChange: fn(),
    onToggle: fn(),
    onSearch: fn(),
  },
  argTypes: {
    disabled: { control: "boolean" },
    loading: { control: "boolean" },
    hasSearch: { control: "boolean" },
    hasEmptyValue: { control: "boolean" },
    isInputHidden: { control: "boolean" },
    required: { control: "boolean" },
    visible: { control: "boolean" },
  },
  decorators: [
    (Story) => (
      <div className="w-72">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Select>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithLabel: Story = { args: { label: "Payment terms" } };

export const Required: Story = {
  args: { label: "Payment terms", required: true },
};

export const WithError: Story = {
  args: {
    label: "Payment terms",
    required: true,
    error: "Choose the terms for this credit line.",
  },
};

/** `initialValue` seeds the uncontrolled selection. */
export const Preselected: Story = {
  args: { label: "Payment terms", initialValue: OPTIONS[1] },
};

/** With `hasSearch` the panel gets an autofocused filter input. */
export const WithSearch: Story = {
  args: { label: "Payment terms", hasSearch: true, visible: true },
};

/** Selecting something reveals a `-` row that clears back to null. */
export const WithEmptyValue: Story = {
  args: {
    label: "Payment terms",
    hasEmptyValue: true,
    initialValue: OPTIONS[0],
    visible: true,
  },
};

export const Loading: Story = {
  args: { label: "Payment terms", loading: true, visible: true },
};

/** While disabled the trigger is inert and the panel is never rendered. */
export const Disabled: Story = {
  args: { label: "Payment terms", disabled: true, initialValue: OPTIONS[2] },
};

export const NoData: Story = {
  args: { label: "Payment terms", options: [], visible: true },
};

/** Type something that matches nothing to see the empty-filter state. */
export const NoMatchingResults: Story = {
  args: { label: "Payment terms", hasSearch: true, visible: true },
};

/** `isInputHidden` drops the trigger — drive the panel with `visible`. */
export const InputHidden: Story = {
  args: { isInputHidden: true, visible: true },
};

const ControlledSelect = (args: SelectProps) => {
  const [value, setValue] = useState<string | number | undefined>(
    OPTIONS[0].value,
  );
  return (
    <div className="flex flex-col gap-3">
      <Select
        {...args}
        value={value}
        onChange={(option) => {
          setValue(option?.value);
          args.onChange(option);
        }}
      />
      <p className="text-ink-subtle text-xs">
        Selected value: {String(value ?? "none")}
      </p>
    </div>
  );
};

/** Passing `value` hands ownership of the selection to the parent. */
export const Controlled: Story = {
  args: { label: "Payment terms", hasEmptyValue: true },
  render: (args) => <ControlledSelect {...args} />,
};

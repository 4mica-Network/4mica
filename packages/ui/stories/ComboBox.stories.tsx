import type { Meta, StoryObj } from "@storybook/react";
import { fn } from "@storybook/test";
import { useState } from "react";
import {
  ComboBox,
  type ComboBoxOption,
  type ComboBoxProps,
} from "../components/combo-box";

const OPTIONS: ComboBoxOption[] = [
  { title: "United States", value: "us" },
  { title: "United Kingdom", value: "gb" },
  { title: "Germany", value: "de" },
  { title: "France", value: "fr" },
  { title: "Singapore", value: "sg" },
  { title: "Japan", value: "jp" },
];

const MANY_OPTIONS: ComboBoxOption[] = Array.from({ length: 30 }, (_, i) => ({
  title: `Merchant ${String(i + 1).padStart(2, "0")}`,
  value: `merchant-${i + 1}`,
}));

const meta = {
  title: "Components/ComboBox",
  component: ComboBox,
  parameters: { layout: "centered" },
  args: {
    options: OPTIONS,
    selectedValues: [],
    onChange: fn(),
  },
  argTypes: {
    disabled: { control: "boolean" },
    placeholder: { control: "text" },
    searchPlaceholder: { control: "text" },
    selectedValues: { table: { disable: true } },
  },
  decorators: [
    (Story) => (
      <div className="w-72">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ComboBox>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * ComboBox is a controlled multi-select. The wrapper owns `selectedValues` so
 * the stories are usable, while still reporting to the Actions panel.
 */
const ControlledComboBox = (args: ComboBoxProps) => {
  const [selected, setSelected] = useState(args.selectedValues);
  return (
    <ComboBox
      {...args}
      selectedValues={selected}
      onChange={(next) => {
        setSelected(next);
        args.onChange(next);
      }}
    />
  );
};

export const Default: Story = {
  render: (args) => <ControlledComboBox {...args} />,
};

export const WithLabel: Story = {
  args: { label: "Supported regions" },
  render: (args) => <ControlledComboBox {...args} />,
};

/** The trigger collapses the selection to a `N selected` summary. */
export const WithSelection: Story = {
  args: { label: "Supported regions", selectedValues: ["us", "de"] },
  render: (args) => <ControlledComboBox {...args} />,
};

export const Disabled: Story = {
  args: { label: "Supported regions", selectedValues: ["us"], disabled: true },
  render: (args) => <ControlledComboBox {...args} />,
};

export const CustomPlaceholders: Story = {
  args: {
    label: "Supported regions",
    placeholder: "Choose regions",
    searchPlaceholder: "Filter regions…",
  },
  render: (args) => <ControlledComboBox {...args} />,
};

/** The option list scrolls at `max-h-[200px]`; the search input stays pinned. */
export const ManyOptions: Story = {
  args: { label: "Merchants", options: MANY_OPTIONS },
  render: (args) => <ControlledComboBox {...args} />,
};

/** Filter for something absent — e.g. `zzz` — to see the empty state. */
export const NoResults: Story = {
  args: { label: "Supported regions", searchPlaceholder: "Try typing zzz" },
  render: (args) => <ControlledComboBox {...args} />,
};

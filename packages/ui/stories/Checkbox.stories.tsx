import type { Meta, StoryObj } from "@storybook/react";
import { fn } from "@storybook/test";
import { useState } from "react";
import { Checkbox, type CheckboxProps } from "../components/checkbox";

const meta = {
  title: "Components/Checkbox",
  component: Checkbox,
  parameters: { layout: "centered" },
  args: {
    children: "Auto-settle on delivery",
    onChange: fn(),
  },
  argTypes: {
    variant: { control: "inline-radio", options: ["rounded", "square"] },
    checked: { control: "boolean" },
    disabled: { control: "boolean" },
  },
} satisfies Meta<typeof Checkbox>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Checkbox is fully controlled. This wrapper owns the state so the stories are
 * clickable, while still forwarding to the arg handler for the Actions panel.
 */
const ControlledCheckbox = (args: CheckboxProps) => {
  const [checked, setChecked] = useState(args.checked ?? false);
  return (
    <Checkbox
      {...args}
      checked={checked}
      onChange={(next) => {
        setChecked(next);
        args.onChange?.(next);
      }}
    />
  );
};

export const Rounded: Story = { args: { variant: "rounded" } };
export const Square: Story = { args: { variant: "square" } };

export const Checked: Story = { args: { checked: true } };

export const Disabled: Story = { args: { disabled: true } };
export const DisabledChecked: Story = {
  args: { checked: true, disabled: true },
};

export const WithoutLabel: Story = { args: { children: undefined } };

/** Click it — the wrapper holds the state. */
export const Interactive: Story = {
  render: (args) => <ControlledCheckbox {...args} />,
};

export const AllVariants: Story = {
  render: (args) => (
    <div className="flex flex-col gap-4">
      {(["rounded", "square"] as const).map((variant) => (
        <div key={variant} className="flex items-center gap-6">
          <Checkbox {...args} variant={variant} checked={false}>
            Unchecked
          </Checkbox>
          <Checkbox {...args} variant={variant} checked>
            Checked
          </Checkbox>
          <Checkbox {...args} variant={variant} checked disabled>
            Disabled
          </Checkbox>
        </div>
      ))}
    </div>
  ),
};

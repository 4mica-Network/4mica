import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { Segmented } from "../components/segmented";

const options = [
  { value: "7d", label: "7D" },
  { value: "30d", label: "30D" },
  { value: "90d", label: "90D" },
];

const meta = {
  title: "Components/Segmented",
  component: Segmented,
  parameters: { layout: "centered" },
  args: {
    label: "Range",
    value: "30d",
    options,
    onChange: () => {},
  },
} satisfies Meta<typeof Segmented<string>>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => {
    const [value, setValue] = useState(args.value);
    return <Segmented {...args} value={value} onChange={setValue} />;
  },
};

import type { Meta, StoryObj } from "@storybook/react";
import { Stars } from "../components/stars";

const meta = {
  title: "Components/Stars",
  component: Stars,
  parameters: { layout: "centered" },
  args: { value: 3.6 },
  argTypes: {
    value: { control: { type: "range", min: 0, max: 5, step: 0.1 } },
    size: { control: "inline-radio", options: ["sm", "md"] },
  },
} satisfies Meta<typeof Stars>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Medium: Story = { args: { size: "md", value: 4.2 } };

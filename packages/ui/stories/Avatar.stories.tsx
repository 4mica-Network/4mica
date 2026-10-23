import type { Meta, StoryObj } from "@storybook/react";
import { Avatar } from "../components/avatar";

const meta = {
  title: "Components/Avatar",
  component: Avatar,
  parameters: { layout: "centered" },
  args: { name: "Ada Lovelace" },
  argTypes: {
    size: { control: "inline-radio", options: ["xs", "sm", "md", "lg", "xl"] },
  },
} satisfies Meta<typeof Avatar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Initials: Story = {};

export const Image: Story = {
  args: { src: "https://avatars.githubusercontent.com/u/9919?s=96" },
};

export const Sizes: Story = {
  render: (args) => (
    <div className="flex items-center gap-3">
      {(["xs", "sm", "md", "lg", "xl"] as const).map((size) => (
        <Avatar {...args} key={size} size={size} />
      ))}
    </div>
  ),
};

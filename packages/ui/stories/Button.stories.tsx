import type { Meta, StoryObj } from "@storybook/react";
import { fn } from "@storybook/test";
import { ArrowRight, Plus } from "lucide-react";
import { Button } from "../components/button";

const meta = {
  title: "Components/Button",
  component: Button,
  parameters: { layout: "centered" },
  args: {
    children: "Click me",
    onClick: fn(),
  },
  argTypes: {
    intent: {
      control: "select",
      options: ["primary", "outline", "soft", "ghost", "invert"],
    },
    size: { control: "select", options: ["sm", "md", "lg"] },
    iconPosition: { control: "inline-radio", options: ["left", "right"] },
    block: { control: "boolean" },
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = { args: { intent: "primary" } };
export const Outline: Story = {
  args: { intent: "outline", children: "Learn more" },
};
export const Soft: Story = {
  args: { intent: "soft", children: "Talk to sales" },
};
export const Ghost: Story = { args: { intent: "ghost", children: "Cancel" } };
export const Invert: Story = {
  args: { intent: "invert", children: "Try for free" },
};

export const WithLeadingIcon: Story = {
  args: { intent: "primary", icon: <Plus size={16} />, children: "New" },
};

export const WithTrailingIcon: Story = {
  args: {
    intent: "primary",
    iconPosition: "right",
    icon: <ArrowRight size={16} />,
    children: "Continue",
  },
};

export const AsLink: Story = {
  args: { intent: "primary", children: "Go to site" },
  render: (args) => (
    <Button {...args} asChild>
      <a href="https://4mica.io">{args.children}</a>
    </Button>
  ),
};

export const Sizes: Story = {
  args: { intent: "primary" },
  render: (args) => (
    <div className="flex items-center gap-3">
      <Button {...args} size="sm">
        Small
      </Button>
      <Button {...args} size="md">
        Medium
      </Button>
      <Button {...args} size="lg">
        Large
      </Button>
    </div>
  ),
};

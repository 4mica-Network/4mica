import type { Meta, StoryObj } from "@storybook/react";
import { ArrowRight } from "lucide-react";
import { Link } from "../components/link";

const meta = {
  title: "Components/Link",
  component: Link,
  parameters: { layout: "centered" },
  args: { children: "Read the docs", href: "#" },
  argTypes: {
    variant: { control: "inline-radio", options: ["accent", "muted"] },
    iconPosition: { control: "inline-radio", options: ["left", "right"] },
  },
} satisfies Meta<typeof Link>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Accent: Story = { args: { variant: "accent" } };
export const Muted: Story = {
  args: { variant: "muted", children: "Back to home" },
};

export const External: Story = {
  args: {
    variant: "accent",
    external: true,
    href: "https://4mica.io",
    children: "Visit 4mica.io",
  },
};

export const WithIcon: Story = {
  args: {
    variant: "accent",
    icon: <ArrowRight size={14} />,
    children: "Learn more",
  },
};

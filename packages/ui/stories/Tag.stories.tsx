import type { Meta, StoryObj } from "@storybook/react";
import { fn } from "@storybook/test";
import { Circle, Sparkles } from "lucide-react";
import { Tag } from "../components/tag";

const meta = {
  title: "Components/Tag",
  component: Tag,
  parameters: { layout: "centered" },
  args: {
    children: "Active",
    onClose: fn(),
  },
  argTypes: {
    variant: {
      control: "select",
      options: ["default", "neutral", "success", "warning", "error"],
    },
    size: { control: "select", options: ["sm", "md", "lg"] },
    hasClose: { control: "boolean" },
    color: { control: "color" },
  },
} satisfies Meta<typeof Tag>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { args: { variant: "default" } };
export const Neutral: Story = {
  args: { variant: "neutral", children: "Draft" },
};
export const Success: Story = {
  args: { variant: "success", children: "Settled" },
};
export const Warning: Story = {
  args: { variant: "warning", children: "Pending review" },
};
export const ErrorVariant: Story = {
  name: "Error",
  args: { variant: "error", children: "Declined" },
};

export const WithIcon: Story = {
  args: {
    variant: "success",
    icon: <Circle className="h-2 w-2 fill-current" />,
    children: "Live",
  },
};

/** The close button needs `hasClose` **and** `onClose` — either alone renders nothing. */
export const Closable: Story = {
  args: { variant: "neutral", hasClose: true, children: "usd-credit-line" },
};

/** A hex `color` overrides the variant, tinted to 10% for the background. */
export const CustomColor: Story = {
  args: { color: "#7BCBFF", children: "Brand", icon: <Sparkles size={12} /> },
};

/** `max-w-full` + `truncate` keep long labels from blowing out the layout. */
export const Truncated: Story = {
  args: {
    variant: "neutral",
    children: "a-very-long-tag-label-that-overflows",
  },
  render: (args) => (
    <div className="w-40">
      <Tag {...args} />
    </div>
  ),
};

export const Sizes: Story = {
  args: { variant: "default" },
  render: (args) => (
    <div className="flex items-center gap-3">
      <Tag {...args} size="sm">
        Small
      </Tag>
      <Tag {...args} size="md">
        Medium
      </Tag>
      <Tag {...args} size="lg">
        Large
      </Tag>
    </div>
  ),
};

export const AllVariants: Story = {
  args: { hasClose: true },
  render: (args) => (
    <div className="flex flex-col gap-3">
      {(["sm", "md", "lg"] as const).map((size) => (
        <div key={size} className="flex items-center gap-3">
          <Tag {...args} size={size} variant="default">
            Default
          </Tag>
          <Tag {...args} size={size} variant="neutral">
            Neutral
          </Tag>
          <Tag {...args} size={size} variant="success">
            Success
          </Tag>
          <Tag {...args} size={size} variant="warning">
            Warning
          </Tag>
          <Tag {...args} size={size} variant="error">
            Error
          </Tag>
        </div>
      ))}
    </div>
  ),
};

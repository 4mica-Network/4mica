import type { Meta, StoryObj } from "@storybook/react";
import { Button } from "../components/button";
import { Spinner } from "../components/spinner";

const meta = {
  title: "Components/Spinner",
  component: Spinner,
  parameters: { layout: "centered" },
  args: { size: "md" },
  argTypes: {
    size: { control: "select", options: ["sm", "md", "lg", "xl"] },
    title: { control: "text" },
  },
} satisfies Meta<typeof Spinner>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { args: { size: "md" } };

/** Colour comes from `text-current`, so the parent decides it. */
export const OnBrandColor: Story = {
  args: { size: "lg" },
  render: (args) => (
    <div className="text-brand">
      <Spinner {...args} />
    </div>
  ),
};

export const InlineWithText: Story = {
  args: { size: "sm" },
  render: (args) => (
    <p className="flex items-center gap-2 text-ink-muted text-sm">
      <Spinner {...args} />
      Settling invoice…
    </p>
  ),
};

/** `title` is both the `aria-label` and the SVG `<title>`. */
export const CustomTitle: Story = {
  args: { size: "md", title: "Fetching credit line" },
};

export const InsideButton: Story = {
  args: { size: "sm" },
  render: (args) => (
    <Button intent="primary" disabled icon={<Spinner {...args} />}>
      Processing
    </Button>
  ),
};

export const Sizes: Story = {
  args: {},
  render: (args) => (
    <div className="flex items-center gap-6 text-ink-body">
      {(["sm", "md", "lg", "xl"] as const).map((size) => (
        <div key={size} className="flex flex-col items-center gap-2">
          <Spinner {...args} size={size} />
          <span className="text-ink-subtle text-xs">{size}</span>
        </div>
      ))}
    </div>
  ),
};

import type { Meta, StoryObj } from "@storybook/react";
import { fn } from "@storybook/test";
import { Card } from "../components/card";
import { Tag } from "../components/tag";

const meta = {
  title: "Components/Card",
  component: Card,
  parameters: { layout: "centered" },
  args: {
    children: (
      <>
        <p className="font-medium text-ink-strong text-sm">Acme Robotics</p>
        <p className="text-ink-muted text-sm">Credit line · $50,000</p>
      </>
    ),
  },
  decorators: [
    (Story) => (
      <div className="w-80">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Clickable: Story = { args: { onClick: fn() } };

export const WithRichContent: Story = {
  render: (args) => (
    <Card {...args} className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <p className="font-medium text-ink-strong text-sm">INV-2048</p>
        <Tag variant="success" size="sm">
          Settled
        </Tag>
      </div>
      <p className="text-ink-muted text-sm">
        Issued 14 Mar 2026 · Net 30 · Autonomous agent purchase
      </p>
      <p className="font-semibold text-ink-strong text-lg">$4,120.00</p>
    </Card>
  ),
};

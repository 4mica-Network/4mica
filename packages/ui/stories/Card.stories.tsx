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

/** Stacked by default: bottom border only, square bottom corners. */
export const Default: Story = {};

/** Passing `onClick` swaps the `<div>` for a `<button>` with a hover state. */
export const Clickable: Story = { args: { onClick: fn() } };

/** Add `border rounded-lg` for a card that stands on its own. */
export const Standalone: Story = {
  args: { className: "rounded-lg border border-overlay/10" },
};

/** A run of cards reads as one surface — that is what the default style is for. */
export const Stacked: Story = {
  render: (args) => (
    <div className="flex flex-col rounded-lg border border-overlay/10">
      <Card {...args} onClick={fn()}>
        <p className="font-medium text-ink-strong text-sm">Acme Robotics</p>
        <p className="text-ink-muted text-sm">Credit line · $50,000</p>
      </Card>
      <Card {...args} onClick={fn()}>
        <p className="font-medium text-ink-strong text-sm">Northwind Freight</p>
        <p className="text-ink-muted text-sm">Credit line · $12,500</p>
      </Card>
      <Card {...args} onClick={fn()} className="border-b-0">
        <p className="font-medium text-ink-strong text-sm">Globex Labs</p>
        <p className="text-ink-muted text-sm">Credit line · $8,000</p>
      </Card>
    </div>
  ),
};

export const WithRichContent: Story = {
  args: { className: "rounded-lg border border-overlay/10" },
  render: (args) => (
    <Card {...args}>
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

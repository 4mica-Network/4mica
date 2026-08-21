import type { Meta, StoryObj } from "@storybook/react";
import { Stack } from "../components/stack";

const Card = ({ label }: { label: string }) => (
  <div className="rounded-lg border border-overlay/10 bg-surface-solid px-4 py-5 text-ink-body text-sm shadow-sm">
    {label}
  </div>
);

const cards = (count: number) =>
  Array.from({ length: count }, (_, i) => `Card ${i + 1}`).map((label) => (
    <Card key={label} label={label} />
  ));

const meta = {
  title: "Components/Stack",
  component: Stack,
  parameters: { layout: "centered" },
  args: { children: cards(3) },
  argTypes: {
    direction: { control: "inline-radio", options: ["top", "bottom"] },
    growth: { control: "inline-radio", options: ["down", "up"] },
    offset: { control: { type: "range", min: 0, max: 32, step: 2 } },
    depthFactor: { control: { type: "range", min: 0, max: 0.1, step: 0.01 } },
    minScale: { control: { type: "range", min: 0.5, max: 1, step: 0.05 } },
    children: { table: { disable: true } },
  },
  decorators: [
    (Story) => (
      <div className="h-40 w-64">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Stack>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const DirectionBottom: Story = {
  args: { direction: "bottom" },
};

export const GrowthUp: Story = {
  args: { growth: "up" },
};

export const CustomOffset: Story = {
  args: { offset: 16 },
};

export const Depth: Story = {
  render: (args) => (
    <div className="flex gap-10">
      <div className="h-40 w-56">
        <Stack {...args} depthFactor={0.05} />
      </div>
      <div className="h-40 w-56">
        <Stack {...args} depthFactor={0} />
      </div>
    </div>
  ),
};

export const MinScaleClamp: Story = {
  args: { children: cards(40), minScale: 0.8 },
};

export const SingleChild: Story = {
  args: { children: cards(1) },
};

export const ReducedMotion: Story = {};
